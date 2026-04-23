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
        const data = text ? JSON.parse(text) : {};
        return {
            data,
            text
        };
    } catch {
        return {
            data: {},
            text
        };
    }
}

function showFeedback(message) {
    document.getElementById("feedback").textContent = message;
}

function getRegistrationErrorMessage(res, payload) {
    const { data, text } = payload;

    if (data.error) {
        return data.error;
    }

    if (text && text.trim()) {
        return `Registration failed (${res.status}). ${text.trim()}`;
    }

    if (res.status >= 500) {
        return "The HabitTrack server hit an error while creating your account.";
    }

    return `Registration failed (${res.status}).`;
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

    try {
        const res = await fetch(`${API}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ name, email, password, rememberMe })
        });

        const payload = await readJson(res);
        const data = payload.data;

        if (!res.ok) {
            const message = getRegistrationErrorMessage(res, payload);
            showFeedback(message);
            await window.HabitTrackAuthUI?.notifyAuthEvent(
                "Registration blocked",
                message,
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

        sessionStorage.setItem("habittrack_welcome_new_user", "true");

        window.location.replace(`${PAGE_BASE}/index.html`);
    } catch {
        const message = API
            ? `Could not reach the HabitTrack server at ${API}. Start it with npm start and try again.`
            : "Could not reach the HabitTrack server. Start it with npm start and try again.";
        showFeedback(message);
        await window.HabitTrackAuthUI?.notifyAuthEvent(
            "Registration blocked",
            message,
            "habittrack-register-failed"
        );
    }
});

redirectIfAuthenticated();
