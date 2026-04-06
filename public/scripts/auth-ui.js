(function initializeHabitTrackAuthUi() {
    const MIN_PASSWORD_LENGTH = 8;

    function evaluatePassword(password) {
        const value = String(password || "");
        const hasLowercase = /[a-z]/.test(value);
        const hasUppercase = /[A-Z]/.test(value);
        const hasLetter = /[A-Za-z]/.test(value);
        const hasNumber = /\d/.test(value);
        const hasSpecial = /[^A-Za-z0-9]/.test(value);
        const isLongEnough = value.length >= MIN_PASSWORD_LENGTH;
        const isVeryLong = value.length >= 12;
        const isExtraLong = value.length >= 16;
        const meetsMinimum = isLongEnough && hasLetter && hasNumber;

        let score = 0;
        if (isLongEnough) score += 1;
        if (isVeryLong) score += 1;
        if (isExtraLong) score += 1;
        if (hasLowercase) score += 1;
        if (hasUppercase) score += 1;
        if (hasNumber) score += 1;
        if (hasSpecial) score += 1;

        let strength = "Too weak";
        let tone = "weak";
        let description = "Use at least 8 characters with a letter and a number.";

        if (value.length === 0) {
            strength = "No password yet";
            tone = "empty";
            description = "Choose a password with at least 8 characters, including a letter and a number.";
        } else if (meetsMinimum && score >= 7) {
            strength = "Strong";
            tone = "strong";
            description = "Nice. This password meets the minimum rules and adds extra complexity.";
        } else if (meetsMinimum && score >= 5) {
            strength = "Good";
            tone = "good";
            description = "This works well. Adding a symbol or more length would make it even stronger.";
        } else if (meetsMinimum) {
            strength = "Fair";
            tone = "fair";
            description = "This password meets the minimum requirements.";
        }

        return {
            value,
            meetsMinimum,
            strength,
            tone,
            description,
            requirements: [
                {
                    label: "At least 8 characters",
                    met: isLongEnough
                },
                {
                    label: "At least one letter",
                    met: hasLetter
                },
                {
                    label: "At least one number",
                    met: hasNumber
                },
                {
                    label: "Upper and lowercase letters",
                    met: hasLowercase && hasUppercase,
                    optional: true
                },
                {
                    label: "A special character",
                    met: hasSpecial,
                    optional: true
                }
            ]
        };
    }

    function attachPasswordMeter(options) {
        const passwordInput = document.getElementById(options.passwordInputId);
        const confirmInput = options.confirmInputId ? document.getElementById(options.confirmInputId) : null;
        const meter = document.getElementById(options.meterId);
        const bar = meter ? meter.querySelector("[data-password-meter-bar]") : null;
        const label = document.getElementById(options.strengthLabelId);
        const description = document.getElementById(options.descriptionId);
        const checklist = document.getElementById(options.requirementsId);
        const matchHint = options.matchHintId ? document.getElementById(options.matchHintId) : null;

        if (!passwordInput || !meter || !bar || !label || !description || !checklist) {
            return {
                isValid() {
                    return true;
                },
                refresh() {
                    return null;
                }
            };
        }

        function renderRequirements(state) {
            checklist.innerHTML = state.requirements.map((requirement) => `
                <li class="password-checklist__item${requirement.met ? " is-met" : ""}${requirement.optional ? " is-optional" : ""}">
                    ${requirement.label}
                </li>
            `).join("");
        }

        function renderMatchState() {
            if (!matchHint || !confirmInput) return;

            if (!confirmInput.value) {
                matchHint.textContent = "";
                matchHint.className = "auth-hint auth-hint--match";
                return;
            }

            const matches = passwordInput.value === confirmInput.value;
            matchHint.textContent = matches ? "Passwords match." : "Passwords do not match yet.";
            matchHint.className = `auth-hint auth-hint--match ${matches ? "is-valid" : "is-invalid"}`;
        }

        function refresh() {
            const state = evaluatePassword(passwordInput.value);
            const progress = state.value.length === 0
                ? 0
                : state.tone === "strong"
                    ? 100
                    : state.tone === "good"
                        ? 78
                        : state.tone === "fair"
                            ? 56
                            : 28;

            meter.dataset.strength = state.tone;
            bar.style.width = `${progress}%`;
            label.textContent = state.strength;
            description.textContent = state.description;
            renderRequirements(state);
            renderMatchState();
            return state;
        }

        passwordInput.addEventListener("input", refresh);

        if (confirmInput) {
            confirmInput.addEventListener("input", renderMatchState);
        }

        refresh();

        return {
            refresh,
            isValid() {
                return evaluatePassword(passwordInput.value).meetsMinimum;
            }
        };
    }

    function enableBrowserNotifications(form) {
        if (!form || !("Notification" in window) || Notification.permission !== "default") {
            return;
        }

        const requestPermission = () => {
            form.removeEventListener("pointerdown", requestPermission);
            form.removeEventListener("keydown", requestPermission);
            form.removeEventListener("submit", requestPermission);

            Notification.requestPermission().catch(() => {
                // Ignore notification permission failures and keep inline feedback.
            });
        };

        form.addEventListener("pointerdown", requestPermission, { once: true });
        form.addEventListener("keydown", requestPermission, { once: true });
        form.addEventListener("submit", requestPermission, { once: true });
    }

    async function notifyAuthEvent(title, body, tag = "habittrack-auth") {
        if (!("Notification" in window) || Notification.permission !== "granted") {
            return false;
        }

        try {
            const notification = new Notification(title, {
                body,
                tag,
                renotify: true
            });

            window.setTimeout(() => notification.close(), 5000);
            return true;
        } catch {
            return false;
        }
    }

    window.HabitTrackAuthUI = {
        attachPasswordMeter,
        enableBrowserNotifications,
        evaluatePassword,
        notifyAuthEvent
    };
})();
