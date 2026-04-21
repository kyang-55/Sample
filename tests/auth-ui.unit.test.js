// Unit tests for public/scripts/auth-ui.js:
// evaluatePassword.
const { loadAuthUi } = require("./helpers/source-loader");
const { assert, runTest } = require("./helpers/test-harness");

const authUi = loadAuthUi();

module.exports = async function runAuthUiUnitTests() {
    let failed = 0;

    // Unit tests for the helper logic used by public/scripts/auth-ui.js.
    failed += Number(!(await runTest("auth-ui.js unit tests: evaluatePassword reports empty passwords clearly", () => {
        const result = authUi.evaluatePassword("");

        assert.equal(result.meetsMinimum, false);
        assert.equal(result.strength, "No password yet");
        assert.equal(result.tone, "empty");
    })));

    // Unit tests for the helper logic used by public/scripts/auth-ui.js.
    failed += Number(!(await runTest("auth-ui.js unit tests: evaluatePassword rejects passwords below minimum rules", () => {
        const result = authUi.evaluatePassword("short");

        assert.equal(result.meetsMinimum, false);
        assert.equal(result.strength, "Too weak");
    })));

    // Unit tests for the helper logic used by public/scripts/auth-ui.js.
    failed += Number(!(await runTest("auth-ui.js unit tests: evaluatePassword accepts a minimum-compliant password", () => {
        const result = authUi.evaluatePassword("Password1");

        assert.equal(result.meetsMinimum, true);
        assert.equal(result.strength, "Fair");
        assert.equal(result.tone, "fair");
    })));

    // Unit tests for the helper logic used by public/scripts/auth-ui.js.
    failed += Number(!(await runTest("auth-ui.js unit tests: evaluatePassword rewards stronger passwords", () => {
        const result = authUi.evaluatePassword("VeryStrongPassword123!");

        assert.equal(result.meetsMinimum, true);
        assert.equal(result.strength, "Strong");
        assert.equal(result.tone, "strong");
        assert.equal(result.requirements.find((item) => item.label === "A special character").met, true);
    })));

    return failed;
};
