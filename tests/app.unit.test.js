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
    "formatLocalDate",
    "addDays",
    "dateDiffInDays",
    "getCurrentStreak",
    "getLongestStreak",
    "getRateInWindow",
    "buildCalendarHtml",
    "calculateHabitStats"
], {
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
            "2026-04-05",
            "2026-04-06",
            "2026-04-07",
            "2026-04-07"
        ]);

        assert.equal(stats.doneToday, true);
        assert.equal(stats.currentStreak, 3);
        assert.equal(stats.longestStreak, 3);
        assert.equal(stats.completionRate7, 43);
        assert.equal(stats.completionRate30, 10);
        assert.equal(stats.totalCompletions, 3);
        assert.match(stats.calendarHtml, /calendar-grid/);
    })));

    return failed;
};
