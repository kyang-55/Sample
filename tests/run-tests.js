const suites = [
    require("./app.unit.test"),
    require("./auth-ui.unit.test"),
    require("./server.unit.test"),
    require("./verify-login.unit.test")
];

(async () => {
    let failed = 0;

    for (const runSuite of suites) {
        failed += await runSuite();
    }

    if (failed > 0) {
        process.exitCode = 1;
        return;
    }

    console.log("All unit tests passed.");
})();
