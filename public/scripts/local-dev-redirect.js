(function redirectLocalPagesToServer() {
    const isPreviewOrigin = ["localhost", "127.0.0.1"].includes(window.location.hostname)
        && window.location.port
        && window.location.port !== "3000";

    if (window.location.protocol !== "file:" && !isPreviewOrigin) {
        return;
    }

    const serverOrigin = "http://localhost:3000";
    const fileName = window.location.pathname.split(/[\\/]/).pop() || "index.html";
    const targetUrl = `${serverOrigin}/pages/${fileName}${window.location.search}${window.location.hash}`;
    window.location.replace(targetUrl);
})();
