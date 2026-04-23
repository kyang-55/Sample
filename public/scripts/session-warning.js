(function initializeSessionWarningModule() {
    const DEFAULT_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
    const DEFAULT_WARNING_DURATION_MS = 60 * 1000;
    const ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart", "pointerdown"];

    let state = null;

    function formatCountdown(msRemaining) {
        const totalSeconds = Math.max(0, Math.ceil(Number(msRemaining || 0) / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${String(seconds).padStart(2, "0")}`;
    }

    function ensureModal() {
        let root = document.getElementById("sessionWarningRoot");
        if (root) {
            return root;
        }

        const style = document.createElement("style");
        style.textContent = `
            .session-warning {
                position: fixed;
                inset: 0;
                z-index: 60;
                display: grid;
                place-items: center;
                padding: 20px;
            }
            .session-warning.hidden {
                display: none;
            }
            .session-warning__backdrop {
                position: absolute;
                inset: 0;
                background: rgba(20, 26, 58, 0.42);
                backdrop-filter: blur(6px);
            }
            .session-warning__dialog {
                position: relative;
                width: min(460px, calc(100vw - 32px));
                padding: 24px;
                border-radius: 28px;
                border: 1px solid rgba(255, 255, 255, 0.24);
                background: linear-gradient(145deg, rgba(255, 255, 255, 0.96), rgba(244, 247, 255, 0.96));
                box-shadow: 0 28px 80px rgba(37, 45, 96, 0.28);
                color: #1d2340;
                font-family: "Lato", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
            }
            .session-warning__eyebrow {
                margin: 0 0 10px;
                color: #5a51d6;
                font-size: 0.76rem;
                font-weight: 700;
                letter-spacing: 0.16em;
                text-transform: uppercase;
            }
            .session-warning__title {
                margin: 0;
                font-size: 1.35rem;
            }
            .session-warning__copy {
                margin: 12px 0 0;
                color: #667093;
                line-height: 1.6;
            }
            .session-warning__countdown {
                margin-top: 16px;
                display: inline-flex;
                align-items: center;
                padding: 8px 12px;
                border-radius: 999px;
                background: rgba(93, 107, 255, 0.1);
                color: #443da8;
                font-weight: 700;
            }
            .session-warning__actions {
                margin-top: 20px;
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                flex-wrap: wrap;
            }
            .session-warning__btn {
                border-radius: 16px;
                font-size: 0.96rem;
                padding: 12px 16px;
                border: 1px solid transparent;
                cursor: pointer;
            }
            .session-warning__btn--primary {
                background: linear-gradient(135deg, #5d6bff, #6e42ff);
                color: #fff;
            }
            .session-warning__btn--secondary {
                background: rgba(255, 255, 255, 0.92);
                color: #1d2340;
                border-color: rgba(90, 108, 182, 0.18);
            }
            @media (max-width: 560px) {
                .session-warning__actions .session-warning__btn {
                    width: 100%;
                }
            }
        `;
        document.head.appendChild(style);

        root = document.createElement("div");
        root.id = "sessionWarningRoot";
        root.className = "session-warning hidden";
        root.setAttribute("aria-hidden", "true");
        root.innerHTML = `
            <div class="session-warning__backdrop"></div>
            <section class="session-warning__dialog" role="dialog" aria-modal="true" aria-labelledby="sessionWarningTitle">
                <p class="session-warning__eyebrow">Session warning</p>
                <h2 id="sessionWarningTitle" class="session-warning__title">You are about to be signed out</h2>
                <p class="session-warning__copy">We noticed 10 minutes of inactivity. Stay signed in to keep working without interruption.</p>
                <div id="sessionWarningCountdown" class="session-warning__countdown">Time remaining: 1:00</div>
                <div class="session-warning__actions">
                    <button id="sessionWarningLogout" class="session-warning__btn session-warning__btn--secondary" type="button">Log out now</button>
                    <button id="sessionWarningStay" class="session-warning__btn session-warning__btn--primary" type="button">Stay signed in</button>
                </div>
            </section>
        `;
        document.body.appendChild(root);
        return root;
    }

    function clearTimers() {
        if (!state) {
            return;
        }

        window.clearTimeout(state.warningTimerId);
        window.clearTimeout(state.logoutTimerId);
        window.clearInterval(state.countdownIntervalId);
        state.warningTimerId = null;
        state.logoutTimerId = null;
        state.countdownIntervalId = null;
    }

    function hideModal() {
        if (!state?.root) {
            return;
        }

        state.root.classList.add("hidden");
        state.root.setAttribute("aria-hidden", "true");
        document.body.classList.remove("modal-open");
    }

    async function performLogout() {
        if (!state) {
            return;
        }

        clearTimers();

        try {
            await fetch(`${state.api}/auth/logout`, {
                method: "POST",
                credentials: "include"
            });
        } catch {
            // Redirect even if the logout request fails so the user is not left in a stale state.
        }

        window.location.replace(`${state.pageBase}/login.html`);
    }

    function updateCountdown() {
        if (!state?.countdownEl || !state.warningEndsAt) {
            return;
        }

        const remaining = Math.max(0, state.warningEndsAt - Date.now());
        state.countdownEl.textContent = `Time remaining: ${formatCountdown(remaining)}`;
    }

    function showWarning() {
        if (!state?.root) {
            return;
        }

        state.warningEndsAt = Date.now() + state.warningDurationMs;
        state.root.classList.remove("hidden");
        state.root.setAttribute("aria-hidden", "false");
        document.body.classList.add("modal-open");
        updateCountdown();

        state.countdownIntervalId = window.setInterval(updateCountdown, 250);
        state.logoutTimerId = window.setTimeout(() => {
            performLogout();
        }, state.warningDurationMs);
    }

    function scheduleTimers() {
        if (!state) {
            return;
        }

        clearTimers();
        hideModal();

        state.warningTimerId = window.setTimeout(() => {
            showWarning();
        }, Math.max(0, state.idleTimeoutMs - state.warningDurationMs));
    }

    function handleActivity() {
        if (!state) {
            return;
        }

        scheduleTimers();
    }

    function attachListeners() {
        if (!state || state.listenersAttached) {
            return;
        }

        ACTIVITY_EVENTS.forEach((eventName) => {
            window.addEventListener(eventName, handleActivity, { passive: true });
        });

        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") {
                handleActivity();
            }
        });

        state.stayButton.addEventListener("click", handleActivity);
        state.logoutButton.addEventListener("click", performLogout);
        state.listenersAttached = true;
    }

    window.HabitTrackSessionWarning = {
        init(options = {}) {
            if (state?.initialized) {
                return;
            }

            const root = ensureModal();
            state = {
                initialized: true,
                listenersAttached: false,
                api: String(options.api || "").trim(),
                pageBase: String(options.pageBase || ".").trim(),
                idleTimeoutMs: Number(options.idleTimeoutMs) || DEFAULT_IDLE_TIMEOUT_MS,
                warningDurationMs: Number(options.warningDurationMs) || DEFAULT_WARNING_DURATION_MS,
                root,
                countdownEl: document.getElementById("sessionWarningCountdown"),
                stayButton: document.getElementById("sessionWarningStay"),
                logoutButton: document.getElementById("sessionWarningLogout"),
                warningTimerId: null,
                logoutTimerId: null,
                countdownIntervalId: null,
                warningEndsAt: null
            };

            attachListeners();
            scheduleTimers();
        }
    };
}());
