const PAGE_BASE = window.HabitTrackFirebaseAuth?.API ? `${window.HabitTrackFirebaseAuth.API}/pages` : ".";

function showFeedback(message) {
    document.getElementById("feedback").textContent = message;
}

function setSubmitting(isSubmitting) {
    const button = document.getElementById("loginButton");
    button.disabled = isSubmitting;
    button.textContent = isSubmitting ? "Signing in..." : "Continue";
}

const loginForm = document.getElementById("loginForm");
window.HabitTrackAuthUI?.enableBrowserNotifications(loginForm);

async function redirectIfAuthenticated() {
    try {
        const res = await fetch(`${window.HabitTrackFirebaseAuth.API}/auth/me`, { credentials: "include" });
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

    try {
        const signIn = await window.HabitTrackFirebaseAuth.signInWithFirebase({ email, password });
        await window.HabitTrackFirebaseAuth.createServerSessionFromFirebase(signIn.idToken, rememberMe);
        window.location.replace(`${PAGE_BASE}/index.html`);
    } catch (error) {
        const message = error.message || "Unable to log in.";
        showFeedback(message);
        await window.HabitTrackAuthUI?.notifyAuthEvent(
            "Login failed",
            message,
            "habittrack-login-failed"
        );
        setSubmitting(false);
    }
});

document.getElementById("resendVerificationButton")?.addEventListener("click", async () => {
    showFeedback("");
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    if (!email || !password) {
        showFeedback("Enter your email and password first so we know which account to resend for.");
        return;
    }

    try {
        const signIn = await window.HabitTrackFirebaseAuth.signInWithFirebase({ email, password });
        await window.HabitTrackFirebaseAuth.sendVerificationEmailWithFirebase(signIn.idToken);
        showFeedback("Verification email sent. Check your inbox, then come back and log in again.");
    } catch (error) {
        showFeedback(error.message || "Unable to resend verification email.");
    }
});

redirectIfAuthenticated();
