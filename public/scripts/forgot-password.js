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

document.getElementById("forgotPasswordForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    showFeedback("");

    const container = document.getElementById("resetLinkContainer");
    container.classList.add("hidden");
    container.innerHTML = "";

    const email = document.getElementById("email").value.trim();

    const res = await fetch(`${API}/auth/request-password-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email })
    });

    const data = await readJson(res);

    if (!res.ok) {
        showFeedback(data.error || "Unable to create reset link.");
        return;
    }

    showFeedback(data.message || "Reset link created.");

    if (data.resetUrl) {
        container.classList.remove("hidden");
        container.innerHTML = `
            <p class="reset-link-copy">Reset delivery: ${data.delivery?.delivery || "unknown"}</p>
            ${data.delivery?.outboxPath ? `<p class="reset-link-copy">Outbox: ${data.delivery.outboxPath}</p>` : ""}
            <a href="${data.resetUrl}">${data.resetUrl}</a>
        `;
    }
});
