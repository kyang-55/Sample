// Unit tests for public/scripts/verify-login.js:
// maskEmail, formatCountdown.
const { loadFunctions } = require("./helpers/source-loader");
const { assert, runTest } = require("./helpers/test-harness");

const verifyLoginFunctions = loadFunctions("public/scripts/verify-login.js", [
    "maskEmail",
    "formatCountdown"
]);

module.exports = async function runVerifyLoginUnitTests() {
    let failed = 0;

    // Unit tests for the helper logic used by public/scripts/verify-login.js.
    failed += Number(!(await runTest("verify-login.js unit tests: maskEmail hides most of the local part", () => {
        assert.equal(verifyLoginFunctions.maskEmail("person@example.com"), "pe****@example.com");
        assert.equal(verifyLoginFunctions.maskEmail("ab@example.com"), "a*@example.com");
    })));

    // Unit tests for the helper logic used by public/scripts/verify-login.js.
    failed += Number(!(await runTest("verify-login.js unit tests: formatCountdown returns mm:ss output", () => {
        assert.equal(verifyLoginFunctions.formatCountdown(61_000), "1:01");
        assert.equal(verifyLoginFunctions.formatCountdown(0), "0:00");
        assert.equal(verifyLoginFunctions.formatCountdown(-500), "0:00");
    })));

    return failed;
};
