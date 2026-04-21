const LOCAL_SERVER_ORIGIN = "http://localhost:3000";
const useLocalServer = window.location.protocol === "file:"
    || (
        ["localhost", "127.0.0.1"].includes(window.location.hostname)
        && window.location.port
        && window.location.port !== "3000"
    );
const API = useLocalServer ? LOCAL_SERVER_ORIGIN : "";

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

document.getElementById("forgotPasswordForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    showFeedback("");

    const container = document.getElementById("resetLinkContainer");
    container.classList.add("hidden");
    container.innerHTML = "";

    const email = document.getElementById("email").value.trim();

    try {
        const res = await fetch(`${API}/auth/request-password-reset`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ email })
        });

        const data = await readJson(res);

        if (!res.ok) {
            showFeedback(data.error || "Unable to send reset email.");
            return;
        }

        showFeedback(data.message || "If that email exists, a password reset email has been sent.");

        if (data.resetUrl) {
            container.classList.remove("hidden");
            container.innerHTML = `
                <p class="reset-link-copy">A password reset email has been sent. Check your inbox for the reset link.</p>
            `;
        }
    } catch {
        const message = API
            ? `Could not reach the HabitTrack server at ${API}. Start it with npm start and try again.`
            : "Could not reach the HabitTrack server. Start it with npm start and try again.";
        showFeedback(message);
    }
});
