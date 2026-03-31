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

function seedTokenFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (token) {
        document.getElementById("token").value = token;
    }
}

document.getElementById("resetPasswordForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    showFeedback("");

    const token = document.getElementById("token").value.trim();
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    if (password !== confirmPassword) {
        showFeedback("Passwords do not match.");
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
        return;
    }

    sessionStorage.setItem("habittrack_notice", "Password updated. Please log in with your new password.");
    window.location.replace("./login.html");
});

seedTokenFromUrl();
