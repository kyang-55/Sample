const params = new URLSearchParams(window.location.search);
const mode = params.get("mode");

if (mode === "resetPassword") {
    document.getElementById("resetPasswordMessage").textContent =
        "Firebase opened a password reset flow for this project. Complete the reset in the Firebase page, then return to HabitTrack and log in with your new password.";
}
