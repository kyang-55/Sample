const assert = require("node:assert/strict");

async function runTest(name, fn) {
    try {
        await fn();
        console.log(`PASS ${name}`);
        return true;
    } catch (error) {
        console.error(`FAIL ${name}`);
        console.error(error && error.stack ? error.stack : error);
        return false;
    }
}

module.exports = {
    assert,
    runTest
};
