const LOCAL_SERVER_ORIGIN = "http://localhost:3000";
const useLocalServer = window.location.protocol === "file:"
    || (
        ["localhost", "127.0.0.1"].includes(window.location.hostname)
        && window.location.port
        && window.location.port !== "3000"
    );
const API = useLocalServer ? LOCAL_SERVER_ORIGIN : "";
const PAGE_BASE = useLocalServer ? `${LOCAL_SERVER_ORIGIN}/pages` : ".";
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const DEFAULT_AVATAR_HINT = "PNG, JPEG, or WebP up to 2 MB.";
const DEFAULT_CROP_HINT = "Move the photo until the square preview feels right.";
const AVATAR_OUTPUT_SIZE = 256;
const DELETE_CONFIRMATION_TEXT = "DELETE";
const DEFAULT_THEME_PREFERENCE = "light";
const HABIT_ICON_CATALOG = {
    spark: { emoji: "✨", label: "Spark" },
    heart: { emoji: "❤️", label: "Heart" },
    dumbbell: { emoji: "🏋️", label: "Dumbbell" },
    apple: { emoji: "🍎", label: "Apple" },
    moon: { emoji: "🌙", label: "Moon" },
    leaf: { emoji: "🍃", label: "Leaf" },
    book: { emoji: "📚", label: "Book" },
    briefcase: { emoji: "💼", label: "Briefcase" },
    clock: { emoji: "⏰", label: "Clock" },
    wallet: { emoji: "💰", label: "Wallet" },
    users: { emoji: "🤝", label: "People" },
    home: { emoji: "🏠", label: "Home" },
    check: { emoji: "✅", label: "Check" }
};

let currentAvatarPath = null;
let pendingAvatarDataUrl = "";
let isRemovingAvatar = false;
let cropState = null;
let cropDrag = null;
let currentThemePreference = DEFAULT_THEME_PREFERENCE;

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function readJson(res) {
    return res.text().then((text) => {
        try {
            return text ? JSON.parse(text) : {};
        } catch {
            return {};
        }
    });
}

function clampValue(value, min, max) {
    const clamped = Math.min(Math.max(value, min), max);
    return Object.is(clamped, -0) ? 0 : clamped;
}

function getInitials(name) {
    const parts = String(name || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2);

    if (parts.length === 0) {
        return "HT";
    }

    return parts.map((part) => part[0].toUpperCase()).join("");
}

function formatJoinedDate(isoString) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const date = new Date(isoString);

    if (Number.isNaN(date.getTime())) {
        return "Joined recently";
    }

    return `Joined ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function buildProfileInsight(stats) {
    const totalHabits = Number(stats?.totalHabits || 0);
    const completedToday = Number(stats?.completedToday || 0);
    const totalCheckIns = Number(stats?.totalCheckIns || 0);

    if (totalHabits === 0) {
        return "You have not created any habits yet. Add your first one from the dashboard to start building momentum.";
    }

    if (completedToday > 0) {
        return `You have already checked in ${completedToday} ${completedToday === 1 ? "habit" : "habits"} today. Keep the streak alive.`;
    }

    if (totalCheckIns === 0) {
        return "Your habits are ready, but you have not logged a check-in yet. Today is a good first mark on the board.";
    }

    return "Your habits are active. A quick check-in today keeps your profile momentum moving in the right direction.";
}

function normalizeThemePreference(value) {
    const normalized = String(value || "").trim().toLowerCase();

    if (!normalized) {
        return DEFAULT_THEME_PREFERENCE;
    }

    if (normalized === "light" || normalized === "dark") {
        return normalized;
    }

    return DEFAULT_THEME_PREFERENCE;
}

function normalizeHabitIcon(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return HABIT_ICON_CATALOG[normalized] ? normalized : "";
}

function renderHabitIcon(iconKey) {
    const icon = HABIT_ICON_CATALOG[normalizeHabitIcon(iconKey)] || HABIT_ICON_CATALOG.check;
    return `<span class="habit-inline-icon" aria-hidden="true" title="${escapeHtml(icon.label)}">${escapeHtml(icon.emoji)}</span>`;
}

function isDeleteConfirmationValid(value) {
    return String(value || "").trim() === DELETE_CONFIRMATION_TEXT;
}

function formatLastCheckIn(isoString) {
    if (!isoString) {
        return "No check-ins yet";
    }

    const [year, month, day] = String(isoString).split("-").map(Number);
    if (!year || !month || !day) {
        return "Last check-in unavailable";
    }

    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `Last check-in ${months[month - 1]} ${day}, ${year}`;
}

function getCenteredSquareCrop(width, height) {
    const size = Math.max(1, Math.min(Number(width) || 0, Number(height) || 0));
    return {
        x: Math.max(0, Math.floor((width - size) / 2)),
        y: Math.max(0, Math.floor((height - size) / 2)),
        size
    };
}

function getAvatarFileError(file) {
    if (!file) {
        return "Choose a PNG, JPEG, or WebP image.";
    }

    const supportedTypes = ["image/png", "image/jpeg", "image/webp"];
    const fileType = String(file.type || "").toLowerCase();

    if (!supportedTypes.includes(fileType)) {
        return "Choose a PNG, JPEG, or WebP image.";
    }

    if (Number(file.size || 0) > MAX_AVATAR_BYTES) {
        return "Choose an image under 2 MB.";
    }

    return "";
}

function calculateBaseScale(width, height, viewportSize) {
    const safeWidth = Math.max(1, Number(width) || 0);
    const safeHeight = Math.max(1, Number(height) || 0);
    const safeViewport = Math.max(1, Number(viewportSize) || 0);
    return Math.max(safeViewport / safeWidth, safeViewport / safeHeight);
}

function getRenderedImageSize(width, height, baseScale, zoom) {
    const scale = Number(baseScale || 0) * Number(zoom || 0);
    return {
        width: Math.max(1, (Number(width) || 0) * scale),
        height: Math.max(1, (Number(height) || 0) * scale)
    };
}

function clampCropOffsets(offsetX, offsetY, width, height, viewportSize, zoom, baseScale) {
    const rendered = getRenderedImageSize(width, height, baseScale, zoom);
    const maxOffsetX = Math.max(0, (rendered.width - viewportSize) / 2);
    const maxOffsetY = Math.max(0, (rendered.height - viewportSize) / 2);

    return {
        x: clampValue(Number(offsetX) || 0, -maxOffsetX, maxOffsetX),
        y: clampValue(Number(offsetY) || 0, -maxOffsetY, maxOffsetY)
    };
}

function createAvatarCropState(width, height, viewportSize) {
    const baseScale = calculateBaseScale(width, height, viewportSize);
    return {
        sourceDataUrl: "",
        width,
        height,
        viewportSize,
        baseScale,
        minZoom: 1,
        maxZoom: 4,
        zoom: 1,
        offsetX: 0,
        offsetY: 0
    };
}

function getSourceCrop(crop) {
    const scale = crop.baseScale * crop.zoom;
    const srcSize = crop.viewportSize / scale;
    const centeredCrop = getCenteredSquareCrop(crop.width, crop.height);

    return {
        x: clampValue(centeredCrop.x - (crop.offsetX / scale), 0, crop.width - srcSize),
        y: clampValue(centeredCrop.y - (crop.offsetY / scale), 0, crop.height - srcSize),
        size: clampValue(srcSize, 1, Math.min(crop.width, crop.height))
    };
}

async function authFetch(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }

    const res = await fetch(`${API}${url}`, {
        ...options,
        credentials: "include",
        headers
    });

    if (res.status === 401) {
        window.location.replace(`${PAGE_BASE}/login.html`);
        throw new Error("Authentication required.");
    }

    return res;
}

function showFeedback(message, success = false) {
    const feedback = document.getElementById("feedback");
    feedback.textContent = message;
    feedback.className = success ? "profile-feedback is-success" : "profile-feedback";
}

function setAvatarHint(message) {
    document.getElementById("avatarHint").textContent = message || DEFAULT_AVATAR_HINT;
}

function setCropHint(message) {
    document.getElementById("avatarCropHint").textContent = message || DEFAULT_CROP_HINT;
}

function setSavingState(isSaving) {
    const button = document.getElementById("saveProfileButton");
    button.disabled = isSaving;
    button.textContent = isSaving ? "Saving..." : "Save changes";
}

function setDeleteState(isDeleting) {
    const button = document.getElementById("deleteAccountButton");
    const confirmationInput = document.getElementById("deleteConfirmation");

    if (!button || !confirmationInput) {
        return;
    }

    confirmationInput.disabled = isDeleting;
    button.disabled = isDeleting || !isDeleteConfirmationValid(confirmationInput.value);
    button.textContent = isDeleting ? "Deleting account..." : "Delete account permanently";
}

function applyThemePreference(themePreference) {
    currentThemePreference = normalizeThemePreference(themePreference);
    document.body.dataset.theme = currentThemePreference;
    document.documentElement.style.colorScheme = currentThemePreference;

    document.querySelectorAll("[data-theme-option]").forEach((button) => {
        const isActive = button.dataset.themeOption === currentThemePreference;
        button.classList.toggle("theme-toggle--active", isActive);
        button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
}

function syncAvatarActionButtons() {
    const removeButton = document.getElementById("removeAvatarButton");
    removeButton.disabled = !currentAvatarPath && !pendingAvatarDataUrl;
}

function getAvatarPreviewPath() {
    if (pendingAvatarDataUrl) {
        return pendingAvatarDataUrl;
    }

    if (isRemovingAvatar) {
        return "";
    }

    return currentAvatarPath || "";
}

function renderAvatarElements(name, avatarPath) {
    const imageIds = ["profileAvatarImage", "profileAvatarEditorImage"];
    const initialsIds = ["profileInitials", "profileAvatarEditorInitials"];
    const initials = getInitials(name);

    imageIds.forEach((id) => {
        const image = document.getElementById(id);
        if (avatarPath) {
            image.src = avatarPath;
            image.alt = `${name || "HabitTrack user"} profile picture`;
            image.classList.remove("hidden");
        } else {
            image.removeAttribute("src");
            image.alt = "";
            image.classList.add("hidden");
        }
    });

    initialsIds.forEach((id) => {
        const initialsElement = document.getElementById(id);
        initialsElement.textContent = initials;
        initialsElement.classList.toggle("hidden", Boolean(avatarPath));
    });
}

function renderRecentHabits(recentHabits) {
    const container = document.getElementById("recentHabitsList");
    const habits = Array.isArray(recentHabits) ? recentHabits : [];

    if (habits.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                No habits to show yet. Once you create one from the dashboard, its latest activity will appear here.
            </div>
        `;
        return;
    }

    container.innerHTML = habits.map((habit) => `
        <article class="habit-row">
            <div>
                <div class="habit-row__title-line">
                    ${renderHabitIcon(habit.icon)}
                    <p class="habit-row__title">${escapeHtml(habit.name)}</p>
                    ${habit.isFavorite ? '<span class="habit-row__favorite">★ Favorite</span>' : ""}
                </div>
                <p class="habit-row__meta">${escapeHtml(formatLastCheckIn(habit.lastCheckIn))}</p>
            </div>
            <p class="habit-row__count">${habit.totalCheckIns} ${habit.totalCheckIns === 1 ? "check-in" : "check-ins"}</p>
        </article>
    `).join("");
}

function renderProfile(profile) {
    const user = profile?.user || {};
    const stats = profile?.stats || {};

    currentAvatarPath = user.avatarPath || null;
    pendingAvatarDataUrl = "";
    isRemovingAvatar = false;

    document.getElementById("profileHeroName").textContent = user.name || "Your HabitTrack profile";
    document.getElementById("profileHeroEmail").textContent = user.email || "No email available";
    document.getElementById("profileRoleBadge").textContent = user.role || "member";
    document.getElementById("profileJoined").textContent = formatJoinedDate(user.createdAt);

    document.getElementById("name").value = user.name || "";
    document.getElementById("email").value = user.email || "";

    document.getElementById("totalHabits").textContent = String(stats.totalHabits || 0);
    document.getElementById("totalCheckIns").textContent = String(stats.totalCheckIns || 0);
    document.getElementById("activeDays").textContent = String(stats.activeDays || 0);
    document.getElementById("completedToday").textContent = String(stats.completedToday || 0);
    document.getElementById("profileInsight").textContent = buildProfileInsight(stats);
    document.getElementById("deleteConfirmation").value = "";
    applyThemePreference(user.themePreference);

    renderAvatarElements(user.name || "", getAvatarPreviewPath());
    renderRecentHabits(profile?.recentHabits);
    syncAvatarActionButtons();
    setAvatarHint(DEFAULT_AVATAR_HINT);
    setDeleteState(false);
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Unable to read that image."));
        reader.readAsDataURL(file);
    });
}

function loadImageElement(dataUrl) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Unable to prepare that image."));
        image.src = dataUrl;
    });
}

function openCropModal() {
    document.getElementById("avatarCropModal").classList.remove("hidden");
    document.getElementById("avatarCropModal").setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
}

function closeCropModal() {
    document.getElementById("avatarCropModal").classList.add("hidden");
    document.getElementById("avatarCropModal").setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    document.getElementById("avatarCropViewport").classList.remove("is-dragging");
    cropDrag = null;
    cropState = null;
    setCropHint(DEFAULT_CROP_HINT);
}

function renderCropper() {
    if (!cropState) return;

    const cropImage = document.getElementById("avatarCropImage");
    const cropViewport = document.getElementById("avatarCropViewport");
    const zoomSlider = document.getElementById("avatarZoom");
    const rendered = getRenderedImageSize(
        cropState.width,
        cropState.height,
        cropState.baseScale,
        cropState.zoom
    );

    cropImage.src = cropState.sourceDataUrl;
    cropImage.style.width = `${rendered.width}px`;
    cropImage.style.height = `${rendered.height}px`;
    cropImage.style.transform = `translate(calc(-50% + ${cropState.offsetX}px), calc(-50% + ${cropState.offsetY}px))`;
    cropViewport.classList.toggle("is-dragging", Boolean(cropDrag));
    zoomSlider.value = String(cropState.zoom);
}

function updateCropZoom(nextZoom) {
    if (!cropState) return;

    cropState.zoom = clampValue(nextZoom, cropState.minZoom, cropState.maxZoom);
    const clampedOffsets = clampCropOffsets(
        cropState.offsetX,
        cropState.offsetY,
        cropState.width,
        cropState.height,
        cropState.viewportSize,
        cropState.zoom,
        cropState.baseScale
    );
    cropState.offsetX = clampedOffsets.x;
    cropState.offsetY = clampedOffsets.y;
    renderCropper();
}

function getCropViewportSize() {
    const viewport = document.getElementById("avatarCropViewport");
    return Math.max(180, Math.round(viewport.clientWidth || 280));
}

function startCropDrag(clientX, clientY) {
    if (!cropState) return;

    cropDrag = {
        startX: clientX,
        startY: clientY,
        originX: cropState.offsetX,
        originY: cropState.offsetY
    };
    renderCropper();
}

function moveCropDrag(clientX, clientY) {
    if (!cropState || !cropDrag) return;

    const proposedX = cropDrag.originX + (clientX - cropDrag.startX);
    const proposedY = cropDrag.originY + (clientY - cropDrag.startY);
    const clamped = clampCropOffsets(
        proposedX,
        proposedY,
        cropState.width,
        cropState.height,
        cropState.viewportSize,
        cropState.zoom,
        cropState.baseScale
    );

    cropState.offsetX = clamped.x;
    cropState.offsetY = clamped.y;
    renderCropper();
}

function endCropDrag() {
    cropDrag = null;
    document.getElementById("avatarCropViewport").classList.remove("is-dragging");
}

function getCroppedAvatarDataUrl(image, crop, outputSize = AVATAR_OUTPUT_SIZE) {
    const sourceCrop = getSourceCrop(crop);
    const canvas = document.createElement("canvas");
    canvas.width = outputSize;
    canvas.height = outputSize;

    const context = canvas.getContext("2d");
    context.drawImage(
        image,
        sourceCrop.x,
        sourceCrop.y,
        sourceCrop.size,
        sourceCrop.size,
        0,
        0,
        outputSize,
        outputSize
    );

    return canvas.toDataURL("image/png");
}

async function openAvatarCropper(file) {
    const validationError = getAvatarFileError(file);
    if (validationError) {
        throw new Error(validationError);
    }

    const originalDataUrl = await readFileAsDataUrl(file);
    const image = await loadImageElement(originalDataUrl);

    openCropModal();
    await new Promise((resolve) => window.requestAnimationFrame(resolve));

    cropState = createAvatarCropState(image.naturalWidth, image.naturalHeight, getCropViewportSize());
    cropState.sourceDataUrl = originalDataUrl;
    cropState.image = image;
    renderCropper();
    setCropHint(DEFAULT_CROP_HINT);
}

async function loadProfile() {
    const res = await authFetch("/profile");
    const data = await readJson(res);

    if (!res.ok) {
        throw new Error(data.error || "Unable to load profile.");
    }

    return data.profile;
}

async function logout() {
    await fetch(`${API}/auth/logout`, {
        method: "POST",
        credentials: "include"
    });

    window.location.replace(`${PAGE_BASE}/login.html`);
}

async function deleteAccount() {
    const confirmationInput = document.getElementById("deleteConfirmation");
    const confirmationText = confirmationInput?.value || "";

    if (!isDeleteConfirmationValid(confirmationText)) {
        showFeedback(`Type ${DELETE_CONFIRMATION_TEXT} to confirm account deletion.`);
        return;
    }

    if (!window.confirm("Delete your account permanently? This will remove your habits, check-ins, profile details, and active sessions.")) {
        return;
    }

    showFeedback("");
    setDeleteState(true);

    try {
        const res = await authFetch("/profile", {
            method: "DELETE",
            body: JSON.stringify({ confirmationText })
        });
        const data = await readJson(res);

        if (!res.ok) {
            showFeedback(data.error || "Unable to delete account.");
            return;
        }

        window.location.replace(`${PAGE_BASE}/login.html`);
    } catch (error) {
        showFeedback(error.message || "Unable to delete account.");
    } finally {
        setDeleteState(false);
    }
}

async function updateThemePreference(nextTheme) {
    const themePreference = normalizeThemePreference(nextTheme);
    const previousTheme = currentThemePreference;

    applyThemePreference(themePreference);
    showFeedback("");

    try {
        const res = await authFetch("/profile/theme", {
            method: "PATCH",
            body: JSON.stringify({ themePreference })
        });
        const data = await readJson(res);

        if (!res.ok) {
            applyThemePreference(previousTheme);
            showFeedback(data.error || "Unable to update appearance.");
            return;
        }

        applyThemePreference(data.themePreference);
        showFeedback(data.message || "Appearance updated.", true);
    } catch (error) {
        applyThemePreference(previousTheme);
        showFeedback(error.message || "Unable to update appearance.");
    }
}

async function applyAvatarCrop() {
    if (!cropState?.image) {
        return;
    }

    pendingAvatarDataUrl = getCroppedAvatarDataUrl(cropState.image, cropState, AVATAR_OUTPUT_SIZE);
    isRemovingAvatar = false;
    closeCropModal();
    renderAvatarElements(document.getElementById("name").value.trim(), getAvatarPreviewPath());
    syncAvatarActionButtons();
    setAvatarHint("Square crop ready. Save changes to update your profile picture.");
}

document.getElementById("logoutButton").addEventListener("click", logout);
document.getElementById("deleteAccountButton").addEventListener("click", deleteAccount);

document.getElementById("chooseAvatarButton").addEventListener("click", () => {
    document.getElementById("avatarInput").click();
});

document.getElementById("removeAvatarButton").addEventListener("click", () => {
    pendingAvatarDataUrl = "";
    isRemovingAvatar = true;
    renderAvatarElements(document.getElementById("name").value.trim(), "");
    syncAvatarActionButtons();
    setAvatarHint("Photo will be removed when you save your changes.");
});

document.getElementById("avatarInput").addEventListener("change", async (event) => {
    const [file] = Array.from(event.target.files || []);

    try {
        if (!file) {
            return;
        }

        await openAvatarCropper(file);
        showFeedback("");
    } catch (error) {
        setAvatarHint(error.message || DEFAULT_AVATAR_HINT);
    } finally {
        event.target.value = "";
    }
});

document.getElementById("name").addEventListener("input", () => {
    renderAvatarElements(document.getElementById("name").value.trim(), getAvatarPreviewPath());
});

document.getElementById("deleteConfirmation").addEventListener("input", () => {
    setDeleteState(false);
});

document.querySelectorAll("[data-theme-option]").forEach((button) => {
    button.addEventListener("click", () => {
        if (button.dataset.themeOption === currentThemePreference) {
            return;
        }

        updateThemePreference(button.dataset.themeOption);
    });
});

document.getElementById("closeAvatarCropButton").addEventListener("click", closeCropModal);
document.getElementById("cancelAvatarCropButton").addEventListener("click", closeCropModal);
document.getElementById("avatarCropBackdrop").addEventListener("click", closeCropModal);
document.getElementById("applyAvatarCropButton").addEventListener("click", applyAvatarCrop);

document.getElementById("avatarZoom").addEventListener("input", (event) => {
    updateCropZoom(Number(event.target.value));
});

document.getElementById("avatarCropViewport").addEventListener("pointerdown", (event) => {
    if (!cropState) return;

    event.preventDefault();
    startCropDrag(event.clientX, event.clientY);
});

window.addEventListener("pointermove", (event) => {
    moveCropDrag(event.clientX, event.clientY);
});

window.addEventListener("pointerup", endCropDrag);
window.addEventListener("pointercancel", endCropDrag);

window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && cropState) {
        closeCropModal();
    }
});

window.addEventListener("resize", () => {
    if (!cropState) return;

    cropState.viewportSize = getCropViewportSize();
    cropState.baseScale = calculateBaseScale(cropState.width, cropState.height, cropState.viewportSize);
    const clamped = clampCropOffsets(
        cropState.offsetX,
        cropState.offsetY,
        cropState.width,
        cropState.height,
        cropState.viewportSize,
        cropState.zoom,
        cropState.baseScale
    );
    cropState.offsetX = clamped.x;
    cropState.offsetY = clamped.y;
    renderCropper();
});

document.getElementById("profileForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    showFeedback("");
    setSavingState(true);

    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const payload = { name, email };

    if (pendingAvatarDataUrl) {
        payload.avatarDataUrl = pendingAvatarDataUrl;
    }

    if (isRemovingAvatar) {
        payload.removeAvatar = true;
    }

    try {
        const res = await authFetch("/profile", {
            method: "PATCH",
            body: JSON.stringify(payload)
        });
        const data = await readJson(res);

        if (!res.ok) {
            showFeedback(data.error || "Unable to update profile.");
            return;
        }

        renderProfile(data.profile);
        showFeedback(data.message || "Profile updated.", true);
    } catch (error) {
        showFeedback(error.message || "Unable to update profile.");
    } finally {
        setSavingState(false);
    }
});

async function initializeProfilePage() {
    try {
        const profile = await loadProfile();
        window.HabitTrackSessionWarning?.init({
            api: API,
            pageBase: PAGE_BASE,
            idleTimeoutMs: 10 * 60 * 1000,
            warningDurationMs: 60 * 1000
        });
        renderProfile(profile);
        setDeleteState(false);
    } catch (error) {
        showFeedback(error.message || "Unable to load profile.");
    }
}

initializeProfilePage();
