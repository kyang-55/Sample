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

const resetPasswordForm = document.getElementById("resetPasswordForm");
const passwordMeter = window.HabitTrackAuthUI?.attachPasswordMeter({
    passwordInputId: "password",
    confirmInputId: "confirmPassword",
    meterId: "passwordMeter",
    strengthLabelId: "passwordStrengthLabel",
    descriptionId: "passwordDescription",
    requirementsId: "passwordRequirements",
    matchHintId: "passwordMatchHint"
});

window.HabitTrackAuthUI?.enableBrowserNotifications(resetPasswordForm);

function seedTokenFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (token) {
        document.getElementById("token").value = token;
    }
}

resetPasswordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showFeedback("");

    const token = document.getElementById("token").value.trim();
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    if (!passwordMeter?.isValid()) {
        const guidance = "Password must be at least 8 characters and include at least one letter and one number.";
        showFeedback(guidance);
        await window.HabitTrackAuthUI?.notifyAuthEvent(
            "New password is too weak",
            guidance,
            "habittrack-reset-password-invalid"
        );
        return;
    }

    if (password !== confirmPassword) {
        showFeedback("Passwords do not match.");
        await window.HabitTrackAuthUI?.notifyAuthEvent(
            "Password confirmation failed",
            "The new password and confirmation field do not match yet.",
            "habittrack-reset-password-mismatch"
        );
        return;
    }

    const res = await fetch(`${API}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, password })
    });

    const data = await readJson(res);

    if (!res.ok) {
        showFeedback(data.error || "Unable to reset password.");
        await window.HabitTrackAuthUI?.notifyAuthEvent(
            "Password reset failed",
            data.error || "Unable to reset password. Check the token and password requirements, then try again.",
            "habittrack-reset-password-failed"
        );
        return;
    }

    sessionStorage.setItem("habittrack_notice", "Password updated. Please log in with your new password.");
    window.location.replace(`${PAGE_BASE}/login.html`);
});

seedTokenFromUrl();
