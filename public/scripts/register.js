const PAGE_BASE = window.HabitTrackFirebaseAuth?.API ? `${window.HabitTrackFirebaseAuth.API}/pages` : ".";

function showFeedback(message) {
    document.getElementById("feedback").textContent = message;
}

const registerForm = document.getElementById("registerForm");
const passwordMeter = window.HabitTrackAuthUI?.attachPasswordMeter({
    passwordInputId: "password",
    confirmInputId: "confirmPassword",
    meterId: "passwordMeter",
    strengthLabelId: "passwordStrengthLabel",
    descriptionId: "passwordDescription",
    requirementsId: "passwordRequirements",
    matchHintId: "passwordMatchHint"
});

window.HabitTrackAuthUI?.enableBrowserNotifications(registerForm);

async function redirectIfAuthenticated() {
    try {
        const res = await fetch(`${window.HabitTrackFirebaseAuth.API}/auth/me`, { credentials: "include" });
        if (res.ok) {
            window.location.replace(`${PAGE_BASE}/index.html`);
        }
    } catch {
        // Keep the user on the registration page if the server is unavailable.
    }
}

registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showFeedback("");

    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    if (!passwordMeter?.isValid()) {
        const guidance = "Password must be at least 8 characters and include at least one letter and one number.";
        showFeedback(guidance);
        await window.HabitTrackAuthUI?.notifyAuthEvent(
            "Password requirements not met",
            guidance,
            "habittrack-password-invalid"
        );
        return;
    }

    if (password !== confirmPassword) {
        showFeedback("Passwords do not match.");
        await window.HabitTrackAuthUI?.notifyAuthEvent(
            "Password confirmation failed",
            "The password and confirmation field do not match yet.",
            "habittrack-password-mismatch"
        );
        return;
    }

    try {
        await window.HabitTrackFirebaseAuth.registerWithFirebase({ name, email, password });
        sessionStorage.setItem(
            "habittrack_notice",
            "Account created. Check your email for the Firebase verification link before logging in."
        );
        window.location.replace(`${PAGE_BASE}/login.html`);
    } catch (error) {
        const message = error.message || "Registration failed.";
        showFeedback(message);
        await window.HabitTrackAuthUI?.notifyAuthEvent(
            "Registration blocked",
            message,
            "habittrack-register-failed"
        );
    }
});

redirectIfAuthenticated();
