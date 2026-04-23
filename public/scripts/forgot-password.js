function showFeedback(message) {
    document.getElementById("feedback").textContent = message;
}

document.getElementById("forgotPasswordForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    showFeedback("");

    const email = document.getElementById("email").value.trim();

    try {
        await window.HabitTrackFirebaseAuth.sendPasswordResetWithFirebase(email);
        showFeedback("If that email exists, Firebase has sent a password reset email.");
    } catch (error) {
        showFeedback(error.message || "Unable to send reset email.");
    }
});
