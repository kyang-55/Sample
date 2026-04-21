const fs = require("fs");
const path = require("path");
const vm = require("vm");

function extractFunctionSource(source, functionName) {
    const signature = `function ${functionName}(`;
    const start = source.indexOf(signature);

    if (start === -1) {
        throw new Error(`Could not find function "${functionName}" in source.`);
    }

    const bodyStart = source.indexOf("{", start);
    if (bodyStart === -1) {
        throw new Error(`Could not find body for function "${functionName}".`);
    }

    let depth = 0;
    let end = bodyStart;

    for (; end < source.length; end += 1) {
        const char = source[end];
        if (char === "{") depth += 1;
        if (char === "}") {
            depth -= 1;
            if (depth === 0) {
                end += 1;
                break;
            }
        }
    }

    return source.slice(start, end);
}

function loadFunctions(relativePath, functionNames, options = {}) {
    const filePath = path.join(process.cwd(), relativePath);
    const source = fs.readFileSync(filePath, "utf8");
    const snippets = functionNames.map((name) => extractFunctionSource(source, name)).join("\n\n");
    const prelude = options.prelude ? `${options.prelude}\n\n` : "";
    const exportBlock = `module.exports = { ${functionNames.join(", ")} };`;
    const script = `${prelude}${snippets}\n\n${exportBlock}`;

    const context = {
        module: { exports: {} },
        exports: {},
        require,
        console,
        Buffer,
        setTimeout,
        clearTimeout,
        Date,
        Math,
        JSON,
        URL,
        ...options.context
    };

    vm.createContext(context);
    vm.runInContext(script, context, { filename: filePath });
    return context.module.exports;
}

function loadAuthUi() {
    const filePath = path.join(process.cwd(), "public", "scripts", "auth-ui.js");
    const source = fs.readFileSync(filePath, "utf8");
    const context = {
        window: {},
        Notification: {
            permission: "denied",
            requestPermission() {
                return Promise.resolve("denied");
            }
        },
        document: {},
        console,
        setTimeout,
        clearTimeout
    };

    vm.createContext(context);
    vm.runInContext(source, context, { filename: filePath });
    return context.window.HabitTrackAuthUI;
}

module.exports = {
    loadFunctions,
    loadAuthUi
};
