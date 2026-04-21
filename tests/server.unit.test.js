// Unit tests for src/server.js:
// parseCookies, normalizeEmail, validatePassword, hashPassword, verifyPassword.
const crypto = require("crypto");
const { loadFunctions } = require("./helpers/source-loader");
const { assert, runTest } = require("./helpers/test-harness");

const serverFunctions = loadFunctions(
    "src/server.js",
    [
        "parseCookies",
        "normalizeEmail",
        "validatePassword",
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
