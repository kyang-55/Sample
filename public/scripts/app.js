const API = window.location.protocol === "file:"
    ? "http://localhost:3000"
    : "";
const DEFAULT_THEME_PREFERENCE = "light";
let currentUser = null;
let habitDirectory = [];
let isHabitListExpanded = false;

const defaultHabitViewState = {
    search: "",
    category: "",
    favoritesOnly: false,
    sort: "favorites"
};

const habitViewState = { ...defaultHabitViewState };
const defaultChartViewState = {
    habitId: "all",
    rangeDays: "30",
    metric: "completed",
    chartType: "line"
};
const chartViewState = { ...defaultChartViewState };
const suggestionViewState = {
    funOffset: 0
};
let dashboardPreferenceSaveTimer = null;
let isApplyingDashboardPreferences = false;

const HABIT_COLLAPSE_LIMIT = 6;
const HABIT_CATEGORY_PRESETS = [
    "Health",
    "Fitness",
    "Nutrition",
    "Sleep",
    "Mindfulness",
    "Learning",
    "Work",
    "Productivity",
    "Self-care",
    "Finance",
    "Relationships",
    "Home"
];
const HABIT_ICON_CATALOG = [
    { key: "spark", emoji: "✨", label: "Spark" },
    { key: "heart", emoji: "❤️", label: "Heart" },
    { key: "dumbbell", emoji: "🏋️", label: "Dumbbell" },
    { key: "apple", emoji: "🍎", label: "Apple" },
    { key: "moon", emoji: "🌙", label: "Moon" },
    { key: "leaf", emoji: "🍃", label: "Leaf" },
    { key: "book", emoji: "📚", label: "Book" },
    { key: "briefcase", emoji: "💼", label: "Briefcase" },
    { key: "clock", emoji: "⏰", label: "Clock" },
    { key: "wallet", emoji: "💰", label: "Wallet" },
    { key: "users", emoji: "🤝", label: "People" },
    { key: "home", emoji: "🏠", label: "Home" },
    { key: "check", emoji: "✅", label: "Check" }
];

function normalizeThemePreference(value) {
    const normalized = String(value || "").trim().toLowerCase();

    if (normalized === "light" || normalized === "dark") {
        return normalized;
    }

    return DEFAULT_THEME_PREFERENCE;
}

function applyThemePreference(themePreference) {
    const normalized = normalizeThemePreference(themePreference);
    document.body.dataset.theme = normalized;
    document.documentElement.style.colorScheme = normalized;
}

function normalizeDashboardPreferences(value) {
    const fallbackHabitState = {
        search: "",
        category: "",
        favoritesOnly: false,
        sort: "favorites"
    };
    const fallbackChartState = {
        habitId: "all",
        rangeDays: "30",
        metric: "completed",
        chartType: "line"
    };
    const parsed = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const normalized = {
        habit: { ...fallbackHabitState },
        chart: { ...fallbackChartState }
    };
    const habit = parsed.habit && typeof parsed.habit === "object" && !Array.isArray(parsed.habit)
        ? parsed.habit
        : {};
    const chart = parsed.chart && typeof parsed.chart === "object" && !Array.isArray(parsed.chart)
        ? parsed.chart
        : {};

    if (typeof habit.search === "string") {
        normalized.habit.search = habit.search.trim().slice(0, 120);
    }

    if (typeof habit.category === "string") {
        normalized.habit.category = normalizeHabitCategory(habit.category);
    }

    if (habit.favoritesOnly !== undefined) {
        normalized.habit.favoritesOnly = normalizeFavoriteFlag(habit.favoritesOnly);
    }

    if (typeof habit.sort === "string" && [
        "favorites", "newest", "oldest", "name-az", "name-za", "category-az", "streak-desc", "best-streak-desc", "checkins-desc"
    ].includes(habit.sort)) {
        normalized.habit.sort = habit.sort;
    }

    if (typeof chart.habitId === "string" && chart.habitId.trim()) {
        normalized.chart.habitId = chart.habitId.trim();
    }

    if ((typeof chart.rangeDays === "string" || typeof chart.rangeDays === "number") && ["7", "30", "90"].includes(String(chart.rangeDays).trim())) {
        normalized.chart.rangeDays = String(chart.rangeDays).trim();
    }

    if (typeof chart.metric === "string" && ["completed", "rate", "cumulative"].includes(chart.metric)) {
        normalized.chart.metric = chart.metric;
    }

    if (typeof chart.chartType === "string" && ["line", "bar"].includes(chart.chartType)) {
        normalized.chart.chartType = chart.chartType;
    }

    return normalized;
}

function getDashboardPreferencePayload() {
    return normalizeDashboardPreferences({
        habit: habitViewState,
        chart: chartViewState
    });
}

function normalizeHabitLogEntryType(value) {
    const normalized = String(value ?? "").trim().toLowerCase();

    if (!normalized) {
        return "full";
    }

    if (normalized === "full" || normalized === "low_effort") {
        return normalized;
    }

    return "full";
}

function normalizeHabitIcon(value) {
    const normalized = String(value ?? "").trim().toLowerCase();
    return getHabitIconCatalog().some((icon) => icon.key === normalized) ? normalized : "";
}

function getHabitIconCatalog() {
    const catalog = typeof HABIT_ICON_CATALOG !== "undefined"
        ? HABIT_ICON_CATALOG
        : [
            { key: "spark", emoji: "✨", label: "Spark" },
            { key: "heart", emoji: "❤️", label: "Heart" },
            { key: "dumbbell", emoji: "🏋️", label: "Dumbbell" },
            { key: "apple", emoji: "🍎", label: "Apple" },
            { key: "moon", emoji: "🌙", label: "Moon" },
            { key: "leaf", emoji: "🍃", label: "Leaf" },
            { key: "book", emoji: "📚", label: "Book" },
            { key: "briefcase", emoji: "💼", label: "Briefcase" },
            { key: "clock", emoji: "⏰", label: "Clock" },
            { key: "wallet", emoji: "💰", label: "Wallet" },
            { key: "users", emoji: "🤝", label: "People" },
            { key: "home", emoji: "🏠", label: "Home" },
            { key: "check", emoji: "✅", label: "Check" }
        ];

    return catalog.map((icon) => ({ ...icon }));
}

function findHabitIcon(iconKey) {
    const catalog = getHabitIconCatalog();
    return catalog.find((icon) => icon.key === normalizeHabitIcon(iconKey)) || catalog[0];
}

function deriveHabitIconKey(habit) {
    const explicitIcon = normalizeHabitIcon(habit?.icon);
    if (explicitIcon) {
        return explicitIcon;
    }

    const category = normalizeHabitCategory(habit?.category);
    const categoryMap = {
        Health: "heart",
        Fitness: "dumbbell",
        Nutrition: "apple",
        Sleep: "moon",
        Mindfulness: "leaf",
        Learning: "book",
        Work: "briefcase",
        Productivity: "clock",
        "Self-care": "spark",
        Finance: "wallet",
        Relationships: "users",
        Home: "home"
    };

    if (categoryMap[category]) {
        return categoryMap[category];
    }

    const searchText = [habit?.name, habit?.description]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    if (/\b(run|walk|workout|gym|exercise|lift|train)\b/.test(searchText)) return "dumbbell";
    if (/\b(read|study|learn|book|course)\b/.test(searchText)) return "book";
    if (/\bwater|meal|fruit|vegetable|eat|food\b/.test(searchText)) return "apple";
    if (/\bsleep|bed|night|rest\b/.test(searchText)) return "moon";
    if (/\bmindful|breathe|journal|calm|meditat/.test(searchText)) return "leaf";
    if (/\bpay|budget|save|money|finance\b/.test(searchText)) return "wallet";
    if (/\bclean|tidy|laundry|kitchen|home\b/.test(searchText)) return "home";
    if (/\bcall|text|friend|family|partner|relationship\b/.test(searchText)) return "users";
    if (/\btask|project|email|work|meeting\b/.test(searchText)) return "briefcase";

    return "check";
}

function renderHabitIcon(iconKey, habitName = "") {
    const icon = findHabitIcon(iconKey || "check");
    return `<span class="habit-icon" aria-hidden="true" title="${escapeHtml(icon.label)}">${escapeHtml(icon.emoji)}</span>`;
}

function buildSuggestionNameKey(value) {
    return String(value ?? "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function normalizeHabitCategory(value) {
    const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
    return normalized ? normalized.slice(0, 60) : "";
}

function normalizeHabitTags(value) {
    const rawValue = Array.isArray(value) ? value.join(",") : String(value ?? "");
    const tags = [];
    const seen = new Set();

    rawValue
        .split(",")
        .map((tag) => String(tag ?? "").trim().replace(/\s+/g, " "))
        .filter(Boolean)
        .forEach((tag) => {
            const normalizedTag = tag.slice(0, 30);
            const key = normalizedTag.toLowerCase();

            if (seen.has(key)) {
                return;
            }

            seen.add(key);
            tags.push(normalizedTag);
        });

    return tags.slice(0, 12);
}

function normalizeFavoriteFlag(value) {
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (["true", "1", "yes", "on"].includes(normalized)) return true;
        if (["false", "0", "no", "off", ""].includes(normalized)) return false;
    }

    return Boolean(value);
}

function getExistingHabitNameSet(habits) {
    return new Set(
        (Array.isArray(habits) ? habits : [])
            .map((habit) => buildSuggestionNameKey(habit?.name))
            .filter(Boolean)
    );
}

function getCategorySuggestionTemplates() {
    return {
        Health: [
            { name: "Drink water before coffee", description: "Start with one glass of water before your first caffeinated drink.", category: "Health" },
            { name: "Two-minute posture reset", description: "Unclench your shoulders, stretch tall, and reset your posture for two minutes.", category: "Health" }
        ],
        Fitness: [
            { name: "Walk for one song", description: "Take a quick walk for the length of one favorite song.", category: "Fitness" },
            { name: "Five pushups and done", description: "Keep it tiny so movement still feels approachable on busy days.", category: "Fitness" }
        ],
        Nutrition: [
            { name: "Add one colorful food", description: "Work one fruit or vegetable into a meal without overthinking the rest.", category: "Nutrition" },
            { name: "Prep tomorrow's snack", description: "Set up one easy snack now to make tomorrow simpler.", category: "Nutrition" }
        ],
        Sleep: [
            { name: "Phone down 15 minutes earlier", description: "Give yourself a small buffer before bed instead of aiming for a perfect routine.", category: "Sleep" },
            { name: "Three-breath wind-down", description: "Pause for three slow breaths as a gentle cue that the day is ending.", category: "Sleep" }
        ],
        Mindfulness: [
            { name: "Name one good thing", description: "Write or say one thing that felt steady, kind, or useful today.", category: "Mindfulness" },
            { name: "One-minute breathing check-in", description: "Take sixty quiet seconds to slow down and notice how you feel.", category: "Mindfulness" }
        ],
        Learning: [
            { name: "Read one page", description: "Keep your learning streak alive with just a single page.", category: "Learning" },
            { name: "Save one useful note", description: "Capture one idea worth remembering from something you read or watched.", category: "Learning" }
        ],
        Work: [
            { name: "Open the task for 2 minutes", description: "Reduce the friction by just opening the work and starting tiny.", category: "Work" },
            { name: "Clear one small task", description: "Choose one low-resistance task and finish it cleanly.", category: "Work" }
        ],
        Productivity: [
            { name: "Plan your next 3 steps", description: "List only the next three actions instead of mapping the whole day.", category: "Productivity" },
            { name: "Reset one surface", description: "Clear one desk, counter, or table to reduce mental clutter.", category: "Productivity" }
        ],
        "Self-care": [
            { name: "Kind five-minute reset", description: "Do one calming thing that makes the next hour easier.", category: "Self-care" },
            { name: "Stretch and unclench", description: "Loosen your jaw, shoulders, and back for a few quiet minutes.", category: "Self-care" }
        ],
        Finance: [
            { name: "Check one transaction", description: "Stay lightly aware of your money by reviewing just one purchase.", category: "Finance" },
            { name: "Move $1 to savings", description: "Make progress tiny enough that it always feels doable.", category: "Finance" }
        ],
        Relationships: [
            { name: "Send one warm message", description: "Reach out with a quick check-in or thank-you text.", category: "Relationships" },
            { name: "Share one appreciation", description: "Say one specific thing you appreciate about someone close to you.", category: "Relationships" }
        ],
        Home: [
            { name: "Tidy one hotspot", description: "Pick the one messy surface that will make the room feel easier.", category: "Home" },
            { name: "Set out tomorrow's essentials", description: "Make the next morning smoother with a tiny prep ritual.", category: "Home" }
        ]
    };
}

function getFunSuggestionCatalog() {
    return [
        { name: "Dance for one song", description: "Pick a song you love and let that be the whole habit.", category: "Self-care", tone: "playful" },
        { name: "Step outside for 2 minutes", description: "Get a little air and light without turning it into a whole outing.", category: "Health", tone: "gentle" },
        { name: "Doodle for 3 minutes", description: "No outcome, no pressure, just a tiny creative break.", category: "Mindfulness", tone: "playful" },
        { name: "Write one ridiculous sentence", description: "Keep journaling fun by making it silly instead of deep.", category: "Mindfulness", tone: "playful" },
        { name: "Make your bed imperfectly", description: "A fast visual reset counts, even if it is not magazine neat.", category: "Home", tone: "gentle" },
        { name: "Stretch while the kettle heats", description: "Use a tiny waiting window for an easy body reset.", category: "Fitness", tone: "gentle" },
        { name: "Read one paragraph", description: "Stop at one paragraph if you want. More is optional.", category: "Learning", tone: "gentle" },
        { name: "Smile at your future self", description: "Set out one thing that makes tomorrow feel a little kinder.", category: "Self-care", tone: "playful" }
    ];
}

function pickUnusedSuggestions(candidates, existingNames, limit = 3) {
    const selected = [];
    const seen = new Set(existingNames && typeof existingNames[Symbol.iterator] === "function"
        ? Array.from(existingNames)
        : []);

    (Array.isArray(candidates) ? candidates : []).forEach((candidate) => {
        if (selected.length >= limit) {
            return;
        }

        const key = buildSuggestionNameKey(candidate?.name);
        if (!key || seen.has(key)) {
            return;
        }

        seen.add(key);
        selected.push(candidate);
    });

    return selected;
}

function buildPersonalizedSuggestions(habits) {
    const items = Array.isArray(habits) ? habits : [];
    const existingNames = getExistingHabitNameSet(items);
    const templates = getCategorySuggestionTemplates();
    const candidates = [];

    if (items.length === 0) {
        return pickUnusedSuggestions([
            {
                name: "Two-minute morning reset",
                description: "Start with one tiny anchor habit that feels almost too easy to skip.",
                category: "Self-care",
                reason: "A very small first habit makes it easier to build confidence and momentum."
            },
            {
                name: "Drink water after waking",
                description: "A quick, clear habit that fits into most routines without much friction.",
                category: "Health",
                reason: "Simple habits are often the easiest way to establish a dependable rhythm."
            },
            {
                name: "Write tomorrow's top task",
                description: "End the day by deciding the next tiny thing you will do.",
                category: "Productivity",
                reason: "Reducing tomorrow's ambiguity makes showing up feel lighter."
            }
        ], existingNames, 3);
    }

    const strongestHabit = [...items].sort((a, b) => {
        const rateDiff = Number(b?.stats?.completionRate30 || 0) - Number(a?.stats?.completionRate30 || 0);
        if (rateDiff !== 0) return rateDiff;

        return Number(b?.stats?.currentStreak || 0) - Number(a?.stats?.currentStreak || 0);
    })[0];

    const lowEffortHabit = [...items].sort((a, b) => (
        Number(b?.stats?.lowEffortDays || 0) - Number(a?.stats?.lowEffortDays || 0)
    ))[0];

    const staleHabit = items.find((habit) => Number(habit?.stats?.totalCompletions || 0) > 0 && Number(habit?.stats?.currentStreak || 0) === 0);
    const topCategory = [...items]
        .filter((habit) => habit?.category)
        .sort((a, b) => {
            const rateDiff = Number(b?.stats?.completionRate30 || 0) - Number(a?.stats?.completionRate30 || 0);
            if (rateDiff !== 0) return rateDiff;

            return Number(b?.stats?.totalCompletions || 0) - Number(a?.stats?.totalCompletions || 0);
        })[0]?.category || "";

    if (topCategory && Array.isArray(templates[topCategory])) {
        templates[topCategory].forEach((template) => {
            candidates.push({
                ...template,
                reason: `You tend to stay most consistent with ${topCategory.toLowerCase()} habits, so this is a strong place to grow your routine.`
            });
        });
    }

    if (lowEffortHabit && Number(lowEffortHabit?.stats?.lowEffortDays || 0) > 0) {
        candidates.push({
            name: `2-minute ${lowEffortHabit.name}`,
            description: `A gentler version of ${lowEffortHabit.name} for days when energy is low but you still want to keep the rhythm.`,
            category: lowEffortHabit.category || "Self-care",
            reason: `You have used low-effort days with ${lowEffortHabit.name}, which suggests smaller versions may help you stay consistent.`
        });
    }

    if (staleHabit) {
        candidates.push({
            name: `Restart ${staleHabit.name} softly`,
            description: `Bring ${staleHabit.name} back in a lighter, easier form that feels less intimidating.`,
            category: staleHabit.category || "Self-care",
            reason: `${staleHabit.name} has past momentum, so a softer restart could help you reconnect without pressure.`
        });
    }

    if (strongestHabit) {
        candidates.push({
            name: `One-minute follow-up to ${strongestHabit.name}`,
            description: `Attach a tiny companion habit right after ${strongestHabit.name} to build on momentum you already have.`,
            category: strongestHabit.category || topCategory || "Productivity",
            reason: `${strongestHabit.name} already has some traction, so stacking a tiny next step can make the routine feel natural.`
        });
    }

    return pickUnusedSuggestions(candidates, existingNames, 3);
}

function buildFunSuggestions(habits, offset = 0, limit = 4) {
    const existingNames = getExistingHabitNameSet(habits);
    const catalog = getFunSuggestionCatalog().filter((suggestion) => !existingNames.has(buildSuggestionNameKey(suggestion.name)));

    if (catalog.length === 0) {
        return [];
    }

    const start = ((Number(offset) || 0) % catalog.length + catalog.length) % catalog.length;
    const rotated = catalog.slice(start).concat(catalog.slice(0, start));
    return rotated.slice(0, Math.min(limit, rotated.length));
}

function normalizeHabitRecord(habit) {
    return {
        ...habit,
        category: normalizeHabitCategory(habit?.category),
        icon: normalizeHabitIcon(habit?.icon),
        tags: normalizeHabitTags(habit?.tags),
        isFavorite: normalizeFavoriteFlag(habit?.isFavorite)
    };
}

function buildHabitSearchText(habit) {
    return [
        habit?.name,
        habit?.description,
        habit?.category,
        ...(Array.isArray(habit?.tags) ? habit.tags : [])
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
}

function filterHabits(habits, filters) {
    const activeFilters = filters || {};
    const search = String(activeFilters.search ?? "").trim().toLowerCase();
    const category = normalizeHabitCategory(activeFilters.category);
    const favoritesOnly = normalizeFavoriteFlag(activeFilters.favoritesOnly);
    const tag = String(activeFilters.tag ?? "").trim();

    return habits.filter((habit) => {
        if (search && !buildHabitSearchText(habit).includes(search)) {
            return false;
        }

        if (category && habit.category !== category) {
            return false;
        }

        if (favoritesOnly && !normalizeFavoriteFlag(habit?.isFavorite)) {
            return false;
        }

        if (tag && !habit.tags.includes(tag)) {
            return false;
        }

        return true;
    });
}

function sortHabits(habits, sortValue = "newest") {
    const sortedHabits = [...habits];

    sortedHabits.sort((a, b) => {
        const nameA = String(a?.name ?? "");
        const nameB = String(b?.name ?? "");
        const categoryA = String(a?.category ?? "");
        const categoryB = String(b?.category ?? "");
        const statsA = a?.stats || {};
        const statsB = b?.stats || {};
        const favoriteDiff = Number(Boolean(b?.isFavorite)) - Number(Boolean(a?.isFavorite));

        if (sortValue === "favorites") {
            if (favoriteDiff !== 0) return favoriteDiff;

            return Number(b?.id ?? 0) - Number(a?.id ?? 0);
        }

        if (sortValue === "oldest") {
            return Number(a?.id ?? 0) - Number(b?.id ?? 0);
        }

        if (sortValue === "name-az") {
            return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
        }

        if (sortValue === "name-za") {
            return nameB.localeCompare(nameA, undefined, { sensitivity: "base" });
        }

        if (sortValue === "category-az") {
            const emptyDiff = Number(!categoryA) - Number(!categoryB);
            if (emptyDiff !== 0) return emptyDiff;

            const categoryDiff = categoryA.localeCompare(categoryB, undefined, { sensitivity: "base" });
            if (categoryDiff !== 0) return categoryDiff;

            return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
        }

        if (sortValue === "streak-desc") {
            const streakDiff = Number(statsB.currentStreak ?? 0) - Number(statsA.currentStreak ?? 0);
            if (streakDiff !== 0) return streakDiff;

            return Number(statsB.longestStreak ?? 0) - Number(statsA.longestStreak ?? 0);
        }

        if (sortValue === "best-streak-desc") {
            const streakDiff = Number(statsB.longestStreak ?? 0) - Number(statsA.longestStreak ?? 0);
            if (streakDiff !== 0) return streakDiff;

            return Number(statsB.currentStreak ?? 0) - Number(statsA.currentStreak ?? 0);
        }

        if (sortValue === "checkins-desc") {
            const checkInDiff = Number(statsB.totalCompletions ?? 0) - Number(statsA.totalCompletions ?? 0);
            if (checkInDiff !== 0) return checkInDiff;

            return Number(statsB.completionRate30 ?? 0) - Number(statsA.completionRate30 ?? 0);
        }

        return Number(b?.id ?? 0) - Number(a?.id ?? 0);
    });

    return sortedHabits;
}

function shouldCollapseHabitList(habitsOrCount, collapseLimit = 6) {
    const totalHabits = Array.isArray(habitsOrCount)
        ? habitsOrCount.length
        : Number(habitsOrCount || 0);

    return totalHabits > collapseLimit;
}

function getVisibleHabitSlice(habits, isExpanded, collapseLimit = 6) {
    const items = Array.isArray(habits) ? habits : [];

    if (isExpanded || !shouldCollapseHabitList(items.length, collapseLimit)) {
        return [...items];
    }

    return items.slice(0, collapseLimit);
}

function formatLocalDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function addDays(isoDate, days) {
    const [year, month, day] = isoDate.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + days);
    return formatLocalDate(date);
}

function dateDiffInDays(fromIso, toIso) {
    const [fromYear, fromMonth, fromDay] = fromIso.split("-").map(Number);
    const [toYear, toMonth, toDay] = toIso.split("-").map(Number);
    const fromDate = new Date(fromYear, fromMonth - 1, fromDay);
    const toDate = new Date(toYear, toMonth - 1, toDay);
    const msPerDay = 24 * 60 * 60 * 1000;

    return Math.round((toDate - fromDate) / msPerDay);
}

function getCurrentStreak(sortedDates, todayIso) {
    if (sortedDates.length === 0) return 0;

    const latest = sortedDates[sortedDates.length - 1];
    const yesterdayIso = addDays(todayIso, -1);

    if (latest !== todayIso && latest !== yesterdayIso) {
        return 0;
    }

    let streak = 1;
    for (let i = sortedDates.length - 1; i > 0; i -= 1) {
        const gap = dateDiffInDays(sortedDates[i - 1], sortedDates[i]);
        if (gap === 1) streak += 1;
        else break;
    }

    return streak;
}

function getLongestStreak(sortedDates) {
    if (sortedDates.length === 0) return 0;

    let longest = 1;
    let current = 1;

    for (let i = 1; i < sortedDates.length; i += 1) {
        const gap = dateDiffInDays(sortedDates[i - 1], sortedDates[i]);
        if (gap === 1) {
            current += 1;
            longest = Math.max(longest, current);
        } else if (gap > 1) {
            current = 1;
        }
    }

    return longest;
}

function getRateInWindow(logSet, todayIso, windowDays) {
    let completed = 0;

    for (let i = 0; i < windowDays; i += 1) {
        const date = addDays(todayIso, -i);
        if (logSet.has(date)) completed += 1;
    }

    return Math.round((completed / windowDays) * 100);
}

function buildCalendarHtml(logSet, todayIso) {
    const entryTypesByDate = logSet instanceof Set
        ? new Map([...logSet].map((date) => [date, "full"]))
        : logSet instanceof Map
            ? logSet
            : new Map();
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const monthName = now.toLocaleString(undefined, { month: "long" });
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDay = new Date(year, month, 1).getDay();

    const weekdayRow = ["S", "M", "T", "W", "T", "F", "S"]
        .map((day) => `<div class="calendar-weekday">${day}</div>`)
        .join("");

    const cells = [];

    for (let i = 0; i < startDay; i += 1) {
        cells.push('<div class="calendar-day calendar-day--empty"></div>');
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
        const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const entryType = entryTypesByDate.get(iso) || "";
        const doneClass = entryType === "low_effort"
            ? " calendar-day--low-effort"
            : entryTypesByDate.has(iso)
                ? " calendar-day--done"
                : "";
        const todayClass = iso === todayIso ? " calendar-day--today" : "";
        cells.push(`<div class="calendar-day${doneClass}${todayClass}">${day}</div>`);
    }

    return `
        <div class="calendar-title">${monthName} ${year}</div>
        <div class="calendar-grid">${weekdayRow}${cells.join("")}</div>
    `;
}

async function readJson(res) {
    const text = await res.text();
    try {
        return text ? JSON.parse(text) : {};
    } catch {
        return {};
    }
}

async function authFetch(url, options = {}) {
    const res = await fetch(`${API}${url}`, {
        ...options,
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });

    if (res.status === 401) {
        window.location.replace("./login.html");
        throw new Error("Authentication required.");
    }

    return res;
}

function toggleDashboardVisibility(isAuthenticated) {
    ["plannerHeader", "addHabitForm", "habitsHeader", "habitControls", "progressPanel", "suggestionsPanel", "habitList"].forEach((id) => {
        document.getElementById(id)?.classList.toggle("hidden", !isAuthenticated);
    });

    if (!isAuthenticated) {
        document.getElementById("adminPanel")?.classList.add("hidden");
    }
}

function renderAccountPanel() {
    const welcomeMessage = document.getElementById("welcomeMessage");
    const roleMessage = document.getElementById("roleMessage");
    const registerButton = document.getElementById("registerButton");
    const loginButton = document.getElementById("loginButton");
    const profileButton = document.getElementById("profileButton");
    const pastActivityButton = document.getElementById("pastActivityButton");
    const logoutButton = document.getElementById("logoutButton");

    if (currentUser) {
        welcomeMessage.textContent = `Signed in as ${currentUser.name}`;
        roleMessage.textContent = `Role: ${currentUser.role}`;
        registerButton.classList.add("hidden");
        loginButton.classList.add("hidden");
        profileButton.classList.remove("hidden");
        pastActivityButton.classList.remove("hidden");
        logoutButton.classList.remove("hidden");
        return;
    }

    welcomeMessage.textContent = "Ready to get started?";
    roleMessage.textContent = "Register for a new account or log in to manage your habits.";
    registerButton.classList.remove("hidden");
    loginButton.classList.remove("hidden");
    profileButton.classList.add("hidden");
    pastActivityButton.classList.add("hidden");
    logoutButton.classList.add("hidden");
}

async function fetchCurrentUser() {
    const res = await fetch(`${API}/auth/me`, {
        method: "GET",
        credentials: "include"
    });

    if (!res.ok) {
        currentUser = null;
        return null;
    }

    const data = await readJson(res);
    currentUser = data.user
        ? {
            ...data.user,
            dashboardPreferences: normalizeDashboardPreferences(data.user.dashboardPreferences),
            themePreference: normalizeThemePreference(data.user.themePreference)
        }
        : null;
    return currentUser;
}

function applyDashboardPreferences(preferences) {
    const normalized = normalizeDashboardPreferences(preferences);
    isApplyingDashboardPreferences = true;

    Object.assign(habitViewState, normalized.habit);
    Object.assign(chartViewState, normalized.chart);
    syncDashboardPreferenceInputs();

    isApplyingDashboardPreferences = false;
}

async function saveDashboardPreferences() {
    if (!currentUser || isApplyingDashboardPreferences) {
        return;
    }

    const res = await authFetch("/preferences/dashboard", {
        method: "PATCH",
        body: JSON.stringify({ preferences: getDashboardPreferencePayload() })
    });
    const data = await readJson(res);

    if (!res.ok) {
        showFeedback(data.error || "Unable to save dashboard preferences.");
        return;
    }

    currentUser = {
        ...currentUser,
        dashboardPreferences: normalizeDashboardPreferences(data.preferences)
    };
}

function scheduleDashboardPreferenceSave(delayMs = 250) {
    if (!currentUser || isApplyingDashboardPreferences) {
        return;
    }

    window.clearTimeout(dashboardPreferenceSaveTimer);
    dashboardPreferenceSaveTimer = window.setTimeout(() => {
        saveDashboardPreferences().catch(() => {});
    }, delayMs);
}

function syncDashboardPreferenceInputs() {
    const searchInput = document.getElementById("habitSearch");
    const categoryFilter = document.getElementById("habitCategoryFilter");
    const favoriteOnlyFilter = document.getElementById("favoriteOnlyFilter");
    const sortSelect = document.getElementById("habitSort");
    const chartHabitFilter = document.getElementById("chartHabitFilter");
    const chartRangeFilter = document.getElementById("chartRangeFilter");
    const chartMetricFilter = document.getElementById("chartMetricFilter");
    const chartTypeFilter = document.getElementById("chartTypeFilter");

    if (searchInput) searchInput.value = habitViewState.search;
    if (categoryFilter) categoryFilter.value = habitViewState.category;
    if (favoriteOnlyFilter) favoriteOnlyFilter.checked = habitViewState.favoritesOnly;
    if (sortSelect) sortSelect.value = habitViewState.sort;
    if (chartHabitFilter) chartHabitFilter.value = chartViewState.habitId;
    if (chartRangeFilter) chartRangeFilter.value = chartViewState.rangeDays;
    if (chartMetricFilter) chartMetricFilter.value = chartViewState.metric;
    if (chartTypeFilter) chartTypeFilter.value = chartViewState.chartType;
}

async function ensureAuthenticated() {
    const user = await fetchCurrentUser();
    applyThemePreference(user?.themePreference);
    renderAccountPanel();
    toggleDashboardVisibility(Boolean(user));
    return user;
}

async function fetchHabitLogs(habitId) {
    const res = await authFetch(`/habits/${habitId}/logs`);
    const data = await readJson(res);

    if (!res.ok) {
        throw new Error(data.error || "Failed to load logs");
    }

    return Array.isArray(data)
        ? data
            .map((row) => ({
                completion_date: String(row?.completion_date ?? "").trim(),
                entry_type: normalizeHabitLogEntryType(row?.entry_type)
            }))
            .filter((row) => row.completion_date)
        : [];
}

function calculateHabitStats(logDates) {
    const normalizedLogs = new Map();

    (Array.isArray(logDates) ? logDates : []).forEach((entry) => {
        if (typeof entry === "string") {
            const isoDate = String(entry).trim();
            if (isoDate) {
                normalizedLogs.set(isoDate, "full");
            }
            return;
        }

        const isoDate = String(entry?.completion_date ?? "").trim();
        if (!isoDate) {
            return;
        }

        normalizedLogs.set(isoDate, normalizeHabitLogEntryType(entry?.entry_type));
    });

    const sortedDates = [...normalizedLogs.keys()].sort();
    const logSet = new Set(sortedDates);
    const logTypeMap = new Map([...normalizedLogs.entries()]);
    const todayIso = formatLocalDate(new Date());
    const todayEntryType = logTypeMap.get(todayIso) || "";
    const lowEffortDays = [...logTypeMap.values()].filter((entryType) => entryType === "low_effort").length;

    return {
        doneToday: logSet.has(todayIso),
        todayEntryType,
        currentStreak: getCurrentStreak(sortedDates, todayIso),
        longestStreak: getLongestStreak(sortedDates),
        completionRate7: getRateInWindow(logSet, todayIso, 7),
        completionRate30: getRateInWindow(logSet, todayIso, 30),
        totalCompletions: sortedDates.length,
        lowEffortDays,
        calendarHtml: buildCalendarHtml(logTypeMap, todayIso)
    };
}

function getChartRangeDays(value) {
    const days = Number(value);
    return Number.isInteger(days) && days > 0 ? days : 30;
}

function buildDateRange(endIso, rangeDays) {
    const safeRangeDays = Math.max(1, Number(rangeDays) || 1);
    const dates = [];

    for (let offset = safeRangeDays - 1; offset >= 0; offset -= 1) {
        dates.push(addDays(endIso, -offset));
    }

    return dates;
}

function getChartMetricMeta(metric) {
    if (metric === "rate") {
        return {
            label: "Daily consistency rate",
            description: "See what percentage of your selected habits were completed on each day in the chosen range.",
            summaryLabel: "Average consistency",
            suffix: "%"
        };
    }

    if (metric === "cumulative") {
        return {
            label: "Cumulative logged days",
            description: "Watch your selected completions and low-effort saves accumulate across the chosen range to see whether momentum is building steadily.",
            summaryLabel: "Total logged days",
            suffix: ""
        };
    }

    return {
        label: "Logged habits per day",
        description: "Track how many of your selected habits had either a full completion or a low-effort save on each day in the chosen range.",
        summaryLabel: "Daily average",
        suffix: ""
    };
}

function formatMetricValue(value, metric) {
    const rounded = metric === "rate"
        ? Math.round(Number(value) || 0)
        : Math.round(Number(value) || 0);

    return metric === "rate" ? `${rounded}%` : String(rounded);
}

function formatChartDateLabel(isoDate, short = false) {
    const [year, month, day] = String(isoDate || "").split("-").map(Number);

    if (!year || !month || !day) {
        return "";
    }

    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString(undefined, short
        ? { month: "short", day: "numeric" }
        : { month: "short", day: "numeric", year: "numeric" });
}

function calculateCurrentRun(points) {
    let run = 0;

    for (let index = points.length - 1; index >= 0; index -= 1) {
        if (Number(points[index]?.completedHabits || 0) > 0) {
            run += 1;
        } else {
            break;
        }
    }

    return run;
}

function buildConsistencySeries(habits, options = {}) {
    const metric = options.metric || "completed";
    const selectedHabitId = String(options.habitId ?? "all");
    const rangeDays = getChartRangeDays(options.rangeDays ?? options.range ?? defaultChartViewState.rangeDays);
    const endIso = options.endIso || formatLocalDate(new Date());
    const selectedHabits = selectedHabitId === "all"
        ? [...(Array.isArray(habits) ? habits : [])]
        : (Array.isArray(habits) ? habits : []).filter((habit) => String(habit?.id) === selectedHabitId);
    const dates = buildDateRange(endIso, rangeDays);
    const preparedHabits = selectedHabits.map((habit) => ({
        ...habit,
        logSet: habit?.logSet instanceof Set
            ? habit.logSet
            : new Set(
                (Array.isArray(habit?.logs) ? habit.logs : [])
                    .map((entry) => typeof entry === "string" ? entry : entry?.completion_date)
                    .filter(Boolean)
            )
    }));

    let cumulativeTotal = 0;
    const points = dates.map((isoDate) => {
        const completedHabits = preparedHabits.reduce((sum, habit) => (
            sum + Number(habit.logSet.has(isoDate))
        ), 0);

        cumulativeTotal += completedHabits;

        let value = completedHabits;
        if (metric === "rate") {
            value = preparedHabits.length === 0
                ? 0
                : Math.round((completedHabits / preparedHabits.length) * 100);
        } else if (metric === "cumulative") {
            value = cumulativeTotal;
        }

        return {
            isoDate,
            label: formatChartDateLabel(isoDate, true),
            completedHabits,
            value
        };
    });

    return {
        metric,
        rangeDays,
        endIso,
        habitCount: preparedHabits.length,
        points,
        meta: getChartMetricMeta(metric)
    };
}

function calculateChartSummary(series) {
    const points = Array.isArray(series?.points) ? series.points : [];
    const habitCount = Number(series?.habitCount || 0);
    const totalCompletions = points.reduce((sum, point) => sum + Number(point?.completedHabits || 0), 0);
    const activeDays = points.filter((point) => Number(point?.completedHabits || 0) > 0).length;
    const averageConsistency = habitCount === 0 || points.length === 0
        ? 0
        : Math.round((totalCompletions / (habitCount * points.length)) * 100);
    const currentRun = calculateCurrentRun(points);
    const peakPoint = points.reduce((best, point) => (
        !best || Number(point?.value || 0) > Number(best?.value || 0) ? point : best
    ), null);

    return {
        totalCompletions,
        activeDays,
        averageConsistency,
        currentRun,
        peakValue: Number(peakPoint?.value || 0),
        peakLabel: peakPoint?.isoDate ? formatChartDateLabel(peakPoint.isoDate) : "No activity yet"
    };
}

function buildChartSvg(series, chartType = "line") {
    const points = Array.isArray(series?.points) ? series.points : [];

    if (points.length === 0) {
        return "";
    }

    const width = 960;
    const height = 320;
    const padding = { top: 20, right: 18, bottom: 44, left: 50 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const rawMax = Math.max(...points.map((point) => Number(point?.value || 0)), 0);
    const maxValue = series?.metric === "rate"
        ? 100
        : Math.max(1, Math.ceil(rawMax / 5) * 5 || 1);
    const tickCount = 4;
    const xStep = points.length > 1 ? plotWidth / (points.length - 1) : plotWidth / 2;
    const barWidth = Math.max(10, Math.min(28, plotWidth / Math.max(points.length * 1.6, 1)));
    const linePoints = points.map((point, index) => {
        const x = points.length === 1
            ? padding.left + (plotWidth / 2)
            : padding.left + (index * xStep);
        const y = padding.top + plotHeight - ((Number(point?.value || 0) / maxValue) * plotHeight);
        return {
            ...point,
            x,
            y
        };
    });

    const gridLines = Array.from({ length: tickCount + 1 }, (_, index) => {
        const ratio = index / tickCount;
        const value = Math.round(maxValue - (ratio * maxValue));
        const y = padding.top + (ratio * plotHeight);

        return `
            <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" class="chart-grid-line"></line>
            <text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" class="chart-axis-label">${escapeHtml(formatMetricValue(value, series.metric))}</text>
        `;
    }).join("");

    const xLabelIndexes = new Set([
        0,
        Math.max(0, Math.floor((points.length - 1) / 3)),
        Math.max(0, Math.floor(((points.length - 1) * 2) / 3)),
        Math.max(0, points.length - 1)
    ]);
    const xLabels = linePoints
        .filter((_, index) => xLabelIndexes.has(index))
        .map((point) => `
            <text x="${point.x}" y="${height - 14}" text-anchor="middle" class="chart-axis-label">${escapeHtml(point.label)}</text>
        `)
        .join("");

    const bars = chartType === "bar"
        ? linePoints.map((point) => {
            const barHeight = height - padding.bottom - point.y;
            const x = point.x - (barWidth / 2);
            return `
                <rect x="${x}" y="${point.y}" width="${barWidth}" height="${Math.max(barHeight, 0)}" rx="8" class="chart-bar">
                    <title>${escapeHtml(formatChartDateLabel(point.isoDate))}: ${escapeHtml(formatMetricValue(point.value, series.metric))}</title>
                </rect>
            `;
        }).join("")
        : "";

    const linePath = chartType === "line"
        ? linePoints.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ")
        : "";
    const areaPath = chartType === "line"
        ? `${linePath} L ${linePoints[linePoints.length - 1].x} ${height - padding.bottom} L ${linePoints[0].x} ${height - padding.bottom} Z`
        : "";
    const dots = chartType === "line"
        ? linePoints.map((point) => `
            <circle cx="${point.x}" cy="${point.y}" r="4.5" class="chart-dot">
                <title>${escapeHtml(formatChartDateLabel(point.isoDate))}: ${escapeHtml(formatMetricValue(point.value, series.metric))}</title>
            </circle>
        `).join("")
        : "";

    return `
        <svg viewBox="0 0 ${width} ${height}" class="chart-svg" aria-hidden="true">
            <defs>
                <linearGradient id="chartFillGradient" x1="0%" x2="0%" y1="0%" y2="100%">
                    <stop offset="0%" stop-color="rgba(93, 107, 255, 0.34)"></stop>
                    <stop offset="100%" stop-color="rgba(93, 107, 255, 0.02)"></stop>
                </linearGradient>
            </defs>
            ${gridLines}
            <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" class="chart-axis-line"></line>
            ${chartType === "line" ? `<path d="${areaPath}" class="chart-area"></path>` : ""}
            ${chartType === "line" ? `<path d="${linePath}" class="chart-line"></path>` : ""}
            ${bars}
            ${dots}
            ${xLabels}
        </svg>
    `;
}

function renderHabitCard(habit) {
    const stats = habit.stats || calculateHabitStats([]);
    const div = document.createElement("div");
    div.className = `habit-card${stats.todayEntryType === "full" ? " habit-card--done" : ""}${stats.todayEntryType === "low_effort" ? " habit-card--low-effort" : ""}`;
    div.dataset.id = habit.id;
    div.dataset.name = habit.name || "";
    div.dataset.description = habit.description || "";
    div.dataset.category = habit.category || "";
    div.dataset.icon = normalizeHabitIcon(habit.icon) || "";
    div.dataset.isFavorite = String(habit.isFavorite);
    const derivedIconKey = deriveHabitIconKey(habit);

    const isDoneToday = stats.todayEntryType === "full";
    const isLowEffortToday = stats.todayEntryType === "low_effort";
    const statusLabel = isDoneToday
        ? "Done today"
        : isLowEffortToday
            ? "Streak protected today"
            : "Not logged today";
    const statusClass = isDoneToday
        ? "status-pill--done"
        : isLowEffortToday
            ? "status-pill--low-effort"
            : "status-pill--pending";
    const logButtonLabel = isDoneToday
        ? "Done"
        : isLowEffortToday
            ? "Upgrade to full"
            : "Complete";
    const lowEffortButtonLabel = isLowEffortToday ? "Low-effort saved" : "Low-effort day";
    const canUndoToday = stats.doneToday;
    const streakProtectionNote = isLowEffortToday
        ? '<p class="habit-protection-note">Protected by a low-effort day, so your streak stays intact.</p>'
        : "";

    const metaPills = [
        habit.isFavorite
            ? '<span class="habit-meta-pill habit-meta-pill--favorite">Favorite</span>'
            : "",
        habit.category
            ? `<span class="habit-meta-pill habit-meta-pill--category">Category: ${escapeHtml(habit.category)}</span>`
            : "",
        isLowEffortToday
            ? '<span class="habit-meta-pill habit-meta-pill--protected">Streak protected</span>'
            : ""
    ].filter(Boolean).join("");

    div.innerHTML = `
        <div class="habit-top">
            <div class="habit-info">
                <div class="habit-title-row">
                    ${renderHabitIcon(derivedIconKey, habit.name)}
                    <div class="habit-name">${escapeHtml(habit.name)}</div>
                </div>
                <div class="habit-description">${escapeHtml(habit.description || "")}</div>
                ${metaPills ? `<div class="habit-meta-row">${metaPills}</div>` : ""}
                <div class="habit-status-row">
                    <span class="status-pill ${statusClass}">
                        ${statusLabel}
                    </span>
                    <span class="habit-total">${stats.totalCompletions} streak-saving check-ins</span>
                </div>
                ${streakProtectionNote}
            </div>
            <div class="habit-actions">
                <button
                    class="btn btn-favorite${habit.isFavorite ? " btn-favorite--active" : ""}"
                    type="button"
                    aria-pressed="${habit.isFavorite ? "true" : "false"}"
                    aria-label="${habit.isFavorite ? "Unstar habit" : "Star habit"}"
                    onclick="toggleFavoriteHabit(${habit.id}, ${habit.isFavorite ? "false" : "true"})"
                >
                    ${habit.isFavorite ? "★ Starred" : "☆ Star"}
                </button>
                <button class="btn btn-log" onclick="logHabit(${habit.id}, 'full')" ${isDoneToday ? "disabled" : ""}>
                    ${logButtonLabel}
                </button>
                <button class="btn btn-low-effort" onclick="logHabit(${habit.id}, 'low_effort')" ${(isDoneToday || isLowEffortToday) ? "disabled" : ""}>
                    ${lowEffortButtonLabel}
                </button>
                <button class="btn btn-undo" onclick="undoHabitLog(${habit.id})" ${canUndoToday ? "" : "disabled"}>
                    Undo
                </button>
                <button class="btn btn-edit" onclick="editHabit(${habit.id})">Edit</button>
                <button class="btn btn-delete" onclick="deleteHabit(${habit.id})">Delete</button>
            </div>
        </div>

        <div class="habit-stats">
            <div class="stat-chip"><span>Current streak</span><strong>${stats.currentStreak}d</strong></div>
            <div class="stat-chip"><span>Best streak</span><strong>${stats.longestStreak}d</strong></div>
            <div class="stat-chip"><span>Last 7 days</span><strong>${stats.completionRate7}%</strong></div>
            <div class="stat-chip"><span>Last 30 days</span><strong>${stats.completionRate30}%</strong></div>
            <div class="stat-chip"><span>Low-effort days</span><strong>${stats.lowEffortDays}</strong></div>
        </div>

        <div class="habit-calendar">${stats.calendarHtml}</div>
    `;

    return div;
}

function renderSelectOptions(selectElement, values, defaultLabel) {
    const currentValue = selectElement.value;
    const optionMarkup = values
        .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
        .join("");

    selectElement.innerHTML = `<option value="">${escapeHtml(defaultLabel)}</option>${optionMarkup}`;
    selectElement.value = values.includes(currentValue) ? currentValue : "";
}

function createSuggestionCard(suggestion) {
    const article = document.createElement("article");
    article.className = "suggestion-card";

    const eyebrow = document.createElement("span");
    eyebrow.className = "suggestion-card__eyebrow";
    eyebrow.textContent = suggestion.category || "Suggestion";

    const title = document.createElement("h5");
    title.className = "suggestion-card__title";
    title.textContent = suggestion.name || "Helpful idea";

    const description = document.createElement("p");
    description.className = "suggestion-card__description";
    description.textContent = suggestion.description || "";

    const reason = document.createElement("p");
    reason.className = "suggestion-card__reason";
    reason.textContent = suggestion.reason || "A small idea to make routine-building feel lighter.";

    const actions = document.createElement("div");
    actions.className = "suggestion-card__actions";

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "btn btn-primary";
    addButton.textContent = "Add as habit";
    addButton.addEventListener("click", () => {
        addSuggestedHabit(suggestion);
    });

    actions.appendChild(addButton);
    article.appendChild(eyebrow);
    article.appendChild(title);
    article.appendChild(description);
    article.appendChild(reason);
    article.appendChild(actions);

    return article;
}

function renderSuggestionList(containerId, suggestions, emptyMessage) {
    const container = document.getElementById(containerId);

    if (!container) {
        return;
    }

    container.innerHTML = "";

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
        container.innerHTML = `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
        return;
    }

    suggestions.forEach((suggestion) => {
        container.appendChild(createSuggestionCard(suggestion));
    });
}

function renderSuggestionsPanel() {
    const personalizedSuggestions = buildPersonalizedSuggestions(habitDirectory);
    const funSuggestions = buildFunSuggestions(habitDirectory, suggestionViewState.funOffset, 4);

    renderSuggestionList(
        "personalizedSuggestions",
        personalizedSuggestions,
        "Keep checking in and we will start shaping ideas around your real routine."
    );
    renderSuggestionList(
        "funSuggestions",
        funSuggestions,
        "You have already added the current fun ideas. Shuffle again after you try a few."
    );
}

function syncHabitCategoryPresetSelection() {
    const categoryInput = document.getElementById("habitCategory");
    const categoryPreset = document.getElementById("habitCategoryPreset");

    if (!categoryInput || !categoryPreset) {
        return;
    }

    const normalizedCategory = normalizeHabitCategory(categoryInput.value);
    const matchingPreset = HABIT_CATEGORY_PRESETS.find((preset) => preset === normalizedCategory);

    categoryPreset.value = matchingPreset || "";
}

function bindHabitComposer() {
    const categoryInput = document.getElementById("habitCategory");
    const categoryPreset = document.getElementById("habitCategoryPreset");
    const iconSelect = document.getElementById("habitIcon");

    if (!categoryInput || !categoryPreset || !iconSelect) {
        return;
    }

    renderSelectOptions(categoryPreset, HABIT_CATEGORY_PRESETS, "Choose a preset category (optional)");
    iconSelect.innerHTML = `<option value="">Choose an icon (optional)</option>${getHabitIconCatalog()
        .map((icon) => `<option value="${escapeHtml(icon.key)}">${escapeHtml(`${icon.emoji} ${icon.label}`)}</option>`)
        .join("")}`;
    syncHabitCategoryPresetSelection();

    categoryPreset.addEventListener("change", (event) => {
        const selectedCategory = normalizeHabitCategory(event.target.value);
        if (!selectedCategory) {
            return;
        }

        categoryInput.value = selectedCategory;
        syncHabitCategoryPresetSelection();
    });

    categoryInput.addEventListener("input", () => {
        syncHabitCategoryPresetSelection();
    });
}

function hasActiveHabitFilters() {
    return Boolean(
        habitViewState.search
        || habitViewState.category
        || habitViewState.favoritesOnly
        || habitViewState.sort !== defaultHabitViewState.sort
    );
}

function updateHabitFilterSummary(visibleCount, totalCount) {
    const summary = document.getElementById("habitFilterSummary");
    const clearButton = document.getElementById("clearHabitFilters");

    if (!summary || !clearButton) {
        return;
    }

    if (totalCount === 0) {
        summary.textContent = "Add your first habit to build a searchable routine library.";
    } else if (habitViewState.favoritesOnly && hasActiveHabitFilters()) {
        summary.textContent = `Showing ${visibleCount} favorite ${visibleCount === 1 ? "habit" : "habits"} out of ${totalCount}.`;
    } else if (hasActiveHabitFilters()) {
        summary.textContent = `Showing ${visibleCount} of ${totalCount} habits.`;
    } else {
        summary.textContent = `Showing all ${totalCount} habits.`;
    }

    clearButton.disabled = !hasActiveHabitFilters();
}

function updateHabitFilterOptions() {
    const categoryFilter = document.getElementById("habitCategoryFilter");

    if (!categoryFilter) {
        return;
    }

    const categories = [...new Set(habitDirectory.map((habit) => habit.category).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

    renderSelectOptions(categoryFilter, categories, "All categories");

    if (!categories.includes(habitViewState.category)) {
        habitViewState.category = "";
        categoryFilter.value = "";
    }
}

function updateChartHabitOptions() {
    const habitFilter = document.getElementById("chartHabitFilter");

    if (!habitFilter) {
        return;
    }

    const currentValue = String(chartViewState.habitId ?? defaultChartViewState.habitId);
    const options = sortHabits(habitDirectory, "name-az")
        .map((habit) => `<option value="${escapeHtml(String(habit.id))}">${escapeHtml(habit.name || `Habit ${habit.id}`)}</option>`)
        .join("");

    habitFilter.innerHTML = `<option value="all">All habits</option>${options}`;
    habitFilter.value = currentValue === "all" || habitDirectory.some((habit) => String(habit.id) === currentValue)
        ? currentValue
        : "all";
    chartViewState.habitId = habitFilter.value;
}

function renderChartSummaryCards(series) {
    const summaryCards = document.getElementById("chartSummaryCards");
    const summary = calculateChartSummary(series);
    const rangeLabel = `${series.rangeDays} day${series.rangeDays === 1 ? "" : "s"}`;

    if (!summaryCards) {
        return;
    }

    summaryCards.innerHTML = `
        <article class="analytics-card">
            <span>Total logged days</span>
            <strong>${summary.totalCompletions}</strong>
            <p>Across the last ${rangeLabel}.</p>
        </article>
        <article class="analytics-card">
            <span>Active days</span>
            <strong>${summary.activeDays}</strong>
            <p>Days with at least one full or low-effort log.</p>
        </article>
        <article class="analytics-card">
            <span>Average consistency</span>
            <strong>${summary.averageConsistency}%</strong>
            <p>Average completion coverage for the selected habits.</p>
        </article>
        <article class="analytics-card">
            <span>Current run</span>
            <strong>${summary.currentRun}d</strong>
            <p>Consecutive days ending today with activity.</p>
        </article>
    `;
}

function renderProgressPanel() {
    const summaryText = document.getElementById("chartSummaryText");
    const chartTitle = document.getElementById("chartTitle");
    const chartDescription = document.getElementById("chartDescription");
    const chartCanvas = document.getElementById("chartCanvas");
    const chartHabitFilter = document.getElementById("chartHabitFilter");

    if (!summaryText || !chartTitle || !chartDescription || !chartCanvas || !chartHabitFilter) {
        return;
    }

    if (habitDirectory.length === 0) {
        summaryText.textContent = "Add a habit to unlock charted consistency trends.";
        chartTitle.textContent = "Consistency trends";
        chartDescription.textContent = "Your charts will appear here once you start creating habits and logging check-ins.";
        chartCanvas.setAttribute("aria-label", "Habit consistency chart unavailable until habits exist");
        chartCanvas.innerHTML = '<div class="chart-empty">No chart data yet. Add a habit and log a check-in to start visualizing consistency.</div>';
        renderChartSummaryCards({
            rangeDays: getChartRangeDays(chartViewState.rangeDays),
            points: [],
            habitCount: 0
        });
        return;
    }

    const series = buildConsistencySeries(habitDirectory, chartViewState);
    const selectedLabel = chartHabitFilter.selectedOptions?.[0]?.textContent || "All habits";

    summaryText.textContent = `Showing ${series.meta.label.toLowerCase()} for ${selectedLabel} across the last ${series.rangeDays} days.`;
    chartTitle.textContent = series.meta.label;
    chartDescription.textContent = series.meta.description;
    chartCanvas.setAttribute("aria-label", `${series.meta.label} for ${selectedLabel} across the last ${series.rangeDays} days`);
    chartCanvas.innerHTML = buildChartSvg(series, chartViewState.chartType);
    renderChartSummaryCards(series);
}

function renderHabitList() {
    const list = document.getElementById("habitList");
    if (!list) {
        return;
    }

    const visibleHabits = sortHabits(
        filterHabits(habitDirectory, habitViewState),
        habitViewState.sort
    );

    updateHabitFilterSummary(visibleHabits.length, habitDirectory.length);
    list.innerHTML = "";

    if (habitDirectory.length === 0) {
        list.innerHTML = '<div class="empty-state">No habits yet. Add one to get started.</div>';
        return;
    }

    if (visibleHabits.length === 0) {
        list.innerHTML = '<div class="empty-state">No habits match that search yet. Try a different category or keyword.</div>';
        return;
    }

    const shouldCollapse = shouldCollapseHabitList(visibleHabits, HABIT_COLLAPSE_LIMIT);
    if (!shouldCollapse) {
        isHabitListExpanded = false;
    }

    const habitsToRender = getVisibleHabitSlice(visibleHabits, isHabitListExpanded, HABIT_COLLAPSE_LIMIT);
    habitsToRender.forEach((habit) => list.appendChild(renderHabitCard(habit)));

    if (shouldCollapse) {
        const remainingCount = visibleHabits.length - habitsToRender.length;
        const controls = document.createElement("div");
        controls.className = "habit-list-toggle";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn btn-secondary habit-list-toggle__button";
        button.textContent = isHabitListExpanded
            ? "Show fewer habits"
            : `Show ${remainingCount} more ${remainingCount === 1 ? "habit" : "habits"}`;
        button.addEventListener("click", () => {
            isHabitListExpanded = !isHabitListExpanded;
            renderHabitList();
        });

        const summary = document.createElement("p");
        summary.className = "habit-list-toggle__summary";
        summary.textContent = isHabitListExpanded
            ? `Showing all ${visibleHabits.length} habits.`
            : `Showing ${habitsToRender.length} of ${visibleHabits.length} habits.`;

        controls.appendChild(summary);
        controls.appendChild(button);
        list.appendChild(controls);
    }
}

function resetHabitFilters() {
    Object.assign(habitViewState, defaultHabitViewState);
    isHabitListExpanded = false;

    const searchInput = document.getElementById("habitSearch");
    const categoryFilter = document.getElementById("habitCategoryFilter");
    const favoriteOnlyFilter = document.getElementById("favoriteOnlyFilter");
    const sortSelect = document.getElementById("habitSort");

    if (searchInput) searchInput.value = "";
    if (categoryFilter) categoryFilter.value = "";
    if (favoriteOnlyFilter) favoriteOnlyFilter.checked = defaultHabitViewState.favoritesOnly;
    if (sortSelect) sortSelect.value = defaultHabitViewState.sort;

    renderHabitList();
    scheduleDashboardPreferenceSave(0);
}

function resetChartFilters() {
    Object.assign(chartViewState, defaultChartViewState);

    const chartHabitFilter = document.getElementById("chartHabitFilter");
    const chartRangeFilter = document.getElementById("chartRangeFilter");
    const chartMetricFilter = document.getElementById("chartMetricFilter");
    const chartTypeFilter = document.getElementById("chartTypeFilter");

    if (chartHabitFilter) chartHabitFilter.value = defaultChartViewState.habitId;
    if (chartRangeFilter) chartRangeFilter.value = defaultChartViewState.rangeDays;
    if (chartMetricFilter) chartMetricFilter.value = defaultChartViewState.metric;
    if (chartTypeFilter) chartTypeFilter.value = defaultChartViewState.chartType;

    renderProgressPanel();
    scheduleDashboardPreferenceSave(0);
}

function clearHabitComposer() {
    ["habitName", "habitDescription", "habitCategory", "habitIcon"].forEach((id) => {
        const element = document.getElementById(id);
        if (element) {
            element.value = "";
        }
    });

    syncHabitCategoryPresetSelection();
}

function bindHabitControls() {
    const searchInput = document.getElementById("habitSearch");
    const categoryFilter = document.getElementById("habitCategoryFilter");
    const favoriteOnlyFilter = document.getElementById("favoriteOnlyFilter");
    const sortSelect = document.getElementById("habitSort");
    const clearButton = document.getElementById("clearHabitFilters");
    const completeAllButton = document.getElementById("completeAllHabits");

    searchInput?.addEventListener("input", (event) => {
        habitViewState.search = event.target.value;
        isHabitListExpanded = false;
        renderHabitList();
        scheduleDashboardPreferenceSave();
    });

    categoryFilter?.addEventListener("change", (event) => {
        habitViewState.category = event.target.value;
        isHabitListExpanded = false;
        renderHabitList();
        scheduleDashboardPreferenceSave(0);
    });

    favoriteOnlyFilter?.addEventListener("change", (event) => {
        habitViewState.favoritesOnly = event.target.checked;
        isHabitListExpanded = false;
        renderHabitList();
        scheduleDashboardPreferenceSave(0);
    });

    sortSelect?.addEventListener("change", (event) => {
        habitViewState.sort = event.target.value;
        isHabitListExpanded = false;
        renderHabitList();
        scheduleDashboardPreferenceSave(0);
    });

    clearButton?.addEventListener("click", resetHabitFilters);
    completeAllButton?.addEventListener("click", completeAllHabits);
}

function bindChartControls() {
    const chartHabitFilter = document.getElementById("chartHabitFilter");
    const chartRangeFilter = document.getElementById("chartRangeFilter");
    const chartMetricFilter = document.getElementById("chartMetricFilter");
    const chartTypeFilter = document.getElementById("chartTypeFilter");

    chartHabitFilter?.addEventListener("change", (event) => {
        chartViewState.habitId = event.target.value;
        renderProgressPanel();
        scheduleDashboardPreferenceSave(0);
    });

    chartRangeFilter?.addEventListener("change", (event) => {
        chartViewState.rangeDays = event.target.value;
        renderProgressPanel();
        scheduleDashboardPreferenceSave(0);
    });

    chartMetricFilter?.addEventListener("change", (event) => {
        chartViewState.metric = event.target.value;
        renderProgressPanel();
        scheduleDashboardPreferenceSave(0);
    });

    chartTypeFilter?.addEventListener("change", (event) => {
        chartViewState.chartType = event.target.value;
        renderProgressPanel();
        scheduleDashboardPreferenceSave(0);
    });
}

function bindSuggestionControls() {
    const shuffleButton = document.getElementById("shuffleFunSuggestions");

    shuffleButton?.addEventListener("click", () => {
        suggestionViewState.funOffset += 1;
        renderSuggestionsPanel();
    });
}

async function loadHabits() {
    try {
        const res = await authFetch("/habits");
        const data = await readJson(res);

        if (!res.ok) {
            showFeedback(data.error || "Failed to load habits.");
            return;
        }

        const habits = Array.isArray(data) ? data : [];
        habitDirectory = await Promise.all(
            habits.map(async (habit) => {
                const normalizedHabit = normalizeHabitRecord(habit);
                const logs = await fetchHabitLogs(normalizedHabit.id);
                const stats = calculateHabitStats(logs);

                return {
                    ...normalizedHabit,
                    logs,
                    logSet: new Set(logs.map((entry) => entry.completion_date).filter(Boolean)),
                    stats
                };
            })
        );

        updateHabitFilterOptions();
        updateChartHabitOptions();
        syncDashboardPreferenceInputs();
        renderProgressPanel();
        renderSuggestionsPanel();
        renderHabitList();
    } catch (error) {
        const details = error && error.message ? ` (${error.message})` : "";
        showFeedback(`Could not load habits${details}`);
    }
}

async function addHabit() {
    const nameInput = document.getElementById("habitName");
    const descriptionInput = document.getElementById("habitDescription");
    const categoryInput = document.getElementById("habitCategory");
    const name = nameInput.value.trim();
    const description = descriptionInput.value.trim();
    const category = normalizeHabitCategory(categoryInput.value);
    const icon = normalizeHabitIcon(document.getElementById("habitIcon")?.value);

    if (!name) {
        showFeedback("Please enter a habit name.");
        return;
    }

    const res = await authFetch("/habits", {
        method: "POST",
        body: JSON.stringify({ name, description, category, icon, tags: [] })
    });

    const data = await readJson(res);

    if (!res.ok) {
        showFeedback(data.error || "Unable to add habit.");
        return;
    }

    clearHabitComposer();
    showFeedback("Habit added!", true);
    loadHabits();
}

async function addSuggestedHabit(suggestion) {
    const name = String(suggestion?.name ?? "").trim();
    const description = String(suggestion?.description ?? "").trim();
    const category = normalizeHabitCategory(suggestion?.category);

    if (!name) {
        showFeedback("Suggestion is missing a habit name.");
        return;
    }

    const res = await authFetch("/habits", {
        method: "POST",
        body: JSON.stringify({ name, description, category, tags: [] })
    });

    const data = await readJson(res);

    if (!res.ok) {
        showFeedback(data.error || "Unable to add suggested habit.");
        return;
    }

    showFeedback(`Added "${name}" to your habits.`, true);
    loadHabits();
}

async function deleteHabit(id) {
    if (!confirm("Are you sure you want to delete this habit?")) return;

    const res = await authFetch(`/habits/${id}`, { method: "DELETE" });
    const data = await readJson(res);

    if (!res.ok) {
        showFeedback(data.error || "Unable to delete habit.");
        return;
    }

    showFeedback("Habit deleted!", true);
    loadHabits();
}

async function logHabit(id, entryType = "full") {
    const today = formatLocalDate(new Date());
    const normalizedEntryType = normalizeHabitLogEntryType(entryType);

    const res = await authFetch(`/habits/${id}/log`, {
        method: "POST",
        body: JSON.stringify({ completion_date: today, entry_type: normalizedEntryType })
    });

    const data = await readJson(res);

    if (!res.ok || data.error) {
        showFeedback(data.error || "Unable to log habit.");
        return;
    }

    showFeedback(data.message || "Habit logged successfully.", true);
    loadHabits();
}

async function undoHabitLog(id) {
    const today = formatLocalDate(new Date());

    const res = await authFetch(`/habits/${id}/log`, {
        method: "DELETE",
        body: JSON.stringify({ completion_date: today })
    });

    const data = await readJson(res);

    if (!res.ok) {
        showFeedback(data.error || "Unable to undo habit log.");
        return;
    }

    showFeedback(data.message || "Habit log removed.", true);
    loadHabits();
}

async function completeAllHabits() {
    const today = formatLocalDate(new Date());

    const res = await authFetch("/habits/logs/bulk", {
        method: "POST",
        body: JSON.stringify({ completion_date: today })
    });

    const data = await readJson(res);

    if (!res.ok) {
        showFeedback(data.error || "Unable to complete all habits.");
        return;
    }

    showFeedback(data.message || "All habits completed.", true);
    loadHabits();
}

async function editHabit(id) {
    const card = document.querySelector(`.habit-card[data-id="${id}"]`);
    const currentName = card?.dataset.name || "";
    const currentDescription = card?.dataset.description || "";
    const currentCategory = card?.dataset.category || "";
    const currentIcon = card?.dataset.icon || "";
    const currentIsFavorite = normalizeFavoriteFlag(card?.dataset.isFavorite);

    const newName = prompt("Edit habit name:", currentName);
    if (newName === null) return;

    const trimmedName = newName.trim();
    if (!trimmedName) {
        showFeedback("Habit name cannot be empty.");
        return;
    }

    const newDescription = prompt("Edit description (optional):", currentDescription);
    if (newDescription === null) return;

    const newCategory = prompt("Edit category (optional):", currentCategory);
    if (newCategory === null) return;

    const iconPrompt = getHabitIconCatalog().map((icon) => `${icon.key} (${icon.emoji})`).join(", ");
    const newIcon = prompt(`Edit icon key (optional): ${iconPrompt}`, currentIcon);
    if (newIcon === null) return;

    const res = await authFetch(`/habits/${id}`, {
        method: "PUT",
        body: JSON.stringify({
            name: trimmedName,
            description: newDescription.trim() || null,
            category: normalizeHabitCategory(newCategory),
            icon: normalizeHabitIcon(newIcon),
            tags: [],
            isFavorite: currentIsFavorite
        })
    });

    const data = await readJson(res);

    if (!res.ok) {
        showFeedback(data.error || "Unable to update habit.");
        return;
    }

    showFeedback("Habit updated!", true);
    loadHabits();
}

async function toggleFavoriteHabit(id, nextValue) {
    const res = await authFetch(`/habits/${id}/favorite`, {
        method: "POST",
        body: JSON.stringify({ isFavorite: normalizeFavoriteFlag(nextValue) })
    });

    const data = await readJson(res);

    if (!res.ok) {
        showFeedback(data.error || "Unable to update favorite status.");
        return;
    }

    showFeedback(data.message || "Favorite updated.", true);
    loadHabits();
}

function showFeedback(message, success = false) {
    const feedback = document.getElementById("feedback");
    feedback.textContent = message;
    feedback.className = success ? "success-message" : "feedback-message";

    setTimeout(() => {
        feedback.textContent = "";
        feedback.className = "feedback-message";
    }, 3000);
}

function showStoredNotice() {
    const message = sessionStorage.getItem("habittrack_notice");
    if (!message) return;

    sessionStorage.removeItem("habittrack_notice");
    showFeedback(message, true);
}

function closeWelcomeModal() {
    const modal = document.getElementById("welcomeModal");
    if (!modal) {
        return;
    }

    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
}

function openWelcomeModal() {
    const modal = document.getElementById("welcomeModal");
    if (!modal) {
        return;
    }

    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
}

function showWelcomeModalIfNeeded() {
    const shouldShow = sessionStorage.getItem("habittrack_welcome_new_user") === "true";
    if (!shouldShow) {
        return;
    }

    sessionStorage.removeItem("habittrack_welcome_new_user");
    openWelcomeModal();
}

function bindWelcomeModal() {
    const dismissButton = document.getElementById("dismissWelcomeModal");
    const startButton = document.getElementById("startWelcomeModal");
    const backdrop = document.getElementById("welcomeModalBackdrop");

    dismissButton?.addEventListener("click", closeWelcomeModal);
    backdrop?.addEventListener("click", closeWelcomeModal);
    startButton?.addEventListener("click", () => {
        closeWelcomeModal();
        document.getElementById("habitName")?.focus();
    });
}

async function loadAdminPanel() {
    const panel = document.getElementById("adminPanel");
    if (currentUser?.role !== "admin") {
        panel.classList.add("hidden");
        panel.innerHTML = "";
        return;
    }

    const res = await authFetch("/admin/users");
    const data = await readJson(res);

    if (!res.ok) {
        panel.classList.remove("hidden");
        panel.innerHTML = `<div class="empty-state">${escapeHtml(data.error || "Unable to load admin tools.")}</div>`;
        return;
    }

    const users = Array.isArray(data.users) ? data.users : [];
    const orphanHabits = Number(data.orphanHabits || 0);
    const userRows = users.map((user) => `
        <tr>
            <td>${escapeHtml(user.name)}</td>
            <td>${escapeHtml(user.email)}</td>
            <td>
                <select class="role-select" data-user-id="${user.id}">
                    <option value="user" ${user.role === "user" ? "selected" : ""}>user</option>
                    <option value="admin" ${user.role === "admin" ? "selected" : ""}>admin</option>
                </select>
            </td>
        </tr>
    `).join("");

    panel.classList.remove("hidden");
    panel.innerHTML = `
        <div class="admin-header">
            <div>
                <h2>Admin tools</h2>
                <p class="subtitle">Manage account roles and claim any habits that predate authentication.</p>
            </div>
            <button id="claimLegacyButton" class="btn btn-secondary" type="button" ${orphanHabits === 0 ? "disabled" : ""}>
                ${orphanHabits === 0 ? "No legacy habits" : `Claim ${orphanHabits} legacy habit(s)`}
            </button>
        </div>
        <div class="admin-table-wrap">
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Role</th>
                    </tr>
                </thead>
                <tbody>${userRows}</tbody>
            </table>
        </div>
    `;

    const claimButton = document.getElementById("claimLegacyButton");
    if (claimButton) {
        claimButton.addEventListener("click", claimLegacyHabits);
    }

    document.querySelectorAll(".role-select").forEach((select) => {
        select.addEventListener("change", async (event) => {
            await updateUserRole(event.target.dataset.userId, event.target.value);
        });
    });
}

async function claimLegacyHabits() {
    const res = await authFetch("/admin/claim-orphan-habits", {
        method: "POST"
    });
    const data = await readJson(res);

    if (!res.ok) {
        showFeedback(data.error || "Unable to claim legacy habits.");
        return;
    }

    showFeedback(data.message || "Legacy habits claimed.", true);
    await Promise.all([loadHabits(), loadAdminPanel()]);
}

async function updateUserRole(userId, role) {
    const res = await authFetch(`/admin/users/${userId}/role`, {
        method: "POST",
        body: JSON.stringify({ role })
    });
    const data = await readJson(res);

    if (!res.ok) {
        showFeedback(data.error || "Unable to update role.");
        await loadAdminPanel();
        return;
    }

    showFeedback(data.message || "Role updated.", true);
    await Promise.all([ensureAuthenticated(), loadAdminPanel()]);
}

async function logout() {
    window.clearTimeout(dashboardPreferenceSaveTimer);
    await fetch("/auth/logout", {
        method: "POST",
        credentials: "include"
    });

    currentUser = null;
    applyThemePreference(DEFAULT_THEME_PREFERENCE);
    habitDirectory = [];
    suggestionViewState.funOffset = 0;
    renderAccountPanel();
    toggleDashboardVisibility(false);
    resetHabitFilters();
    resetChartFilters();
    showFeedback("You have been logged out.", true);
}

document.getElementById("logoutButton").addEventListener("click", logout);
bindHabitComposer();
bindHabitControls();
bindChartControls();
bindSuggestionControls();
bindWelcomeModal();

async function initializeApp() {
    const user = await ensureAuthenticated();
    showStoredNotice();

    if (!user) {
        return;
    }

    applyDashboardPreferences(user.dashboardPreferences);

    window.HabitTrackSessionWarning?.init({
        api: API,
        pageBase: ".",
        idleTimeoutMs: 10 * 60 * 1000,
        warningDurationMs: 60 * 1000
    });

    await Promise.all([loadHabits(), loadAdminPanel()]);
    showWelcomeModalIfNeeded();
}

initializeApp();
