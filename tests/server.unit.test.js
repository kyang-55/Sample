// Unit tests for src/server.js:
// parseCookies, normalizeEmail, validatePassword, parseAvatarDataUrl,
// getAvatarExtension, isManagedAvatarPath, hashPassword, verifyPassword.
const crypto = require("crypto");
const { loadFunctions } = require("./helpers/source-loader");
const { assert, runTest } = require("./helpers/test-harness");

const serverFunctions = loadFunctions(
    "src/server.js",
    [
        "parseCookies",
        "normalizeEmail",
        "validatePassword",
        "normalizeHabitCategory",
        "normalizeHabitIcon",
        "normalizeHabitTags",
        "normalizeHabitLogEntryType",
        "normalizeHabitLogRetention",
        "normalizeThemePreference",
        "parseDashboardPreferences",
        "normalizeDashboardPreferences",
        "formatDateOnly",
        "getHabitLogRetentionCutoff",
        "normalizeFavoriteFlag",
        "serializeHabitTags",
        "parseStoredHabitTags",
        "parseAvatarDataUrl",
        "getAvatarExtension",
        "isManagedAvatarPath",
        "hashPassword",
        "verifyPassword"
    ],
    {
        context: {
            crypto
        }
    }
);

module.exports = async function runServerUnitTests() {
    let failed = 0;

    // Unit tests for the pure helper logic used by src/server.js.
    failed += Number(!(await runTest("server.js unit tests: parseCookies reads a cookie header into an object", () => {
        const parsedCookies = serverFunctions.parseCookies("session=abc123; theme=dark%20mode");
        assert.deepEqual({ ...parsedCookies }, {
            session: "abc123",
            theme: "dark mode"
        });
    })));

    // Unit tests for the pure helper logic used by src/server.js.
    failed += Number(!(await runTest("server.js unit tests: normalizeEmail trims and lowercases addresses", () => {
        assert.equal(serverFunctions.normalizeEmail("  USER@Example.COM "), "user@example.com");
    })));

    // Unit tests for the pure helper logic used by src/server.js.
    failed += Number(!(await runTest("server.js unit tests: validatePassword enforces minimum password rules", () => {
        assert.equal(serverFunctions.validatePassword("short1"), "Password must be at least 8 characters.");
        assert.equal(
            serverFunctions.validatePassword("allletters"),
            "Password must include at least one letter and one number."
        );
        assert.equal(serverFunctions.validatePassword("valid123"), null);
    })));

    failed += Number(!(await runTest("server.js unit tests: habit metadata helpers normalize categories and tags", () => {
        assert.equal(serverFunctions.normalizeHabitCategory("  Deep   Work "), "Deep Work");
        assert.equal(serverFunctions.normalizeHabitIcon("DUMBBELL"), "dumbbell");
        assert.equal(serverFunctions.normalizeHabitIcon("planet"), null);
        assert.deepEqual(
            [...serverFunctions.normalizeHabitTags(["Focus", "focus", "Health"])],
            ["Focus", "Health"]
        );
        assert.equal(serverFunctions.normalizeFavoriteFlag("true"), 1);
        assert.equal(serverFunctions.normalizeFavoriteFlag("off"), 0);
        assert.equal(
            serverFunctions.serializeHabitTags("Focus, Health"),
            JSON.stringify(["Focus", "Health"])
        );
        assert.deepEqual(
            [...serverFunctions.parseStoredHabitTags('["Focus","health","Focus"]')],
            ["Focus", "health"]
        );
        assert.equal(serverFunctions.normalizeHabitLogEntryType("LOW_EFFORT"), "low_effort");
        assert.equal(serverFunctions.normalizeHabitLogEntryType(""), "full");
        assert.equal(serverFunctions.normalizeHabitLogEntryType("skip"), null);
        assert.equal(serverFunctions.normalizeHabitLogRetention("30_DAYS"), "30_days");
        assert.equal(serverFunctions.normalizeHabitLogRetention(""), "30_days");
        assert.equal(serverFunctions.normalizeHabitLogRetention("never"), "30_days");
        assert.equal(serverFunctions.normalizeHabitLogRetention("forever-ish"), null);
        assert.equal(serverFunctions.normalizeThemePreference("dark"), "dark");
        assert.equal(serverFunctions.normalizeThemePreference(""), "light");
        assert.equal(serverFunctions.normalizeThemePreference("solarized"), null);
        assert.deepEqual(
            { ...serverFunctions.parseDashboardPreferences('{"habit":{"sort":"favorites"}}') },
            { habit: { sort: "favorites" } }
        );
        assert.deepEqual(
            JSON.parse(JSON.stringify(serverFunctions.normalizeDashboardPreferences({
                habit: { search: "  focus  ", favoritesOnly: 1, sort: "streak-desc" },
                chart: { rangeDays: 90, metric: "rate", chartType: "bar" }
            }))),
            {
                habit: { search: "focus", favoritesOnly: true, sort: "streak-desc" },
                chart: { rangeDays: "90", metric: "rate", chartType: "bar" }
            }
        );
        assert.equal(serverFunctions.formatDateOnly(new Date(2026, 3, 23)), "2026-04-23");
        assert.equal(
            serverFunctions.getHabitLogRetentionCutoff("7_days", new Date("2026-04-23T12:00:00Z")),
            "2026-04-17"
        );
        assert.equal(
            serverFunctions.getHabitLogRetentionCutoff("30_days", new Date("2026-04-23T12:00:00Z")),
            "2026-03-25"
        );
        assert.equal(
            serverFunctions.getHabitLogRetentionCutoff("monthly", new Date("2026-04-23T12:00:00Z")),
            "2026-04-01"
        );
    })));

    failed += Number(!(await runTest("server.js unit tests: tag parsing handles csv input and enforces limits", () => {
        assert.deepEqual(
            [...serverFunctions.parseStoredHabitTags(" Focus, Health, focus, Sleep ")],
            ["Focus", "Health", "Sleep"]
        );
        assert.equal(serverFunctions.normalizeHabitCategory(" ".repeat(6)), null);
    })));

    failed += Number(!(await runTest("server.js unit tests: dashboard preference normalization drops unsupported values", () => {
        assert.deepEqual(
            JSON.parse(JSON.stringify(serverFunctions.normalizeDashboardPreferences({
                habit: { search: "  nightly reset  ", sort: "unsupported-sort", category: " Deep   Work " },
                chart: { habitId: "15", rangeDays: "365", metric: "rate", chartType: "pie" }
            }))),
            {
                habit: { search: "nightly reset", category: "Deep Work" },
                chart: { habitId: "15", metric: "rate" }
            }
        );
        assert.deepEqual(
            { ...serverFunctions.parseDashboardPreferences("not-json") },
            {}
        );
    })));

    failed += Number(!(await runTest("server.js unit tests: avatar helpers parse supported data URLs", () => {
        const parsed = serverFunctions.parseAvatarDataUrl("data:image/png;base64,aGVsbG8=");
        assert.equal(parsed.mimeType, "image/png");
        assert.equal(parsed.buffer.toString("utf8"), "hello");
        assert.equal(serverFunctions.parseAvatarDataUrl("data:text/plain;base64,aGVsbG8="), null);
        assert.equal(serverFunctions.getAvatarExtension("image/jpeg"), "jpg");
        assert.equal(serverFunctions.getAvatarExtension("image/gif"), null);
    })));

    failed += Number(!(await runTest("server.js unit tests: isManagedAvatarPath recognizes app-managed avatar files", () => {
        assert.equal(serverFunctions.isManagedAvatarPath("/uploads/avatars/550e8400-e29b-41d4-a716-446655440000-7.png"), true);
        assert.equal(serverFunctions.isManagedAvatarPath("/uploads/avatars/not-managed.gif"), false);
        assert.equal(serverFunctions.isManagedAvatarPath("../unsafe.png"), false);
    })));

    // Unit tests for the pure helper logic used by src/server.js.
    failed += Number(!(await runTest("server.js unit tests: hashPassword and verifyPassword work together", async () => {
        const password = "HabitTrack123";
        const hash = await serverFunctions.hashPassword(password);

        assert.match(hash, /^[a-f0-9]+:[a-f0-9]+$/);
        assert.equal(await serverFunctions.verifyPassword(password, hash), true);
        assert.equal(await serverFunctions.verifyPassword("wrong-password", hash), false);
        assert.equal(await serverFunctions.verifyPassword(password, "bad-format"), false);
    })));

    return failed;
};
