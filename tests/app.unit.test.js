// Unit tests for public/scripts/app.js:
// escapeHtml, formatLocalDate, addDays, dateDiffInDays,
// getCurrentStreak, getLongestStreak, getRateInWindow, calculateHabitStats.
const { loadFunctions } = require("./helpers/source-loader");
const { assert, runTest } = require("./helpers/test-harness");

const RealDate = Date;
const fakeNow = new RealDate("2026-04-07T12:00:00Z");
const FakeDate = class extends RealDate {
    constructor(...args) {
        if (args.length === 0) {
            super(fakeNow.getTime());
            return;
        }

        super(...args);
    }

    static now() {
        return fakeNow.getTime();
    }
};

const appFunctions = loadFunctions("public/scripts/app.js", [
    "escapeHtml",
    "normalizeThemePreference",
    "normalizeDashboardPreferences",
    "normalizeHabitCategory",
    "normalizeHabitIcon",
    "normalizeHabitTags",
    "normalizeHabitLogEntryType",
    "getHabitIconCatalog",
    "deriveHabitIconKey",
    "buildSuggestionNameKey",
    "normalizeFavoriteFlag",
    "getExistingHabitNameSet",
    "getCategorySuggestionTemplates",
    "getFunSuggestionCatalog",
    "pickUnusedSuggestions",
    "buildPersonalizedSuggestions",
    "buildFunSuggestions",
    "buildHabitSearchText",
    "filterHabits",
    "sortHabits",
    "shouldCollapseHabitList",
    "getVisibleHabitSlice",
    "formatLocalDate",
    "addDays",
    "dateDiffInDays",
    "getCurrentStreak",
    "getLongestStreak",
    "getRateInWindow",
    "buildCalendarHtml",
    "calculateHabitStats",
    "getChartRangeDays",
    "buildDateRange",
    "getChartMetricMeta",
    "formatMetricValue",
    "formatChartDateLabel",
    "calculateCurrentRun",
    "calculateChartSummary",
    "buildChartSvg"
], {
    prelude: "const DEFAULT_THEME_PREFERENCE = 'light';",
    context: {
        Date: FakeDate
    }
});

module.exports = async function runAppUnitTests() {
    let failed = 0;

    // Unit tests for the pure helper logic used by public/scripts/app.js.
    failed += Number(!(await runTest("app.js unit tests: escapeHtml safely escapes HTML characters", () => {
        assert.equal(
            appFunctions.escapeHtml(`<script>"test"&'</script>`),
            "&lt;script&gt;&quot;test&quot;&amp;&#39;&lt;/script&gt;"
        );
    })));

    failed += Number(!(await runTest("app.js unit tests: normalizeDashboardPreferences keeps supported auto-saved settings", () => {
        assert.deepEqual(
            JSON.parse(JSON.stringify(appFunctions.normalizeDashboardPreferences({
                habit: { search: "  reset routine ", category: "  Self-care ", favoritesOnly: "1", sort: "name-az" },
                chart: { habitId: "12", rangeDays: 90, metric: "cumulative", chartType: "bar" }
            }))),
            {
                habit: { search: "reset routine", category: "Self-care", favoritesOnly: true, sort: "name-az" },
                chart: { habitId: "12", rangeDays: "90", metric: "cumulative", chartType: "bar" }
            }
        );
    })));

    failed += Number(!(await runTest("app.js unit tests: normalizeThemePreference accepts light and dark values", () => {
        assert.equal(appFunctions.normalizeThemePreference("dark"), "dark");
        assert.equal(appFunctions.normalizeThemePreference(" LIGHT "), "light");
        assert.equal(appFunctions.normalizeThemePreference("sepia"), "light");
    })));

    failed += Number(!(await runTest("app.js unit tests: normalizeHabitCategory trims and collapses extra spacing", () => {
        assert.equal(
            appFunctions.normalizeHabitCategory("  Deep   Work  "),
            "Deep Work"
        );
        assert.equal(appFunctions.normalizeHabitCategory(""), "");
    })));

    failed += Number(!(await runTest("app.js unit tests: habit icon helpers validate and derive icon choices", () => {
        assert.equal(appFunctions.normalizeHabitIcon("BOOK"), "book");
        assert.equal(appFunctions.normalizeHabitIcon("rocket"), "");
        assert.equal(appFunctions.getHabitIconCatalog().length >= 8, true);
        assert.equal(
            appFunctions.deriveHabitIconKey({ name: "Morning run", category: "Fitness", icon: "" }),
            "dumbbell"
        );
        assert.equal(
            appFunctions.deriveHabitIconKey({ name: "Budget review", category: "", icon: "" }),
            "wallet"
        );
        assert.equal(
            appFunctions.deriveHabitIconKey({ name: "Anything", category: "", icon: "spark" }),
            "spark"
        );
    })));

    failed += Number(!(await runTest("app.js unit tests: normalizeHabitTags de-duplicates comma-separated tags", () => {
        assert.deepEqual(
            [...appFunctions.normalizeHabitTags(" Health, focus, health , Deep Work  ")],
            ["Health", "focus", "Deep Work"]
        );
    })));

    failed += Number(!(await runTest("app.js unit tests: normalizeFavoriteFlag accepts boolean-like values", () => {
        assert.equal(appFunctions.normalizeFavoriteFlag(true), true);
        assert.equal(appFunctions.normalizeFavoriteFlag("1"), true);
        assert.equal(appFunctions.normalizeFavoriteFlag("off"), false);
    })));

    failed += Number(!(await runTest("app.js unit tests: normalizeHabitLogEntryType supports full and low-effort logs", () => {
        assert.equal(appFunctions.normalizeHabitLogEntryType("full"), "full");
        assert.equal(appFunctions.normalizeHabitLogEntryType("LOW_EFFORT"), "low_effort");
        assert.equal(appFunctions.normalizeHabitLogEntryType(""), "full");
    })));

    failed += Number(!(await runTest("app.js unit tests: suggestion helpers normalize names and avoid duplicates", () => {
        assert.equal(appFunctions.buildSuggestionNameKey("  Drink Water  "), "drink water");
        assert.deepEqual(
            [...appFunctions.getExistingHabitNameSet([{ name: "Read" }, { name: "  read " }, { name: "Walk" }])],
            ["read", "walk"]
        );
        assert.deepEqual(
            [...appFunctions.pickUnusedSuggestions(
                [{ name: "Read more" }, { name: "Walk more" }, { name: "Read more" }],
                new Set(["read more"]),
                2
            ).map((item) => item.name)],
            ["Walk more"]
        );
    })));

    failed += Number(!(await runTest("app.js unit tests: filterHabits matches search text across categories and tags", () => {
        const habits = [
            {
                id: 1,
                name: "Morning Run",
                description: "Cardio outside",
                category: "Fitness",
                tags: ["Outdoors", "Cardio"],
                stats: {}
            },
            {
                id: 2,
                name: "Read",
                description: "20 pages",
                category: "Learning",
                tags: ["Books"],
                stats: {}
            }
        ];

        assert.equal(appFunctions.filterHabits(habits, { search: "cardio" }).length, 1);
        assert.equal(appFunctions.filterHabits(habits, { category: "Learning" }).length, 1);
        assert.equal(appFunctions.filterHabits(habits, { tag: "Books" }).length, 1);
        assert.equal(appFunctions.filterHabits([
            { id: 3, name: "Journal", description: "", category: "Mindfulness", tags: [], isFavorite: false, stats: {} },
            { id: 4, name: "Walk", description: "", category: "Fitness", tags: [], isFavorite: true, stats: {} }
        ], { favoritesOnly: true }).length, 1);
        assert.equal(appFunctions.filterHabits(habits, { search: "focus" }).length, 0);
    })));

    failed += Number(!(await runTest("app.js unit tests: long habit lists can collapse to a fixed slice", () => {
        const habits = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }, { id: 7 }];

        assert.equal(appFunctions.shouldCollapseHabitList(habits, 6), true);
        assert.equal(appFunctions.shouldCollapseHabitList(4, 6), false);
        assert.deepEqual(
            [...appFunctions.getVisibleHabitSlice(habits, false, 6).map((habit) => habit.id)],
            [1, 2, 3, 4, 5, 6]
        );
        assert.deepEqual(
            [...appFunctions.getVisibleHabitSlice(habits, true, 6).map((habit) => habit.id)],
            [1, 2, 3, 4, 5, 6, 7]
        );
    })));

    failed += Number(!(await runTest("app.js unit tests: sortHabits supports streak and category sorting", () => {
        const habits = [
            {
                id: 1,
                name: "Read",
                category: "Learning",
                tags: ["Books"],
                isFavorite: false,
                stats: { currentStreak: 4, longestStreak: 6, totalCompletions: 9, completionRate30: 30 }
            },
            {
                id: 2,
                name: "Run",
                category: "Fitness",
                tags: ["Cardio"],
                isFavorite: true,
                stats: { currentStreak: 7, longestStreak: 7, totalCompletions: 12, completionRate30: 40 }
            },
            {
                id: 3,
                name: "Journal",
                category: "",
                tags: [],
                isFavorite: false,
                stats: { currentStreak: 2, longestStreak: 5, totalCompletions: 5, completionRate30: 20 }
            }
        ];

        assert.deepEqual(
            [...appFunctions.sortHabits(habits, "favorites").map((habit) => habit.id)],
            [2, 3, 1]
        );
        assert.deepEqual(
            [...appFunctions.sortHabits(habits, "streak-desc").map((habit) => habit.id)],
            [2, 1, 3]
        );
        assert.deepEqual(
            [...appFunctions.sortHabits(habits, "category-az").map((habit) => habit.id)],
            [2, 1, 3]
        );
    })));

    failed += Number(!(await runTest("app.js unit tests: suggestion builders create personalized and fun ideas", () => {
        const habits = [
            {
                id: 1,
                name: "Morning Walk",
                category: "Fitness",
                stats: { completionRate30: 70, currentStreak: 5, totalCompletions: 10, lowEffortDays: 0 }
            },
            {
                id: 2,
                name: "Deep Work",
                category: "Work",
                stats: { completionRate30: 30, currentStreak: 0, totalCompletions: 8, lowEffortDays: 3 }
            }
        ];

        const personalized = appFunctions.buildPersonalizedSuggestions(habits);
        const fun = appFunctions.buildFunSuggestions(habits, 0, 3);

        assert.ok(personalized.length > 0);
        assert.ok(personalized.some((item) => /consisten|soft|momentum|lighter/i.test(item.reason)));
        assert.equal(fun.length, 3);
        assert.ok(fun.every((item) => item.name && item.description));
        assert.ok(appFunctions.getCategorySuggestionTemplates().Fitness.length > 0);
        assert.ok(appFunctions.getFunSuggestionCatalog().length >= 4);
    })));

    // Unit tests for the pure helper logic used by public/scripts/app.js.
    failed += Number(!(await runTest("app.js unit tests: formatLocalDate returns YYYY-MM-DD", () => {
        const sampleDate = new Date(2026, 3, 7);
        assert.equal(appFunctions.formatLocalDate(sampleDate), "2026-04-07");
    })));

    // Unit tests for the pure helper logic used by public/scripts/app.js.
    failed += Number(!(await runTest("app.js unit tests: addDays moves an ISO date forward and backward", () => {
        assert.equal(appFunctions.addDays("2026-04-07", 3), "2026-04-10");
        assert.equal(appFunctions.addDays("2026-04-07", -7), "2026-03-31");
    })));

    // Unit tests for the pure helper logic used by public/scripts/app.js.
    failed += Number(!(await runTest("app.js unit tests: dateDiffInDays calculates whole-day differences", () => {
        assert.equal(appFunctions.dateDiffInDays("2026-04-01", "2026-04-07"), 6);
        assert.equal(appFunctions.dateDiffInDays("2026-04-07", "2026-04-01"), -6);
    })));

    // Unit tests for the pure helper logic used by public/scripts/app.js.
    failed += Number(!(await runTest("app.js unit tests: getCurrentStreak counts the latest consecutive run", () => {
        const dates = ["2026-04-03", "2026-04-04", "2026-04-05", "2026-04-07"];
        assert.equal(appFunctions.getCurrentStreak(dates, "2026-04-07"), 1);

        const consecutiveDates = ["2026-04-04", "2026-04-05", "2026-04-06", "2026-04-07"];
        assert.equal(appFunctions.getCurrentStreak(consecutiveDates, "2026-04-07"), 4);
    })));

    // Unit tests for the pure helper logic used by public/scripts/app.js.
    failed += Number(!(await runTest("app.js unit tests: getCurrentStreak resets when the most recent log is stale", () => {
        const staleDates = ["2026-03-28", "2026-03-29", "2026-03-30"];
        assert.equal(appFunctions.getCurrentStreak(staleDates, "2026-04-07"), 0);
    })));

    // Unit tests for the pure helper logic used by public/scripts/app.js.
    failed += Number(!(await runTest("app.js unit tests: getLongestStreak finds the longest consecutive run", () => {
        const dates = [
            "2026-04-01",
            "2026-04-02",
            "2026-04-04",
            "2026-04-05",
            "2026-04-06",
            "2026-04-08"
        ];

        assert.equal(appFunctions.getLongestStreak(dates), 3);
    })));

    // Unit tests for the pure helper logic used by public/scripts/app.js.
    failed += Number(!(await runTest("app.js unit tests: getRateInWindow returns a rounded completion percentage", () => {
        const logSet = new Set(["2026-04-07", "2026-04-06", "2026-04-04"]);
        assert.equal(appFunctions.getRateInWindow(logSet, "2026-04-07", 7), 43);
    })));

    // Unit tests for the pure helper logic used by public/scripts/app.js.
    failed += Number(!(await runTest("app.js unit tests: calculateHabitStats summarizes habit log data", () => {
        const stats = appFunctions.calculateHabitStats([
            { completion_date: "2026-04-05", entry_type: "full" },
            { completion_date: "2026-04-06", entry_type: "low_effort" },
            { completion_date: "2026-04-07", entry_type: "low_effort" },
            { completion_date: "2026-04-07", entry_type: "full" }
        ]);

        assert.equal(stats.doneToday, true);
        assert.equal(stats.currentStreak, 3);
        assert.equal(stats.longestStreak, 3);
        assert.equal(stats.completionRate7, 43);
        assert.equal(stats.completionRate30, 10);
        assert.equal(stats.totalCompletions, 3);
        assert.equal(stats.todayEntryType, "full");
        assert.equal(stats.lowEffortDays, 1);
        assert.match(stats.calendarHtml, /calendar-grid/);
    })));

    failed += Number(!(await runTest("app.js unit tests: buildDateRange returns an inclusive oldest-to-newest window", () => {
        assert.deepEqual(
            [...appFunctions.buildDateRange("2026-04-07", 4)],
            ["2026-04-04", "2026-04-05", "2026-04-06", "2026-04-07"]
        );
        assert.equal(appFunctions.getChartRangeDays("90"), 90);
        assert.equal(appFunctions.getChartRangeDays("12"), 12);
    })));

    failed += Number(!(await runTest("app.js unit tests: chart helper formatters describe consistency metrics clearly", () => {
        assert.equal(appFunctions.getChartMetricMeta("completed").label, "Logged habits per day");
        assert.equal(appFunctions.getChartMetricMeta("rate").summaryLabel, "Average consistency");
        assert.equal(appFunctions.getChartMetricMeta("cumulative").label, "Cumulative logged days");
        assert.equal(appFunctions.formatMetricValue(87.3, "rate"), "87%");
        assert.equal(appFunctions.calculateCurrentRun([
            { completedHabits: 0 },
            { completedHabits: 1 },
            { completedHabits: 1 }
        ]), 2);
    })));

    failed += Number(!(await runTest("app.js unit tests: chart summary and svg rendering reflect the computed series", () => {
        const series = {
            metric: "rate",
            rangeDays: 3,
            habitCount: 1,
            points: [
                { isoDate: "2026-04-05", label: "Apr 5", completedHabits: 1, value: 100 },
                { isoDate: "2026-04-06", label: "Apr 6", completedHabits: 1, value: 100 },
                { isoDate: "2026-04-07", label: "Apr 7", completedHabits: 1, value: 100 }
            ]
        };

        const summary = appFunctions.calculateChartSummary(series);
        const lineSvg = appFunctions.buildChartSvg(series, "line");
        const barSvg = appFunctions.buildChartSvg(series, "bar");

        assert.equal(summary.totalCompletions, 3);
        assert.equal(summary.averageConsistency, 100);
        assert.equal(summary.currentRun, 3);
        assert.match(appFunctions.formatChartDateLabel("2026-04-07"), /Apr/);
        assert.match(lineSvg, /chart-line/);
        assert.match(barSvg, /chart-bar/);
    })));

    return failed;
};
