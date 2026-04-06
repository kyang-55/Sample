const API = "";
let currentUser = null;

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function formatLocalDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function addDays(isoDate, days) {
    const [year, month, day] = isoDate.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + days);
    return formatLocalDate(date);
}

function dateDiffInDays(fromIso, toIso) {
    const [fromYear, fromMonth, fromDay] = fromIso.split("-").map(Number);
    const [toYear, toMonth, toDay] = toIso.split("-").map(Number);
    const fromDate = new Date(fromYear, fromMonth - 1, fromDay);
    const toDate = new Date(toYear, toMonth - 1, toDay);
    const msPerDay = 24 * 60 * 60 * 1000;

    return Math.round((toDate - fromDate) / msPerDay);
}

function getCurrentStreak(sortedDates, todayIso) {
    if (sortedDates.length === 0) return 0;

    const latest = sortedDates[sortedDates.length - 1];
    const yesterdayIso = addDays(todayIso, -1);

    if (latest !== todayIso && latest !== yesterdayIso) {
        return 0;
    }

    let streak = 1;
    for (let i = sortedDates.length - 1; i > 0; i -= 1) {
        const gap = dateDiffInDays(sortedDates[i - 1], sortedDates[i]);
        if (gap === 1) streak += 1;
        else break;
    }

    return streak;
}

function getLongestStreak(sortedDates) {
    if (sortedDates.length === 0) return 0;

    let longest = 1;
    let current = 1;

    for (let i = 1; i < sortedDates.length; i += 1) {
        const gap = dateDiffInDays(sortedDates[i - 1], sortedDates[i]);
        if (gap === 1) {
            current += 1;
            longest = Math.max(longest, current);
        } else if (gap > 1) {
            current = 1;
        }
    }

    return longest;
}

function getRateInWindow(logSet, todayIso, windowDays) {
    let completed = 0;

    for (let i = 0; i < windowDays; i += 1) {
        const date = addDays(todayIso, -i);
        if (logSet.has(date)) completed += 1;
    }

    return Math.round((completed / windowDays) * 100);
}

function buildCalendarHtml(logSet, todayIso) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const monthName = now.toLocaleString(undefined, { month: "long" });
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDay = new Date(year, month, 1).getDay();

    const weekdayRow = ["S", "M", "T", "W", "T", "F", "S"]
        .map((day) => `<div class="calendar-weekday">${day}</div>`)
        .join("");

    const cells = [];

    for (let i = 0; i < startDay; i += 1) {
        cells.push('<div class="calendar-day calendar-day--empty"></div>');
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
        const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const doneClass = logSet.has(iso) ? " calendar-day--done" : "";
        const todayClass = iso === todayIso ? " calendar-day--today" : "";
        cells.push(`<div class="calendar-day${doneClass}${todayClass}">${day}</div>`);
    }

    return `
        <div class="calendar-title">${monthName} ${year}</div>
        <div class="calendar-grid">${weekdayRow}${cells.join("")}</div>
    `;
}

async function readJson(res) {
    const text = await res.text();
    try {
        return text ? JSON.parse(text) : {};
    } catch {
        return {};
    }
}

async function authFetch(url, options = {}) {
    const res = await fetch(`${API}${url}`, {
        ...options,
        credentials: "include",
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });

    if (res.status === 401) {
        window.location.replace("./login.html");
        throw new Error("Authentication required.");
    }

    return res;
}

function toggleDashboardVisibility(isAuthenticated) {
    ["plannerHeader", "addHabitForm", "habitsHeader", "habitList"].forEach((id) => {
        document.getElementById(id)?.classList.toggle("hidden", !isAuthenticated);
    });

    if (!isAuthenticated) {
        document.getElementById("adminPanel")?.classList.add("hidden");
    }
}

function renderAccountPanel() {
    const welcomeMessage = document.getElementById("welcomeMessage");
    const roleMessage = document.getElementById("roleMessage");
    const registerButton = document.getElementById("registerButton");
    const loginButton = document.getElementById("loginButton");
    const logoutButton = document.getElementById("logoutButton");

    if (currentUser) {
        welcomeMessage.textContent = `Signed in as ${currentUser.name}`;
        roleMessage.textContent = `Role: ${currentUser.role}`;
        registerButton.classList.add("hidden");
        loginButton.classList.add("hidden");
        logoutButton.classList.remove("hidden");
        return;
    }

    welcomeMessage.textContent = "Ready to get started?";
    roleMessage.textContent = "Register for a new account or log in to manage your habits.";
    registerButton.classList.remove("hidden");
    loginButton.classList.remove("hidden");
    logoutButton.classList.add("hidden");
}

async function fetchCurrentUser() {
    const res = await fetch(`${API}/auth/me`, {
        method: "GET",
        credentials: "include"
    });

    if (!res.ok) {
        currentUser = null;
        return null;
    }

    const data = await readJson(res);
    currentUser = data.user || null;
    return currentUser;
}

async function ensureAuthenticated() {
    const user = await fetchCurrentUser();
    renderAccountPanel();
    toggleDashboardVisibility(Boolean(user));
    return user;
}

async function fetchHabitLogs(habitId) {
    const res = await authFetch(`/habits/${habitId}/logs`);
    const data = await readJson(res);

    if (!res.ok) {
        throw new Error(data.error || "Failed to load logs");
    }

    return Array.isArray(data) ? data.map((row) => row.completion_date).filter(Boolean) : [];
}

function calculateHabitStats(logDates) {
    const sortedDates = [...new Set(logDates)].sort();
    const logSet = new Set(sortedDates);
    const todayIso = formatLocalDate(new Date());

    return {
        doneToday: logSet.has(todayIso),
        currentStreak: getCurrentStreak(sortedDates, todayIso),
        longestStreak: getLongestStreak(sortedDates),
        completionRate7: getRateInWindow(logSet, todayIso, 7),
        completionRate30: getRateInWindow(logSet, todayIso, 30),
        totalCompletions: sortedDates.length,
        calendarHtml: buildCalendarHtml(logSet, todayIso)
    };
}

function renderHabitCard(habit, stats) {
    const div = document.createElement("div");
    div.className = `habit-card${stats.doneToday ? " habit-card--done" : ""}`;
    div.dataset.id = habit.id;
    div.dataset.name = habit.name || "";
    div.dataset.description = habit.description || "";

    div.innerHTML = `
        <div class="habit-top">
            <div class="habit-info">
                <div class="habit-name">${escapeHtml(habit.name)}</div>
                <div class="habit-description">${escapeHtml(habit.description || "")}</div>
                <div class="habit-status-row">
                    <span class="status-pill ${stats.doneToday ? "status-pill--done" : "status-pill--pending"}">
                        ${stats.doneToday ? "Done today" : "Not done today"}
                    </span>
                    <span class="habit-total">${stats.totalCompletions} total check-ins</span>
                </div>
            </div>
            <div class="habit-actions">
                <button class="btn btn-log" onclick="logHabit(${habit.id})" ${stats.doneToday ? "disabled" : ""}>
                    ${stats.doneToday ? "Done" : "Log"}
                </button>
                <button class="btn btn-edit" onclick="editHabit(${habit.id})">Edit</button>
                <button class="btn btn-delete" onclick="deleteHabit(${habit.id})">Delete</button>
            </div>
        </div>

        <div class="habit-stats">
            <div class="stat-chip"><span>Current streak</span><strong>${stats.currentStreak}d</strong></div>
            <div class="stat-chip"><span>Best streak</span><strong>${stats.longestStreak}d</strong></div>
            <div class="stat-chip"><span>Last 7 days</span><strong>${stats.completionRate7}%</strong></div>
            <div class="stat-chip"><span>Last 30 days</span><strong>${stats.completionRate30}%</strong></div>
        </div>

        <div class="habit-calendar">${stats.calendarHtml}</div>
    `;

    return div;
}

async function loadHabits() {
    const list = document.getElementById("habitList");

    try {
        const res = await authFetch("/habits");
        const data = await readJson(res);

        if (!res.ok) {
            showFeedback(data.error || "Failed to load habits.");
            return;
        }

        const habits = Array.isArray(data) ? data : [];
        list.innerHTML = "";

        if (habits.length === 0) {
            list.innerHTML = '<div class="empty-state">No habits yet. Add one to get started.</div>';
            return;
        }

        const cards = await Promise.all(
            habits.map(async (habit) => {
                const logs = await fetchHabitLogs(habit.id);
                const stats = calculateHabitStats(logs);
                return renderHabitCard(habit, stats);
            })
        );

        cards.forEach((card) => list.appendChild(card));
    } catch (error) {
        const details = error && error.message ? ` (${error.message})` : "";
        showFeedback(`Could not load habits${details}`);
    }
}

async function addHabit() {
    const nameInput = document.getElementById("habitName");
    const descriptionInput = document.getElementById("habitDescription");
    const name = nameInput.value.trim();
    const description = descriptionInput.value.trim();

    if (!name) {
        showFeedback("Please enter a habit name.");
        return;
    }

    const res = await authFetch("/habits", {
        method: "POST",
        body: JSON.stringify({ name, description })
    });

    const data = await readJson(res);

    if (!res.ok) {
        showFeedback(data.error || "Unable to add habit.");
        return;
    }

    nameInput.value = "";
    descriptionInput.value = "";
    showFeedback("Habit added!", true);
    loadHabits();
}

async function deleteHabit(id) {
    if (!confirm("Are you sure you want to delete this habit?")) return;

    const res = await authFetch(`/habits/${id}`, { method: "DELETE" });
    const data = await readJson(res);

    if (!res.ok) {
        showFeedback(data.error || "Unable to delete habit.");
        return;
    }

    showFeedback("Habit deleted!", true);
    loadHabits();
}

async function logHabit(id) {
    const today = formatLocalDate(new Date());

    const res = await authFetch(`/habits/${id}/log`, {
        method: "POST",
        body: JSON.stringify({ completion_date: today })
    });

    const data = await readJson(res);

    if (!res.ok || data.error) {
        showFeedback(data.error || "Unable to log habit.");
        return;
    }

    showFeedback(data.message || "Habit logged successfully.", true);
    loadHabits();
}

async function editHabit(id) {
    const card = document.querySelector(`.habit-card[data-id="${id}"]`);
    const currentName = card?.dataset.name || "";
    const currentDescription = card?.dataset.description || "";

    const newName = prompt("Edit habit name:", currentName);
    if (newName === null) return;

    const trimmedName = newName.trim();
    if (!trimmedName) {
        showFeedback("Habit name cannot be empty.");
        return;
    }

    const newDescription = prompt("Edit description (optional):", currentDescription);
    if (newDescription === null) return;

    const res = await authFetch(`/habits/${id}`, {
        method: "PUT",
        body: JSON.stringify({
            name: trimmedName,
            description: newDescription.trim() || null
        })
    });

    const data = await readJson(res);

    if (!res.ok) {
        showFeedback(data.error || "Unable to update habit.");
        return;
    }

    showFeedback("Habit updated!", true);
    loadHabits();
}

function showFeedback(message, success = false) {
    const feedback = document.getElementById("feedback");
    feedback.textContent = message;
    feedback.className = success ? "success-message" : "feedback-message";

    setTimeout(() => {
        feedback.textContent = "";
        feedback.className = "feedback-message";
    }, 3000);
}

function showStoredNotice() {
    const message = sessionStorage.getItem("habittrack_notice");
    if (!message) return;

    sessionStorage.removeItem("habittrack_notice");
    showFeedback(message, true);
}

async function loadAdminPanel() {
    const panel = document.getElementById("adminPanel");
    if (currentUser?.role !== "admin") {
        panel.classList.add("hidden");
        panel.innerHTML = "";
        return;
    }

    const res = await authFetch("/admin/users");
    const data = await readJson(res);

    if (!res.ok) {
        panel.classList.remove("hidden");
        panel.innerHTML = `<div class="empty-state">${escapeHtml(data.error || "Unable to load admin tools.")}</div>`;
        return;
    }

    const users = Array.isArray(data.users) ? data.users : [];
    const orphanHabits = Number(data.orphanHabits || 0);
    const userRows = users.map((user) => `
        <tr>
            <td>${escapeHtml(user.name)}</td>
            <td>${escapeHtml(user.email)}</td>
            <td>
                <select class="role-select" data-user-id="${user.id}">
                    <option value="user" ${user.role === "user" ? "selected" : ""}>user</option>
                    <option value="admin" ${user.role === "admin" ? "selected" : ""}>admin</option>
                </select>
            </td>
        </tr>
    `).join("");

    panel.classList.remove("hidden");
    panel.innerHTML = `
        <div class="admin-header">
            <div>
                <h2>Admin tools</h2>
                <p class="subtitle">Manage account roles and claim any habits that predate authentication.</p>
            </div>
            <button id="claimLegacyButton" class="btn btn-secondary" type="button" ${orphanHabits === 0 ? "disabled" : ""}>
                ${orphanHabits === 0 ? "No legacy habits" : `Claim ${orphanHabits} legacy habit(s)`}
            </button>
        </div>
        <div class="admin-table-wrap">
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Role</th>
                    </tr>
                </thead>
                <tbody>${userRows}</tbody>
            </table>
        </div>
    `;

    const claimButton = document.getElementById("claimLegacyButton");
    if (claimButton) {
        claimButton.addEventListener("click", claimLegacyHabits);
    }

    document.querySelectorAll(".role-select").forEach((select) => {
        select.addEventListener("change", async (event) => {
            await updateUserRole(event.target.dataset.userId, event.target.value);
        });
    });
}

async function claimLegacyHabits() {
    const res = await authFetch("/admin/claim-orphan-habits", {
        method: "POST"
    });
    const data = await readJson(res);

    if (!res.ok) {
        showFeedback(data.error || "Unable to claim legacy habits.");
        return;
    }

    showFeedback(data.message || "Legacy habits claimed.", true);
    await Promise.all([loadHabits(), loadAdminPanel()]);
}

async function updateUserRole(userId, role) {
    const res = await authFetch(`/admin/users/${userId}/role`, {
        method: "POST",
        body: JSON.stringify({ role })
    });
    const data = await readJson(res);

    if (!res.ok) {
        showFeedback(data.error || "Unable to update role.");
        await loadAdminPanel();
        return;
    }

    showFeedback(data.message || "Role updated.", true);
    await Promise.all([ensureAuthenticated(), loadAdminPanel()]);
}

async function logout() {
    await fetch("/auth/logout", {
        method: "POST",
        credentials: "include"
    });

    currentUser = null;
    renderAccountPanel();
    toggleDashboardVisibility(false);
    showFeedback("You have been logged out.", true);
}

document.getElementById("logoutButton").addEventListener("click", logout);

async function initializeApp() {
    const user = await ensureAuthenticated();
    showStoredNotice();

    if (!user) {
        return;
    }

    await Promise.all([loadHabits(), loadAdminPanel()]);
}

initializeApp();
