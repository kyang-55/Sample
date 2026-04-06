const API = "";

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
        const res = await fetch(`${API}/auth/me`, { credentials: "include" });
        if (res.ok) {
            window.location.replace("./index.html");
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
    const rememberMe = document.getElementById("rememberMe").checked;

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

    const res = await fetch(`${API}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, email, password, rememberMe })
    });

    const data = await readJson(res);

    if (!res.ok) {
        showFeedback(data.error || "Unable to create account.");
        await window.HabitTrackAuthUI?.notifyAuthEvent(
            "Registration blocked",
            data.error || "Unable to create account. Check the password requirements and try again.",
            "habittrack-register-failed"
        );
        return;
    }

    if (data.migration?.claimedHabits > 0) {
        sessionStorage.setItem(
            "habittrack_notice",
            `${data.migration.claimedHabits} existing habit(s) were attached to your new admin account.`
        );
    }

    window.location.replace("./index.html");
});

redirectIfAuthenticated();
