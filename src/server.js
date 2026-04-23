require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const express = require("express");
const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth: getFirebaseAdminAuth } = require("firebase-admin/auth");
const db = require("./db/database");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const SESSION_COOKIE = "habittrack_session";
const SESSION_TTL_SHORT_MS = 1000 * 60 * 60 * 24;
const SESSION_TTL_LONG_MS = 1000 * 60 * 60 * 24 * 30;
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const PROJECT_ROOT = path.join(__dirname, "..");
const DATA_ROOT = process.env.DATA_DIR
    || process.env.RENDER_DISK_ROOT
    || PROJECT_ROOT;
const APP_ORIGIN = process.env.APP_ORIGIN || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
const UPLOADS_ROOT = process.env.UPLOADS_DIR || path.join(DATA_ROOT, "uploads");
const AVATAR_UPLOAD_DIR = path.join(UPLOADS_ROOT, "avatars");
const FIREBASE_API_KEY = String(process.env.FIREBASE_API_KEY || "").trim();
const FIREBASE_PROJECT_ID = String(process.env.FIREBASE_PROJECT_ID || "").trim();
const FIREBASE_AUTH_DOMAIN = String(process.env.FIREBASE_AUTH_DOMAIN || "").trim()
    || (FIREBASE_PROJECT_ID ? `${FIREBASE_PROJECT_ID}.firebaseapp.com` : "");
const FIREBASE_CLIENT_EMAIL = String(process.env.FIREBASE_CLIENT_EMAIL || "").trim();
const FIREBASE_PRIVATE_KEY = String(process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

let firebaseAdminAuth = null;
if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
    const appInstance = getApps()[0] || initializeApp({
        credential: cert({
            projectId: FIREBASE_PROJECT_ID,
            clientEmail: FIREBASE_CLIENT_EMAIL,
            privateKey: FIREBASE_PRIVATE_KEY
        })
    });
    firebaseAdminAuth = getFirebaseAdminAuth(appInstance);
}

function isAllowedOrigin(origin) {
    if (!origin || origin === "null") {
        return true;
    }

    if (origin === APP_ORIGIN || origin === `http://localhost:${PORT}` || origin === `http://127.0.0.1:${PORT}`) {
        return true;
    }

    if (origin.startsWith("vscode-webview://")) {
        return true;
    }

    try {
        const parsed = new URL(origin);
        return ["http:", "https:"].includes(parsed.protocol)
            && ["localhost", "127.0.0.1"].includes(parsed.hostname);
    } catch {
        return false;
    }
}

app.use(cors({
    origin(origin, callback) {
        if (isAllowedOrigin(origin)) {
            callback(null, true);
            return;
        }

        console.error(`Blocked CORS origin: ${origin}`);
        callback(new Error("Origin not allowed by HabitTrack CORS policy."));
    },
    credentials: true
}));
app.use(express.json({ limit: "5mb" }));
app.use(express.static(path.join(PROJECT_ROOT, "public")));
app.use("/uploads", express.static(UPLOADS_ROOT));

const publicPagesDir = path.join(PROJECT_ROOT, "public", "pages");

[
    "index",
    "login",
    "registration",
    "forgot-password",
    "reset-password",
    "verify-login",
    "profile",
    "past-activity"
].forEach((pageName) => {
    app.get(`/${pageName}.html`, (req, res) => {
        res.sendFile(path.join(publicPagesDir, `${pageName}.html`));
    });

    app.get(`/pages/${pageName}.html`, (req, res) => {
        res.sendFile(path.join(publicPagesDir, `${pageName}.html`));
    });
});

app.get("/pages", (req, res) => {
    res.redirect("/pages/index.html");
});

app.get("/health", (req, res) => {
    res.json({ ok: true });
});

app.get("/auth/firebase-config", (req, res) => {
    res.json({
        enabled: Boolean(FIREBASE_API_KEY && FIREBASE_PROJECT_ID),
        apiKey: FIREBASE_API_KEY || null,
        projectId: FIREBASE_PROJECT_ID || null,
        authDomain: FIREBASE_AUTH_DOMAIN || null,
        appOrigin: APP_ORIGIN
    });
});

function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

function parseCookies(cookieHeader = "") {
    return cookieHeader
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean)
        .reduce((cookies, part) => {
            const separatorIndex = part.indexOf("=");
            if (separatorIndex === -1) return cookies;

            const key = part.slice(0, separatorIndex);
            const value = decodeURIComponent(part.slice(separatorIndex + 1));
            cookies[key] = value;
            return cookies;
        }, {});
}

function setSessionCookie(res, token, expiresAt) {
    const expires = new Date(expiresAt).toUTCString();
    const maxAgeSeconds = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000));
    res.setHeader(
        "Set-Cookie",
        `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}; Expires=${expires}${IS_PRODUCTION ? "; Secure" : ""}`
    );
}

function clearSessionCookie(res) {
    res.setHeader(
        "Set-Cookie",
        `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
    );
}

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

function validatePassword(password) {
    const value = String(password || "");

    if (value.length < 8) {
        return "Password must be at least 8 characters.";
    }

    const hasLetter = /[A-Za-z]/.test(value);
    const hasNumber = /\d/.test(value);

    if (!hasLetter || !hasNumber) {
        return "Password must include at least one letter and one number.";
    }

    return null;
}

function normalizeHabitCategory(category) {
    const normalized = String(category || "").trim().replace(/\s+/g, " ");
    return normalized ? normalized.slice(0, 60) : null;
}

function normalizeHabitIcon(value) {
    const normalized = String(value || "").trim().toLowerCase();

    if (!normalized) {
        return null;
    }

    if ([
        "spark",
        "heart",
        "dumbbell",
        "apple",
        "moon",
        "leaf",
        "book",
        "briefcase",
        "clock",
        "wallet",
        "users",
        "home",
        "check"
    ].includes(normalized)) {
        return normalized;
    }

    return null;
}

function normalizeFavoriteFlag(value) {
    if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (["true", "1", "yes", "on"].includes(normalized)) return 1;
        if (["false", "0", "no", "off", ""].includes(normalized)) return 0;
    }

    return value ? 1 : 0;
}

function normalizeHabitTags(tags) {
    const rawValue = Array.isArray(tags) ? tags.join(",") : String(tags || "");
    const normalizedTags = [];
    const seen = new Set();

    rawValue
        .split(",")
        .map((tag) => String(tag || "").trim().replace(/\s+/g, " "))
        .filter(Boolean)
        .forEach((tag) => {
            const trimmedTag = tag.slice(0, 30);
            const key = trimmedTag.toLowerCase();

            if (seen.has(key)) {
                return;
            }

            seen.add(key);
            normalizedTags.push(trimmedTag);
        });

    return normalizedTags.slice(0, 12);
}

function normalizeHabitLogEntryType(value) {
    const normalized = String(value || "").trim().toLowerCase();

    if (!normalized) {
        return "full";
    }

    if (normalized === "full" || normalized === "low_effort") {
        return normalized;
    }

    return null;
}

function normalizeHabitLogRetention(value) {
    const normalized = String(value || "").trim().toLowerCase();

    if (!normalized) {
        return "30_days";
    }

    if (normalized === "never") {
        return "30_days";
    }

    if (["7_days", "9_days", "30_days", "monthly"].includes(normalized)) {
        return normalized;
    }

    return null;
}

function normalizeThemePreference(value) {
    const normalized = String(value || "").trim().toLowerCase();

    if (!normalized) {
        return "light";
    }

    if (["light", "dark"].includes(normalized)) {
        return normalized;
    }

    return null;
}

function parseDashboardPreferences(value) {
    if (!value) {
        return {};
    }

    try {
        const parsed = typeof value === "string" ? JSON.parse(value) : value;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
        return {};
    }
}

function normalizeDashboardPreferences(value) {
    const parsed = parseDashboardPreferences(value);
    const normalized = {};
    const habit = parsed.habit && typeof parsed.habit === "object" && !Array.isArray(parsed.habit)
        ? parsed.habit
        : {};
    const chart = parsed.chart && typeof parsed.chart === "object" && !Array.isArray(parsed.chart)
        ? parsed.chart
        : {};

    if (typeof habit.search === "string") {
        normalized.habit = {
            ...normalized.habit,
            search: habit.search.trim().slice(0, 120)
        };
    }

    if (typeof habit.category === "string") {
        normalized.habit = {
            ...normalized.habit,
            category: normalizeHabitCategory(habit.category) || ""
        };
    }

    if (habit.favoritesOnly !== undefined) {
        normalized.habit = {
            ...normalized.habit,
            favoritesOnly: Boolean(habit.favoritesOnly)
        };
    }

    if (typeof habit.sort === "string") {
        const sort = habit.sort.trim();
        if (["favorites", "newest", "oldest", "name-az", "name-za", "category-az", "streak-desc", "best-streak-desc", "checkins-desc"].includes(sort)) {
            normalized.habit = {
                ...normalized.habit,
                sort
            };
        }
    }

    if (typeof chart.habitId === "string") {
        normalized.chart = {
            ...normalized.chart,
            habitId: chart.habitId.trim() || "all"
        };
    }

    if (typeof chart.rangeDays === "string" || typeof chart.rangeDays === "number") {
        const rangeDays = String(chart.rangeDays).trim();
        if (["7", "30", "90"].includes(rangeDays)) {
            normalized.chart = {
                ...normalized.chart,
                rangeDays
            };
        }
    }

    if (typeof chart.metric === "string") {
        const metric = chart.metric.trim();
        if (["completed", "rate", "cumulative"].includes(metric)) {
            normalized.chart = {
                ...normalized.chart,
                metric
            };
        }
    }

    if (typeof chart.chartType === "string") {
        const chartType = chart.chartType.trim();
        if (["line", "bar"].includes(chartType)) {
            normalized.chart = {
                ...normalized.chart,
                chartType
            };
        }
    }

    return normalized;
}

function formatDateOnly(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getHabitLogRetentionCutoff(retention, now = new Date()) {
    const normalized = normalizeHabitLogRetention(retention);

    if (!normalized) {
        return null;
    }

    const baseDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (normalized === "monthly") {
        return formatDateOnly(new Date(baseDate.getFullYear(), baseDate.getMonth(), 1));
    }

    const retentionDays = {
        "7_days": 7,
        "9_days": 9,
        "30_days": 30
    }[normalized];

    if (!retentionDays) {
        return null;
    }

    baseDate.setDate(baseDate.getDate() - (retentionDays - 1));
    return formatDateOnly(baseDate);
}

function serializeHabitTags(tags) {
    return JSON.stringify(normalizeHabitTags(tags));
}

function parseStoredHabitTags(tagsValue) {
    if (Array.isArray(tagsValue)) {
        return normalizeHabitTags(tagsValue);
    }

    const rawValue = String(tagsValue || "").trim();
    if (!rawValue) {
        return [];
    }

    try {
        const parsed = JSON.parse(rawValue);
        if (Array.isArray(parsed)) {
            return normalizeHabitTags(parsed);
        }
    } catch {
        return normalizeHabitTags(rawValue);
    }

    return normalizeHabitTags(rawValue);
}

function serializeHabitRow(row) {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        category: normalizeHabitCategory(row.category) || "",
        icon: normalizeHabitIcon(row.icon) || "",
        tags: parseStoredHabitTags(row.tags),
        isFavorite: Boolean(normalizeFavoriteFlag(row.is_favorite))
    };
}

function isFirebaseAuthConfigured() {
    return Boolean(FIREBASE_API_KEY && FIREBASE_PROJECT_ID && firebaseAdminAuth);
}

function getFirebaseClientConfig() {
    return {
        apiKey: FIREBASE_API_KEY,
        projectId: FIREBASE_PROJECT_ID,
        authDomain: FIREBASE_AUTH_DOMAIN,
        appOrigin: APP_ORIGIN
    };
}

async function verifyFirebaseIdToken(idToken) {
    if (!isFirebaseAuthConfigured()) {
        throw new Error("Firebase Authentication is not configured on the server.");
    }

    return firebaseAdminAuth.verifyIdToken(String(idToken || "").trim());
}

async function findOrCreateUserFromFirebaseIdentity(decodedToken) {
    const firebaseUid = String(decodedToken?.uid || "").trim();
    const email = normalizeEmail(decodedToken?.email);
    const displayName = String(decodedToken?.name || "").trim();

    if (!firebaseUid || !email) {
        throw new Error("Firebase token is missing required identity fields.");
    }

    let user = await dbGet(
        `SELECT id, name, email, role, firebase_uid FROM users WHERE firebase_uid = ?`,
        [firebaseUid]
    );

    if (user) {
        if (user.email !== email) {
            await dbRun(
                "UPDATE users SET email = ? WHERE id = ?",
                [email, user.id]
            );
            user.email = email;
        }

        return user;
    }

    user = await dbGet(
        `SELECT id, name, email, role, firebase_uid FROM users WHERE email = ?`,
        [email]
    );

    if (user) {
        await dbRun(
            "UPDATE users SET firebase_uid = ? WHERE id = ?",
            [firebaseUid, user.id]
        );
        user.firebase_uid = firebaseUid;
        return user;
    }

    const userCountRow = await dbGet("SELECT COUNT(*) AS count FROM users");
    const role = userCountRow?.count === 0 ? "admin" : "user";
    const name = displayName || email.split("@")[0] || "HabitTrack User";
    const result = await dbRun(
        `
            INSERT INTO users (name, email, password_hash, firebase_uid, role)
            VALUES (?, ?, ?, ?, ?)
        `,
        [name, email, "firebase-auth", firebaseUid, role]
    );

    if (role === "admin") {
        await assignLegacyHabitsToUser(result.lastID);
    }

    return {
        id: result.lastID,
        name,
        email,
        role,
        firebase_uid: firebaseUid
    };
}

function parseAvatarDataUrl(dataUrl) {
    const value = String(dataUrl || "").trim();
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=]+)$/i.exec(value);

    if (!match) {
        return null;
    }

    return {
        mimeType: match[1].toLowerCase(),
        buffer: Buffer.from(match[2], "base64")
    };
}

function getAvatarExtension(mimeType) {
    if (mimeType === "image/png") return "png";
    if (mimeType === "image/jpeg") return "jpg";
    if (mimeType === "image/webp") return "webp";
    return null;
}

function isManagedAvatarPath(avatarPath) {
    return /^\/uploads\/avatars\/[a-f0-9-]+\-\d+\.(png|jpg|webp)$/i.test(String(avatarPath || "").trim());
}

function deleteManagedAvatarFile(avatarPath) {
    if (!isManagedAvatarPath(avatarPath)) {
        return;
    }

    const legacyFilePath = path.join(PROJECT_ROOT, avatarPath.replace(/^\//, ""));

    if (fs.existsSync(legacyFilePath)) {
        fs.unlinkSync(legacyFilePath);
        return;
    }

    const uploadRelativePath = avatarPath.replace(/^\/uploads\//, "");
    const uploadedFilePath = path.join(UPLOADS_ROOT, uploadRelativePath);

    if (fs.existsSync(uploadedFilePath)) {
        fs.unlinkSync(uploadedFilePath);
    }
}

function saveAvatarImage(userId, avatarDataUrl) {
    const parsed = parseAvatarDataUrl(avatarDataUrl);
    if (!parsed) {
        throw new Error("Avatar must be a PNG, JPEG, or WebP image.");
    }

    if (parsed.buffer.length === 0) {
        throw new Error("Avatar image is empty.");
    }

    if (parsed.buffer.length > 2 * 1024 * 1024) {
        throw new Error("Avatar image is too large.");
    }

    const extension = getAvatarExtension(parsed.mimeType);
    if (!extension) {
        throw new Error("Avatar image format is not supported.");
    }

    fs.mkdirSync(AVATAR_UPLOAD_DIR, { recursive: true });

    const fileName = `${crypto.randomUUID()}-${userId}.${extension}`;
    const filePath = path.join(AVATAR_UPLOAD_DIR, fileName);
    fs.writeFileSync(filePath, parsed.buffer);
    return `/uploads/avatars/${fileName}`;
}

async function pruneExpiredAuthArtifacts() {
    const nowIso = new Date().toISOString();
    await dbRun("DELETE FROM sessions WHERE expires_at <= ?", [nowIso]);
    await dbRun("DELETE FROM password_reset_tokens WHERE expires_at <= ?", [nowIso]);
    await dbRun("DELETE FROM login_verification_codes WHERE expires_at <= ?", [nowIso]);
}

async function pruneHabitLogsForUser(userId, retention, now = new Date()) {
    const cutoffDate = getHabitLogRetentionCutoff(retention, now);

    if (!cutoffDate) {
        return 0;
    }

    const result = await dbRun(
        `
            DELETE FROM habit_logs
            WHERE completion_date < ?
              AND habit_id IN (
                  SELECT id
                  FROM habits
                  WHERE user_id = ?
              )
        `,
        [cutoffDate, userId]
    );

    return Number(result?.changes || 0);
}

async function pruneHabitLogsByRetention(now = new Date()) {
    const users = await dbAll(
        `
            SELECT id, habit_log_retention
            FROM users
            WHERE habit_log_retention IS NOT NULL
              AND TRIM(habit_log_retention) != ''
        `
    );

    let prunedCount = 0;
    for (const user of users) {
        prunedCount += await pruneHabitLogsForUser(user.id, user.habit_log_retention, now);
    }

    return prunedCount;
}

function hashPassword(password) {
    return new Promise((resolve, reject) => {
        const salt = crypto.randomBytes(16).toString("hex");
        crypto.scrypt(password, salt, 64, (err, derivedKey) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(`${salt}:${derivedKey.toString("hex")}`);
        });
    });
}

function verifyPassword(password, storedHash) {
    return new Promise((resolve, reject) => {
        const [salt, expectedHash] = String(storedHash || "").split(":");
        if (!salt || !expectedHash) {
            resolve(false);
            return;
        }

        crypto.scrypt(password, salt, 64, (err, derivedKey) => {
            if (err) {
                reject(err);
                return;
            }

            const expectedBuffer = Buffer.from(expectedHash, "hex");
            resolve(
                expectedBuffer.length === derivedKey.length &&
                crypto.timingSafeEqual(expectedBuffer, derivedKey)
            );
        });
    });
}

async function createSession(userId, rememberMe = false) {
    const token = crypto.randomBytes(32).toString("hex");
    const ttl = rememberMe ? SESSION_TTL_LONG_MS : SESSION_TTL_SHORT_MS;
    const expiresAt = new Date(Date.now() + ttl).toISOString();

    await dbRun(
        `
            INSERT INTO sessions (session_token, user_id, expires_at)
            VALUES (?, ?, ?)
        `,
        [token, userId, expiresAt]
    );

    return { token, expiresAt };
}

async function replaceSession(res, userId, rememberMe = false) {
    const cookies = parseCookies(res.req?.headers?.cookie);
    const previousToken = cookies[SESSION_COOKIE];

    if (previousToken) {
        await dbRun("DELETE FROM sessions WHERE session_token = ?", [previousToken]);
    }

    const session = await createSession(userId, rememberMe);
    setSessionCookie(res, session.token, session.expiresAt);
    return session;
}

async function requireAuth(req, res, next) {
    try {
        const cookies = parseCookies(req.headers.cookie);
        const sessionToken = cookies[SESSION_COOKIE];

        if (!sessionToken) {
            return res.status(401).json({ error: "Authentication required." });
        }

        const session = await dbGet(
            `
                SELECT
                    sessions.session_token,
                    sessions.user_id,
                    sessions.expires_at,
                    users.id,
                    users.name,
                    users.email,
                    users.firebase_uid,
                    users.role,
                    users.dashboard_preferences,
                    users.theme_preference
                FROM sessions
                JOIN users ON users.id = sessions.user_id
                WHERE sessions.session_token = ?
            `,
            [sessionToken]
        );

        if (!session) {
            clearSessionCookie(res);
            return res.status(401).json({ error: "Session not found." });
        }

        if (new Date(session.expires_at).getTime() <= Date.now()) {
            await dbRun("DELETE FROM sessions WHERE session_token = ?", [sessionToken]);
            clearSessionCookie(res);
            return res.status(401).json({ error: "Session expired." });
        }

        req.user = {
            id: session.id,
            name: session.name,
            email: session.email,
            firebaseUid: session.firebase_uid || null,
            role: session.role,
            dashboardPreferences: normalizeDashboardPreferences(session.dashboard_preferences),
            themePreference: normalizeThemePreference(session.theme_preference) || "light"
        };

        return next();
    } catch (error) {
        return res.status(500).json({ error: "Failed to verify session." });
    }
}

app.get("/auth/me", requireAuth, (req, res) => {
    res.json({ user: req.user });
});

function requireAdmin(req, res, next) {
    if (req.user?.role !== "admin") {
        return res.status(403).json({ error: "Admin access required." });
    }

    return next();
}

async function assignLegacyHabitsToUser(userId) {
    const result = await dbRun(
        `
            UPDATE habits
            SET user_id = ?
            WHERE user_id IS NULL
        `,
        [userId]
    );

    return result.changes;
}

async function getProfileSummary(userId) {
    const todayIso = new Date().toISOString().slice(0, 10);
    const [user, totals, todayRow, recentHabits] = await Promise.all([
        dbGet(
            `
                SELECT id, name, email, role, avatar_path, created_at
                , theme_preference
                FROM users
                WHERE id = ?
            `,
            [userId]
        ),
        dbGet(
            `
                SELECT
                    COUNT(DISTINCT habits.id) AS totalHabits,
                    COUNT(habit_logs.id) AS totalCheckIns,
                    COUNT(DISTINCT habit_logs.completion_date) AS activeDays
                FROM habits
                LEFT JOIN habit_logs ON habit_logs.habit_id = habits.id
                WHERE habits.user_id = ?
            `,
            [userId]
        ),
        dbGet(
            `
                SELECT COUNT(*) AS completedToday
                FROM habit_logs
                JOIN habits ON habits.id = habit_logs.habit_id
                WHERE habits.user_id = ? AND habit_logs.completion_date = ?
            `,
            [userId, todayIso]
        ),
        dbAll(
            `
                SELECT
                    habits.id,
                    habits.name,
                    habits.icon,
                    habits.is_favorite AS isFavorite,
                    COUNT(habit_logs.id) AS totalCheckIns,
                    MAX(habit_logs.completion_date) AS lastCheckIn
                FROM habits
                LEFT JOIN habit_logs ON habit_logs.habit_id = habits.id
                WHERE habits.user_id = ?
                GROUP BY habits.id, habits.name, habits.icon, habits.is_favorite
                ORDER BY
                    habits.is_favorite DESC,
                    CASE WHEN MAX(habit_logs.completion_date) IS NULL THEN 1 ELSE 0 END,
                    MAX(habit_logs.completion_date) DESC,
                    habits.name ASC
                LIMIT 4
            `,
            [userId]
        )
    ]);

    if (!user) {
        return null;
    }

    return {
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            avatarPath: user.avatar_path || null,
            themePreference: normalizeThemePreference(user.theme_preference) || "light",
            createdAt: user.created_at
        },
        stats: {
            totalHabits: Number(totals?.totalHabits || 0),
            totalCheckIns: Number(totals?.totalCheckIns || 0),
            activeDays: Number(totals?.activeDays || 0),
            completedToday: Number(todayRow?.completedToday || 0)
        },
        recentHabits: Array.isArray(recentHabits)
            ? recentHabits.map((habit) => ({
                id: habit.id,
                name: habit.name,
                icon: normalizeHabitIcon(habit.icon) || "",
                isFavorite: Boolean(normalizeFavoriteFlag(habit.isFavorite)),
                totalCheckIns: Number(habit.totalCheckIns || 0),
                lastCheckIn: habit.lastCheckIn || null
            }))
            : []
    };
}

async function getPastActivitySummary(userId, habitId = null) {
    const user = await dbGet(
        `
            SELECT id, name, email, habit_log_retention
            FROM users
            WHERE id = ?
        `,
        [userId]
    );

    if (!user) {
        return null;
    }

    await pruneHabitLogsForUser(userId, user.habit_log_retention);

    const habits = await dbAll(
        `
            SELECT id, name
            FROM habits
            WHERE user_id = ?
            ORDER BY is_favorite DESC, name ASC
        `,
        [userId]
    );

    let normalizedHabitId = null;
    if (habitId !== null && habitId !== undefined && String(habitId).trim() !== "" && String(habitId) !== "all") {
        normalizedHabitId = Number(habitId);
        if (!Number.isInteger(normalizedHabitId)) {
            throw new Error("Invalid habit id.");
        }

        const ownsHabit = habits.some((habit) => Number(habit.id) === normalizedHabitId);
        if (!ownsHabit) {
            throw new Error("Habit not found.");
        }
    }

    const activityRows = await dbAll(
        `
            SELECT
                habit_logs.id,
                habit_logs.completion_date,
                COALESCE(habit_logs.entry_type, 'full') AS entry_type,
                habits.id AS habit_id,
                habits.name AS habit_name,
                habits.category AS habit_category,
                habits.icon AS habit_icon,
                habits.is_favorite AS is_favorite
            FROM habit_logs
            JOIN habits ON habits.id = habit_logs.habit_id
            WHERE habits.user_id = ?
              AND (? IS NULL OR habits.id = ?)
            ORDER BY habit_logs.completion_date DESC, habits.name ASC
        `,
        [userId, normalizedHabitId, normalizedHabitId]
    );

    const fullCompletions = activityRows.filter((row) => row.entry_type === "full").length;
    const lowEffortDays = activityRows.filter((row) => row.entry_type === "low_effort").length;
    const oldestKeptDate = activityRows.length > 0 ? activityRows[activityRows.length - 1].completion_date : null;

    return {
        user: {
            id: user.id,
            name: user.name,
            email: user.email
        },
        retention: normalizeHabitLogRetention(user.habit_log_retention) || "30_days",
        habits: habits.map((habit) => ({
            id: habit.id,
            name: habit.name
        })),
        stats: {
            totalEntries: activityRows.length,
            fullCompletions,
            lowEffortDays,
            oldestKeptDate
        },
        activity: activityRows.map((row) => ({
            id: row.id,
            completionDate: row.completion_date,
            entryType: normalizeHabitLogEntryType(row.entry_type) || "full",
            habitId: row.habit_id,
            habitName: row.habit_name,
            category: normalizeHabitCategory(row.habit_category) || "",
            icon: normalizeHabitIcon(row.habit_icon) || "",
            isFavorite: Boolean(normalizeFavoriteFlag(row.is_favorite))
        }))
    };
}

app.get("/profile", requireAuth, async (req, res) => {
    try {
        const profile = await getProfileSummary(req.user.id);

        if (!profile) {
            return res.status(404).json({ error: "Profile not found." });
        }

        return res.json({ profile });
    } catch (error) {
        return res.status(500).json({ error: "Unable to load profile." });
    }
});

app.patch("/profile", requireAuth, async (req, res) => {
    let newlySavedAvatarPath = null;

    try {
        const name = String(req.body.name || "").trim();
        const email = normalizeEmail(req.body.email);
        const avatarDataUrl = typeof req.body.avatarDataUrl === "string"
            ? req.body.avatarDataUrl
            : "";
        const removeAvatar = Boolean(req.body.removeAvatar);

        if (!name) {
            return res.status(400).json({ error: "Name is required." });
        }

        if (name.length > 80) {
            return res.status(400).json({ error: "Name must be 80 characters or fewer." });
        }

        if (!email || !email.includes("@")) {
            return res.status(400).json({ error: "A valid email is required." });
        }

        if (req.user.firebaseUid && email !== req.user.email) {
            return res.status(400).json({
                error: "Email changes are managed by Firebase Auth and are not editable here yet."
            });
        }

        const existingUser = await dbGet(
            "SELECT id FROM users WHERE email = ? AND id != ?",
            [email, req.user.id]
        );

        if (existingUser) {
            return res.status(409).json({ error: "Another account already uses that email." });
        }

        const currentUser = await dbGet(
            "SELECT avatar_path FROM users WHERE id = ?",
            [req.user.id]
        );

        let nextAvatarPath = currentUser?.avatar_path || null;
        let previousAvatarPathToDelete = null;

        if (removeAvatar) {
            previousAvatarPathToDelete = nextAvatarPath;
            nextAvatarPath = null;
        } else if (avatarDataUrl) {
            const savedAvatarPath = saveAvatarImage(req.user.id, avatarDataUrl);
            newlySavedAvatarPath = savedAvatarPath;
            previousAvatarPathToDelete = nextAvatarPath;
            nextAvatarPath = savedAvatarPath;
        }

        await dbRun(
            `
                UPDATE users
                SET name = ?, email = ?, avatar_path = ?
                WHERE id = ?
            `,
            [name, email, nextAvatarPath, req.user.id]
        );

        if (previousAvatarPathToDelete && previousAvatarPathToDelete !== nextAvatarPath) {
            deleteManagedAvatarFile(previousAvatarPathToDelete);
        }

        const profile = await getProfileSummary(req.user.id);
        return res.json({
            message: "Profile updated.",
            profile
        });
    } catch (error) {
        if (
            error.message === "Avatar must be a PNG, JPEG, or WebP image."
            || error.message === "Avatar image is empty."
            || error.message === "Avatar image is too large."
            || error.message === "Avatar image format is not supported."
        ) {
            return res.status(400).json({ error: error.message });
        }

        if (newlySavedAvatarPath) {
            deleteManagedAvatarFile(newlySavedAvatarPath);
        }

        return res.status(500).json({ error: "Unable to update profile." });
    }
});

app.patch("/profile/theme", requireAuth, async (req, res) => {
    try {
        const themePreference = normalizeThemePreference(req.body?.themePreference);

        if (!themePreference) {
            return res.status(400).json({ error: "Invalid theme preference." });
        }

        await dbRun(
            `
                UPDATE users
                SET theme_preference = ?
                WHERE id = ?
            `,
            [themePreference, req.user.id]
        );

        return res.json({
            message: "Appearance updated.",
            themePreference
        });
    } catch (error) {
        return res.status(500).json({ error: "Unable to update appearance." });
    }
});

app.delete("/profile", requireAuth, async (req, res) => {
    try {
        const confirmationText = String(req.body?.confirmationText || "").trim();

        if (confirmationText !== "DELETE") {
            return res.status(400).json({ error: "Type DELETE to confirm account deletion." });
        }

        const currentUser = await dbGet(
            "SELECT avatar_path, firebase_uid FROM users WHERE id = ?",
            [req.user.id]
        );

        if (!currentUser) {
            return res.status(404).json({ error: "Account not found." });
        }

        await dbRun("DELETE FROM habits WHERE user_id = ?", [req.user.id]);
        await dbRun("DELETE FROM sessions WHERE user_id = ?", [req.user.id]);
        await dbRun("DELETE FROM password_reset_tokens WHERE user_id = ?", [req.user.id]);
        await dbRun("DELETE FROM login_verification_codes WHERE user_id = ?", [req.user.id]);
        await dbRun("DELETE FROM users WHERE id = ?", [req.user.id]);

        if (currentUser.firebase_uid && firebaseAdminAuth) {
            await firebaseAdminAuth.deleteUser(currentUser.firebase_uid).catch((error) => {
                console.error("Unable to delete Firebase user:", error.message);
            });
        }

        if (currentUser.avatar_path) {
            deleteManagedAvatarFile(currentUser.avatar_path);
        }

        clearSessionCookie(res);
        return res.json({ message: "Account deleted permanently." });
    } catch (error) {
        return res.status(500).json({ error: "Unable to delete account." });
    }
});

app.get("/past-activity", requireAuth, async (req, res) => {
    try {
        const summary = await getPastActivitySummary(req.user.id, req.query?.habitId || null);

        if (!summary) {
            return res.status(404).json({ error: "Activity summary not found." });
        }

        return res.json({ summary });
    } catch (error) {
        if (error.message === "Invalid habit id.") {
            return res.status(400).json({ error: error.message });
        }

        if (error.message === "Habit not found.") {
            return res.status(404).json({ error: error.message });
        }

        return res.status(500).json({ error: "Unable to load past activity." });
    }
});

app.patch("/past-activity/retention", requireAuth, async (req, res) => {
    try {
        const retention = normalizeHabitLogRetention(req.body?.retention);

        if (!retention) {
            return res.status(400).json({ error: "Invalid retention option." });
        }

        await dbRun(
            `
                UPDATE users
                SET habit_log_retention = ?
                WHERE id = ?
            `,
            [retention, req.user.id]
        );

        await pruneHabitLogsForUser(req.user.id, retention);
        const summary = await getPastActivitySummary(req.user.id, null);

        return res.json({
            message: "Past activity retention updated.",
            summary
        });
    } catch (error) {
        return res.status(500).json({ error: "Unable to update past activity retention." });
    }
});

app.patch("/preferences/dashboard", requireAuth, async (req, res) => {
    try {
        const preferences = normalizeDashboardPreferences(req.body?.preferences);

        await dbRun(
            `
                UPDATE users
                SET dashboard_preferences = ?
                WHERE id = ?
            `,
            [JSON.stringify(preferences), req.user.id]
        );

        return res.json({
            message: "Dashboard preferences saved.",
            preferences
        });
    } catch (error) {
        return res.status(500).json({ error: "Unable to save dashboard preferences." });
    }
});

app.post("/auth/firebase-session", async (req, res) => {
    try {
        await pruneExpiredAuthArtifacts();

        const idToken = String(req.body?.idToken || "").trim();
        const rememberMe = Boolean(req.body?.rememberMe);

        if (!idToken) {
            return res.status(400).json({ error: "Firebase ID token is required." });
        }

        if (!isFirebaseAuthConfigured()) {
            return res.status(503).json({
                error: "Firebase Authentication is not configured on the server yet."
            });
        }

        const decodedToken = await verifyFirebaseIdToken(idToken);
        if (!decodedToken?.email) {
            return res.status(400).json({ error: "Firebase account is missing an email address." });
        }

        if (!decodedToken.email_verified) {
            return res.status(403).json({
                error: "Verify your email address before signing in to HabitTrack."
            });
        }

        const user = await findOrCreateUserFromFirebaseIdentity(decodedToken);
        await replaceSession(res, user.id, rememberMe);

        return res.json({
            message: "Logged in successfully.",
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        console.error("Unable to create Firebase-backed session:", error.message);
        return res.status(401).json({ error: "Unable to verify your Firebase sign-in." });
    }
});

app.post("/auth/logout", async (req, res) => {
    try {
        const cookies = parseCookies(req.headers.cookie);
        const sessionToken = cookies[SESSION_COOKIE];

        if (sessionToken) {
            await dbRun("DELETE FROM sessions WHERE session_token = ?", [sessionToken]);
        }

        clearSessionCookie(res);
        return res.json({ message: "Logged out." });
    } catch (error) {
        return res.status(500).json({ error: "Unable to log out." });
    }
});

app.get("/admin/users", requireAuth, requireAdmin, async (req, res) => {
    try {
        const users = await dbAll(
            `
                SELECT id, name, email, role, created_at
                FROM users
                ORDER BY created_at ASC
            `
        );

        const orphanHabits = await dbGet(
            "SELECT COUNT(*) AS count FROM habits WHERE user_id IS NULL"
        );

        return res.json({
            users,
            orphanHabits: orphanHabits?.count || 0
        });
    } catch (error) {
        return res.status(500).json({ error: "Unable to load admin data." });
    }
});

app.post("/admin/claim-orphan-habits", requireAuth, requireAdmin, async (req, res) => {
    try {
        const claimedHabits = await assignLegacyHabitsToUser(req.user.id);
        return res.json({
            message: claimedHabits > 0 ? "Legacy habits claimed." : "No legacy habits to claim.",
            claimedHabits
        });
    } catch (error) {
        return res.status(500).json({ error: "Unable to claim legacy habits." });
    }
});

app.post("/admin/users/:id/role", requireAuth, requireAdmin, async (req, res) => {
    try {
        const targetUserId = Number(req.params.id);
        const role = String(req.body.role || "").trim().toLowerCase();

        if (!Number.isInteger(targetUserId)) {
            return res.status(400).json({ error: "Invalid user id." });
        }

        if (!["admin", "user"].includes(role)) {
            return res.status(400).json({ error: "Role must be admin or user." });
        }

        const targetUser = await dbGet("SELECT id, role FROM users WHERE id = ?", [targetUserId]);
        if (!targetUser) {
            return res.status(404).json({ error: "User not found." });
        }

        if (targetUser.id === req.user.id && role !== "admin") {
            const adminCount = await dbGet("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'");
            if ((adminCount?.count || 0) <= 1) {
                return res.status(400).json({ error: "You cannot remove the last admin." });
            }
        }

        await dbRun("UPDATE users SET role = ? WHERE id = ?", [role, targetUserId]);

        return res.json({ message: "Role updated." });
    } catch (error) {
        return res.status(500).json({ error: "Unable to update role." });
    }
});

app.get("/habits", requireAuth, async (req, res) => {
    try {
        const rows = await dbAll(
            `
                SELECT id, name, description, category, icon, tags, is_favorite
                FROM habits
                WHERE user_id = ?
                ORDER BY id DESC
            `,
            [req.user.id]
        );

        res.json(rows.map(serializeHabitRow));
    } catch (error) {
        res.status(500).json({ error: "Failed to load habits." });
    }
});

app.post("/habits", requireAuth, async (req, res) => {
    try {
        const name = String(req.body.name || "").trim();
        const description = String(req.body.description || "").trim();
        const category = normalizeHabitCategory(req.body.category);
        const icon = normalizeHabitIcon(req.body.icon);
        const tags = normalizeHabitTags(req.body.tags);
        const isFavorite = normalizeFavoriteFlag(req.body.isFavorite);

        if (!name) {
            return res.status(400).json({ error: "Habit name required." });
        }

        const result = await dbRun(
            `
                INSERT INTO habits (user_id, name, description, category, icon, tags, is_favorite)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            [req.user.id, name, description || null, category, icon, serializeHabitTags(tags), isFavorite]
        );

        return res.json({
            id: result.lastID,
            message: "Habit created.",
            habit: {
                id: result.lastID,
                name,
                description: description || null,
                category: category || "",
                icon: icon || "",
                tags,
                isFavorite: Boolean(isFavorite)
            }
        });
    } catch (error) {
        return res.status(500).json({ error: "Failed to create habit." });
    }
});

app.put("/habits/:id", requireAuth, async (req, res) => {
    try {
        const name = String(req.body.name || "").trim();
        const description = String(req.body.description || "").trim();
        const category = normalizeHabitCategory(req.body.category);
        const icon = normalizeHabitIcon(req.body.icon);
        const tags = normalizeHabitTags(req.body.tags);
        const isFavorite = normalizeFavoriteFlag(req.body.isFavorite);

        if (!name) {
            return res.status(400).json({ error: "Habit name required." });
        }

        const result = await dbRun(
            `
                UPDATE habits
                SET name = ?, description = ?, category = ?, icon = ?, tags = ?, is_favorite = ?
                WHERE id = ? AND user_id = ?
            `,
            [name, description || null, category, icon, serializeHabitTags(tags), isFavorite, req.params.id, req.user.id]
        );

        if (result.changes === 0) {
            return res.status(404).json({ error: "Habit not found." });
        }

        return res.json({
            message: "Habit updated.",
            habit: {
                id: Number(req.params.id),
                name,
                description: description || null,
                category: category || "",
                icon: icon || "",
                tags,
                isFavorite: Boolean(isFavorite)
            }
        });
    } catch (error) {
        return res.status(500).json({ error: "Failed to update habit." });
    }
});

app.post("/habits/:id/favorite", requireAuth, async (req, res) => {
    try {
        const isFavorite = normalizeFavoriteFlag(req.body.isFavorite);

        const result = await dbRun(
            `
                UPDATE habits
                SET is_favorite = ?
                WHERE id = ? AND user_id = ?
            `,
            [isFavorite, req.params.id, req.user.id]
        );

        if (result.changes === 0) {
            return res.status(404).json({ error: "Habit not found." });
        }

        return res.json({
            message: isFavorite ? "Habit starred." : "Habit unstarred.",
            isFavorite: Boolean(isFavorite)
        });
    } catch (error) {
        return res.status(500).json({ error: "Failed to update favorite status." });
    }
});

app.delete("/habits/:id", requireAuth, async (req, res) => {
    try {
        const habit = await dbGet(
            "SELECT id FROM habits WHERE id = ? AND user_id = ?",
            [req.params.id, req.user.id]
        );

        if (!habit) {
            return res.status(404).json({ error: "Habit not found." });
        }

        await dbRun("DELETE FROM habit_logs WHERE habit_id = ?", [req.params.id]);
        await dbRun("DELETE FROM habits WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);

        return res.json({ message: "Habit deleted." });
    } catch (error) {
        return res.status(500).json({ error: "Failed to delete habit." });
    }
});

app.post("/habits/logs/bulk", requireAuth, async (req, res) => {
    try {
        const completionDate = String(req.body?.completion_date || "").trim() || new Date().toISOString().split("T")[0];
        const today = new Date().toISOString().split("T")[0];

        if (completionDate > today) {
            return res.status(400).json({ error: "You cannot log habits for a future date." });
        }

        const habits = await dbAll(
            `
                SELECT id
                FROM habits
                WHERE user_id = ?
            `,
            [req.user.id]
        );

        if (!Array.isArray(habits) || habits.length === 0) {
            return res.status(400).json({ error: "You do not have any habits to complete yet." });
        }

        let createdCount = 0;
        let upgradedCount = 0;

        for (const habit of habits) {
            const existingLog = await dbGet(
                `
                    SELECT id, COALESCE(entry_type, 'full') AS entry_type
                    FROM habit_logs
                    WHERE habit_id = ? AND completion_date = ?
                `,
                [habit.id, completionDate]
            );

            if (!existingLog) {
                await dbRun(
                    `
                        INSERT INTO habit_logs (habit_id, completion_date, entry_type)
                        VALUES (?, ?, 'full')
                    `,
                    [habit.id, completionDate]
                );
                createdCount += 1;
                continue;
            }

            if (existingLog.entry_type !== "full") {
                await dbRun(
                    `
                        UPDATE habit_logs
                        SET entry_type = 'full'
                        WHERE id = ?
                    `,
                    [existingLog.id]
                );
                upgradedCount += 1;
            }
        }

        const touchedCount = createdCount + upgradedCount;

        if (touchedCount === 0) {
            return res.json({
                message: "All habits were already fully completed for that date.",
                createdCount,
                upgradedCount,
                skippedCount: habits.length
            });
        }

        return res.json({
            message: `Marked ${touchedCount} ${touchedCount === 1 ? "habit" : "habits"} complete.`,
            createdCount,
            upgradedCount,
            skippedCount: Math.max(0, habits.length - touchedCount)
        });
    } catch (error) {
        return res.status(500).json({ error: "Failed to complete all habits." });
    }
});

app.get("/habits/:id/logs", requireAuth, async (req, res) => {
    try {
        const habit = await dbGet(
            "SELECT id FROM habits WHERE id = ? AND user_id = ?",
            [req.params.id, req.user.id]
        );

        if (!habit) {
            return res.status(404).json({ error: "Habit not found." });
        }

        const rows = await dbAll(
            `
                SELECT completion_date, COALESCE(entry_type, 'full') AS entry_type
                FROM habit_logs
                WHERE habit_id = ?
                ORDER BY completion_date ASC
            `,
            [req.params.id]
        );

        return res.json(rows);
    } catch (error) {
        return res.status(500).json({ error: "Failed to load logs." });
    }
});

app.post("/habits/:id/log", requireAuth, async (req, res) => {
    try {
        const { completion_date: completionDate } = req.body;
        const entryType = normalizeHabitLogEntryType(req.body?.entry_type);
        const today = new Date().toISOString().split("T")[0];

        if (!completionDate) {
            return res.status(400).json({ error: "Completion date required." });
        }

        if (!entryType) {
            return res.status(400).json({ error: "Invalid habit log type." });
        }

        if (completionDate > today) {
            return res.status(400).json({
                error: "You cannot log a habit for a future date."
            });
        }

        const habit = await dbGet(
            "SELECT id FROM habits WHERE id = ? AND user_id = ?",
            [req.params.id, req.user.id]
        );

        if (!habit) {
            return res.status(404).json({ error: "Habit not found." });
        }

        const existingLog = await dbGet(
            `
                SELECT id, COALESCE(entry_type, 'full') AS entry_type
                FROM habit_logs
                WHERE habit_id = ? AND completion_date = ?
            `,
            [req.params.id, completionDate]
        );

        if (existingLog) {
            if (existingLog.entry_type === entryType) {
                return res.status(400).json({
                    error: entryType === "low_effort"
                        ? "Low-effort day already logged for this date."
                        : "Habit already logged for this date."
                });
            }

            await dbRun(
                `
                    UPDATE habit_logs
                    SET entry_type = ?
                    WHERE id = ?
                `,
                [entryType, existingLog.id]
            );

            return res.json({
                message: entryType === "full"
                    ? "Habit upgraded to a full completion."
                    : "Habit updated to a low-effort day."
            });
        }

        await dbRun(
            `
                INSERT INTO habit_logs (habit_id, completion_date, entry_type)
                VALUES (?, ?, ?)
            `,
            [req.params.id, completionDate, entryType]
        );

        return res.json({ message: "Habit logged successfully." });
    } catch (error) {
        if (String(error.message || "").includes("UNIQUE")) {
            return res.status(400).json({ error: "Habit already logged for this date." });
        }

        return res.status(500).json({ error: "Failed to log habit." });
    }
});

app.delete("/habits/:id/log", requireAuth, async (req, res) => {
    try {
        const completionDate = String(req.body?.completion_date || "").trim() || new Date().toISOString().split("T")[0];
        const today = new Date().toISOString().split("T")[0];

        if (completionDate > today) {
            return res.status(400).json({ error: "You cannot undo a future habit log." });
        }

        const habit = await dbGet(
            "SELECT id FROM habits WHERE id = ? AND user_id = ?",
            [req.params.id, req.user.id]
        );

        if (!habit) {
            return res.status(404).json({ error: "Habit not found." });
        }

        const result = await dbRun(
            `
                DELETE FROM habit_logs
                WHERE habit_id = ? AND completion_date = ?
            `,
            [req.params.id, completionDate]
        );

        if (result.changes === 0) {
            return res.status(404).json({ error: "No habit log found for that date." });
        }

        return res.json({ message: "Habit log removed." });
    } catch (error) {
        return res.status(500).json({ error: "Failed to undo habit log." });
    }
});

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "pages", "index.html"));
});

db.ready.then(async () => {
    await pruneExpiredAuthArtifacts().catch((error) => {
        console.error("Failed to prune auth artifacts on startup:", error.message);
    });
    await pruneHabitLogsByRetention().catch((error) => {
        console.error("Failed to prune habit logs on startup:", error.message);
    });

    app.listen(PORT, () => {
        console.log(`HabitTrack running on port ${PORT}`);
    });

    setInterval(() => {
        pruneExpiredAuthArtifacts().catch((error) => {
            console.error("Failed to prune auth artifacts:", error.message);
        });
        pruneHabitLogsByRetention().catch((error) => {
            console.error("Failed to prune habit logs:", error.message);
        });
    }, 1000 * 60 * 15);
}).catch((error) => {
    console.error("HabitTrack failed to start:", error.message);
    process.exitCode = 1;
});
