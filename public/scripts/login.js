const LOCAL_SERVER_ORIGIN = "http://localhost:3000";
const useLocalServer = window.location.protocol === "file:"
    || (
        ["localhost", "127.0.0.1"].includes(window.location.hostname)
        && window.location.port
        && window.location.port !== "3000"
    );
const API = useLocalServer ? LOCAL_SERVER_ORIGIN : "";
const PAGE_BASE = useLocalServer ? `${LOCAL_SERVER_ORIGIN}/pages` : ".";

async function readJson(res) {
    const text = await res.text();
    try {
        return text ? JSON.parse(text) : {};
    } catch {
        return {};
    }
}

function showFeedback(message) {
    document.getElementById("feedback").textContent = message;
}

function setSubmitting(isSubmitting) {
    const button = document.getElementById("loginButton");
    button.disabled = isSubmitting;
    button.textContent = isSubmitting ? "Sending code..." : "Continue";
}

const loginForm = document.getElementById("loginForm");
window.HabitTrackAuthUI?.enableBrowserNotifications(loginForm);

async function redirectIfAuthenticated() {
    try {
        const res = await fetch(`${API}/auth/me`, { credentials: "include" });
        if (res.ok) {
            window.location.replace(`${PAGE_BASE}/index.html`);
        }
    } catch {
        // Keep the user on the login page if the server is unavailable.
    }
}

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showFeedback("");
    setSubmitting(true);

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const rememberMe = document.getElementById("rememberMe").checked;

    const res = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password, rememberMe })
    });

    const data = await readJson(res);

    if (!res.ok) {
        showFeedback(data.error || "Unable to log in.");
        await window.HabitTrackAuthUI?.notifyAuthEvent(
            "Login failed",
            data.error || "Your email or password was not accepted. Check your credentials and try again.",
            "habittrack-login-failed"
        );
        setSubmitting(false);
        return;
    }

    if (data.requiresTwoStep && data.challengeId) {
        sessionStorage.setItem(
            "habittrack_login_challenge",
            JSON.stringify({
                challengeId: data.challengeId,
                email: data.email,
                expiresAt: data.expiresAt,
                delivery: data.delivery
            })
        );

        const nextUrl = `${PAGE_BASE}/verify-login.html?challenge=${encodeURIComponent(data.challengeId)}`;
        window.location.replace(nextUrl);
        return;
    }

    window.location.replace(`${PAGE_BASE}/index.html`);
});

redirectIfAuthenticated();
