const LOCAL_SERVER_ORIGIN = "http://localhost:3000";
const useLocalServer = window.location.protocol === "file:"
    || (
        ["localhost", "127.0.0.1"].includes(window.location.hostname)
        && window.location.port
        && window.location.port !== "3000"
    );
const API = useLocalServer ? LOCAL_SERVER_ORIGIN : "";
const PAGE_BASE = useLocalServer ? `${LOCAL_SERVER_ORIGIN}/pages` : ".";
const DEFAULT_THEME_PREFERENCE = "light";
const HABIT_ICON_CATALOG = {
    spark: { emoji: "✨", label: "Spark" },
    heart: { emoji: "❤️", label: "Heart" },
    dumbbell: { emoji: "🏋️", label: "Dumbbell" },
    apple: { emoji: "🍎", label: "Apple" },
    moon: { emoji: "🌙", label: "Moon" },
    leaf: { emoji: "🍃", label: "Leaf" },
    book: { emoji: "📚", label: "Book" },
    briefcase: { emoji: "💼", label: "Briefcase" },
    clock: { emoji: "⏰", label: "Clock" },
    wallet: { emoji: "💰", label: "Wallet" },
    users: { emoji: "🤝", label: "People" },
    home: { emoji: "🏠", label: "Home" },
    check: { emoji: "✅", label: "Check" }
};

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

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function normalizeHabitIcon(value) {
    const normalized = String(value ?? "").trim().toLowerCase();
    return HABIT_ICON_CATALOG[normalized] ? normalized : "";
}

function renderHabitIcon(iconKey) {
    const icon = HABIT_ICON_CATALOG[normalizeHabitIcon(iconKey)] || HABIT_ICON_CATALOG.check;
    return `<span class="habit-inline-icon" aria-hidden="true" title="${escapeHtml(icon.label)}">${escapeHtml(icon.emoji)}</span>`;
}

function readJson(res) {
    return res.text().then((text) => {
        try {
            return text ? JSON.parse(text) : {};
        } catch {
            return {};
        }
    });
}

async function authFetch(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }

    const res = await fetch(`${API}${url}`, {
        ...options,
        credentials: "include",
        headers
    });

    if (res.status === 401) {
        window.location.replace(`${PAGE_BASE}/login.html`);
        throw new Error("Authentication required.");
    }

    return res;
}

function showFeedback(message, success = false) {
    const feedback = document.getElementById("activityFeedback");
    feedback.textContent = message;
    feedback.className = success ? "profile-feedback is-success" : "profile-feedback";
}

function formatRetentionLabel(value) {
    const labels = {
        "7_days": "Keep 7 days",
        "9_days": "Keep 9 days",
        "30_days": "Keep 30 days",
        monthly: "Keep current month"
    };

    return labels[String(value || "").trim()] || "Keep 30 days";
}

function formatActivityDate(isoDate) {
    const [year, month, day] = String(isoDate || "").split("-").map(Number);
    if (!year || !month || !day) {
        return "Unknown date";
    }

    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function renderHabitFilterOptions(habits, selectedHabitId = "all") {
    const select = document.getElementById("activityHabitFilter");
    if (!select) {
        return;
    }

    const options = (Array.isArray(habits) ? habits : [])
        .map((habit) => `<option value="${escapeHtml(String(habit.id))}">${escapeHtml(habit.name)}</option>`)
        .join("");

    select.innerHTML = `<option value="all">All habits</option>${options}`;
    select.value = selectedHabitId;
}

function renderActivityList(activity) {
    const list = document.getElementById("activityList");
    const items = Array.isArray(activity) ? activity : [];

    if (!list) {
        return;
    }

    if (items.length === 0) {
        list.innerHTML = '<div class="empty-state">No activity matches this view. Try a different habit or a wider retention window.</div>';
        return;
    }

    list.innerHTML = items.map((item) => `
        <article class="activity-row">
            <div class="activity-row__main">
                <div class="activity-row__title-line">
                    ${renderHabitIcon(item.icon)}
                    <p class="activity-row__title">${escapeHtml(item.habitName)}</p>
                    ${item.isFavorite ? '<span class="habit-row__favorite">★ Favorite</span>' : ""}
                    ${item.category ? `<span class="activity-row__category">${escapeHtml(item.category)}</span>` : ""}
                </div>
                <p class="activity-row__meta">${escapeHtml(formatActivityDate(item.completionDate))}</p>
                ${item.entryType === "low_effort" ? '<p class="activity-row__note">Protected by a low-effort day, so the streak stayed alive.</p>' : ""}
            </div>
            <div class="activity-row__status ${item.entryType === "low_effort" ? "activity-row__status--low-effort" : ""}">
                ${item.entryType === "low_effort" ? "Streak protected" : "Full completion"}
            </div>
        </article>
    `).join("");
}

function renderSummary(summary, selectedHabitId = "all") {
    const stats = summary?.stats || {};
    const habits = Array.isArray(summary?.habits) ? summary.habits : [];

    document.getElementById("activityRetentionBadge").textContent = `Window: ${formatRetentionLabel(summary?.retention).toLowerCase()}`;
    document.getElementById("activityOldestBadge").textContent = stats.oldestKeptDate
        ? `Oldest saved log: ${formatActivityDate(stats.oldestKeptDate)}`
        : "No saved history yet";
    document.getElementById("activityTotalEntries").textContent = String(stats.totalEntries || 0);
    document.getElementById("activityFullEntries").textContent = String(stats.fullCompletions || 0);
    document.getElementById("activityLowEffortEntries").textContent = String(stats.lowEffortDays || 0);
    document.getElementById("activityVisibleHabits").textContent = String(
        selectedHabitId === "all" ? habits.length : Number(Boolean(summary?.activity?.length))
    );
    document.getElementById("activityListCopy").textContent = stats.totalEntries > 0
        ? "Retained activity appears below, newest first."
        : "No retained activity is available in this view yet.";
    document.getElementById("retentionSelect").value = summary?.retention || "30_days";

    renderHabitFilterOptions(habits, selectedHabitId);
    renderActivityList(summary?.activity);
}

async function loadPastActivity(selectedHabitId = "all") {
    const query = selectedHabitId && selectedHabitId !== "all"
        ? `?habitId=${encodeURIComponent(selectedHabitId)}`
        : "";
    const res = await authFetch(`/past-activity${query}`);
    const data = await readJson(res);

    if (!res.ok) {
        throw new Error(data.error || "Unable to load past activity.");
    }

    renderSummary(data.summary, selectedHabitId);
    window.HabitTrackSessionWarning?.init({
        api: API,
        pageBase: PAGE_BASE,
        idleTimeoutMs: 10 * 60 * 1000,
        warningDurationMs: 60 * 1000
    });
}

async function loadCurrentUserTheme() {
    const res = await authFetch("/auth/me");
    const data = await readJson(res);

    if (!res.ok) {
        throw new Error(data.error || "Unable to load appearance.");
    }

    applyThemePreference(data.user?.themePreference);
}

async function updateRetention() {
    const retention = document.getElementById("retentionSelect").value;
    const selectedHabitId = document.getElementById("activityHabitFilter").value || "all";
    showFeedback("");

    const res = await authFetch("/past-activity/retention", {
        method: "PATCH",
        body: JSON.stringify({ retention })
    });
    const data = await readJson(res);

    if (!res.ok) {
        showFeedback(data.error || "Unable to update retention.");
        return;
    }

    renderSummary(data.summary, selectedHabitId);
    if (selectedHabitId !== "all") {
        await loadPastActivity(selectedHabitId);
    }
    showFeedback(data.message || "Retention window updated.", true);
}

document.getElementById("retentionSelect").addEventListener("change", updateRetention);
document.getElementById("activityHabitFilter").addEventListener("change", async (event) => {
    try {
        showFeedback("");
        await loadPastActivity(event.target.value);
    } catch (error) {
        showFeedback(error.message || "Unable to load past activity.");
    }
});

async function initializePastActivityPage() {
    await loadCurrentUserTheme();
    await loadPastActivity();
}

initializePastActivityPage().catch((error) => {
    showFeedback(error.message || "Unable to load past activity.");
});
