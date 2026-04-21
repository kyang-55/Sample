const LOCAL_SERVER_ORIGIN = "http://localhost:3000";
const useLocalServer = window.location.protocol === "file:"
    || (
        ["localhost", "127.0.0.1"].includes(window.location.hostname)
        && window.location.port
        && window.location.port !== "3000"
    );
const API = useLocalServer ? LOCAL_SERVER_ORIGIN : "";
const PAGE_BASE = useLocalServer ? `${LOCAL_SERVER_ORIGIN}/pages` : ".";
let countdownInterval = null;

async function readJson(res) {
    const text = await res.text();
    try {
        return text ? JSON.parse(text) : {};
    } catch {
        return {};
    }
}

function getStoredChallenge() {
    const raw = sessionStorage.getItem("habittrack_login_challenge");
    if (!raw) return null;

    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function setStoredChallenge(challenge) {
    sessionStorage.setItem("habittrack_login_challenge", JSON.stringify(challenge));
}

function clearStoredChallenge() {
    sessionStorage.removeItem("habittrack_login_challenge");
}

function showFeedback(message) {
    document.getElementById("feedback").textContent = message;
}

function setVerifySubmitting(isSubmitting) {
    const button = document.getElementById("verifyButton");
    button.disabled = isSubmitting;
    button.textContent = isSubmitting ? "Verifying..." : "Verify and sign in";
}

function setResendSubmitting(isSubmitting) {
    const button = document.getElementById("resendButton");
    button.disabled = isSubmitting;
    button.textContent = isSubmitting ? "Sending..." : "Resend code";
}

function maskEmail(email) {
    const [name, domain] = String(email || "").split("@");
    if (!name || !domain) return email || "";
    if (name.length <= 2) return `${name[0] || ""}*@${domain}`;
    return `${name.slice(0, 2)}${"*".repeat(Math.max(1, name.length - 2))}@${domain}`;
}

function formatCountdown(msRemaining) {
    const totalSeconds = Math.max(0, Math.ceil(msRemaining / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function updateExpiry(challenge) {
    const expiry = document.getElementById("verifyExpiry");
    if (!challenge?.expiresAt) {
        expiry.textContent = "";
        return;
    }

    const msRemaining = new Date(challenge.expiresAt).getTime() - Date.now();
    if (msRemaining <= 0) {
        expiry.textContent = "Code expired. Resend to get a new one.";
        return;
    }

    expiry.textContent = `Expires in ${formatCountdown(msRemaining)}`;
}

function startExpiryCountdown(challenge) {
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }

    updateExpiry(challenge);
    countdownInterval = setInterval(() => {
        updateExpiry(getStoredChallenge());
    }, 1000);
}

function renderDeliveryDetails(challenge) {
    const details = document.getElementById("deliveryDetails");
    if (!challenge?.delivery) {
        details.classList.add("hidden");
        details.innerHTML = "";
        return;
    }

    if (challenge.delivery.delivery === "file") {
        details.classList.remove("hidden");
        details.innerHTML = `
            <p class="reset-link-copy">A verification code was sent for local testing.</p>
        `;
        return;
    }

    details.classList.add("hidden");
    details.innerHTML = "";
}

function seedChallengeFromState() {
    const params = new URLSearchParams(window.location.search);
    const challengeId = params.get("challenge");
    const challenge = getStoredChallenge();

    if (!challenge || !challengeId || challenge.challengeId !== challengeId) {
        window.location.replace(`${PAGE_BASE}/login.html`);
        return null;
    }

    const verifyCopy = document.getElementById("verifyCopy");
    verifyCopy.textContent = `Enter the 6-digit verification code sent to ${maskEmail(challenge.email)}.`;
    renderDeliveryDetails(challenge);
    startExpiryCountdown(challenge);
    return challenge;
}

document.getElementById("verifyLoginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    showFeedback("");
    setVerifySubmitting(true);

    const challenge = getStoredChallenge();
    if (!challenge?.challengeId) {
        window.location.replace(`${PAGE_BASE}/login.html`);
        return;
    }

    const code = document.getElementById("code").value.replace(/\D/g, "").trim();
    document.getElementById("code").value = code;

    const res = await fetch(`${API}/auth/verify-login-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
            challengeId: challenge.challengeId,
            code
        })
    });

    const data = await readJson(res);

    if (!res.ok) {
        showFeedback(data.error || "Unable to verify code.");
        setVerifySubmitting(false);
        return;
    }

    clearStoredChallenge();
    window.location.replace(`${PAGE_BASE}/index.html`);
});

document.getElementById("resendButton").addEventListener("click", async () => {
    showFeedback("");
    setResendSubmitting(true);

    const challenge = getStoredChallenge();
    if (!challenge?.challengeId) {
        window.location.replace(`${PAGE_BASE}/login.html`);
        return;
    }

    const res = await fetch(`${API}/auth/resend-login-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ challengeId: challenge.challengeId })
    });

    const data = await readJson(res);

    if (!res.ok) {
        showFeedback(data.error || "Unable to resend code.");
        setResendSubmitting(false);
        return;
    }

    const updatedChallenge = {
        challengeId: data.challengeId,
        email: data.email,
        expiresAt: data.expiresAt,
        delivery: data.delivery
    };

    setStoredChallenge(updatedChallenge);
    const nextUrl = `${PAGE_BASE}/verify-login.html?challenge=${encodeURIComponent(updatedChallenge.challengeId)}`;
    history.replaceState(null, "", nextUrl);
    document.getElementById("verifyCopy").textContent = `Enter the 6-digit verification code sent to ${maskEmail(updatedChallenge.email)}.`;
    renderDeliveryDetails(updatedChallenge);
    startExpiryCountdown(updatedChallenge);
    setResendSubmitting(false);
    showFeedback(data.message || "Verification code resent.");
});

document.getElementById("code").addEventListener("input", (event) => {
    const cleaned = event.target.value.replace(/\D/g, "").slice(0, 6);
    event.target.value = cleaned;
});

seedChallengeFromState();
