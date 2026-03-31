const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const express = require("express");
const db = require("./db/database");

const app = express();
const PORT = 3000;
const SESSION_COOKIE = "habittrack_session";
const SESSION_TTL_SHORT_MS = 1000 * 60 * 60 * 24;
const SESSION_TTL_LONG_MS = 1000 * 60 * 60 * 24 * 30;
const RESET_TOKEN_TTL_MS = 1000 * 60 * 30;
const LOGIN_CODE_TTL_MS = 1000 * 60 * 10;
const LOGIN_CODE_MAX_ATTEMPTS = 5;
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const APP_ORIGIN = process.env.APP_ORIGIN || `http://localhost:${PORT}`;
const RESET_EMAIL_MODE = process.env.RESET_EMAIL_MODE || "file";
const RESET_OUTBOX_PATH = path.join(__dirname, "..", "tmp", "reset-emails.log");

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

const publicPagesDir = path.join(__dirname, "..", "public", "pages");

[
    "index",
    "login",
    "registration",
    "forgot-password",
    "reset-password",
    "verify-login",
    "profile"
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

function buildResetUrl(token) {
    return new URL(`/pages/reset-password.html?token=${encodeURIComponent(token)}`, APP_ORIGIN).toString();
}

function buildLoginVerifyUrl(challengeId) {
    return new URL(`/pages/verify-login.html?challenge=${encodeURIComponent(challengeId)}`, APP_ORIGIN).toString();
}

function ensureOutboxDir() {
    fs.mkdirSync(path.dirname(RESET_OUTBOX_PATH), { recursive: true });
}

function deliverResetEmail(email, resetUrl, expiresAt) {
    if (RESET_EMAIL_MODE !== "file") {
        return {
            delivery: RESET_EMAIL_MODE,
            preview: resetUrl
        };
    }

    ensureOutboxDir();
    const message = [
        `=== ${new Date().toISOString()} ===`,
        `To: ${email}`,
        "Subject: HabitTrack password reset",
        `Reset URL: ${resetUrl}`,
        `Expires At: ${expiresAt}`,
        ""
    ].join("\n");

    fs.appendFileSync(RESET_OUTBOX_PATH, `${message}\n`, "utf8");

    return {
        delivery: "file",
        outboxPath: RESET_OUTBOX_PATH,
        preview: resetUrl
    };
}

function deliverLoginCodeEmail(email, code, verifyUrl, expiresAt) {
    if (RESET_EMAIL_MODE !== "file") {
        return {
            delivery: RESET_EMAIL_MODE,
            preview: verifyUrl
        };
    }

    ensureOutboxDir();
    const message = [
        `=== ${new Date().toISOString()} ===`,
        `To: ${email}`,
        "Subject: HabitTrack login verification code",
        `Verification Code: ${code}`,
        `Verify URL: ${verifyUrl}`,
        `Expires At: ${expiresAt}`,
        ""
    ].join("\n");

    fs.appendFileSync(RESET_OUTBOX_PATH, `${message}\n`, "utf8");

    return {
        delivery: "file",
        outboxPath: RESET_OUTBOX_PATH,
        preview: verifyUrl
    };
}

async function pruneExpiredAuthArtifacts() {
    const nowIso = new Date().toISOString();
    await dbRun("DELETE FROM sessions WHERE expires_at <= ?", [nowIso]);
    await dbRun("DELETE FROM password_reset_tokens WHERE expires_at <= ?", [nowIso]);
    await dbRun("DELETE FROM login_verification_codes WHERE expires_at <= ?", [nowIso]);
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
                SELECT sessions.session_token, sessions.user_id, sessions.expires_at, users.id, users.name, users.email, users.role
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
            role: session.role
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

async function createLoginVerificationChallenge(user, rememberMe) {
    await dbRun("DELETE FROM login_verification_codes WHERE user_id = ?", [user.id]);

    const challengeId = crypto.randomBytes(24).toString("hex");
    const code = String(crypto.randomInt(100000, 1000000));
    const codeHash = await hashPassword(code);
    const expiresAt = new Date(Date.now() + LOGIN_CODE_TTL_MS).toISOString();

    await dbRun(
        `
            INSERT INTO login_verification_codes (
                challenge_id,
                user_id,
                code_hash,
                remember_me,
                email,
                expires_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
        `,
        [challengeId, user.id, codeHash, rememberMe ? 1 : 0, user.email, expiresAt]
    );

    const verifyUrl = buildLoginVerifyUrl(challengeId);
    const delivery = deliverLoginCodeEmail(user.email, code, verifyUrl, expiresAt);

    return {
        challengeId,
        expiresAt,
        delivery,
        verifyUrl
    };
}

app.post("/auth/register", async (req, res) => {
    try {
        await pruneExpiredAuthArtifacts();

        const name = String(req.body.name || "").trim();
        const email = normalizeEmail(req.body.email);
        const password = String(req.body.password || "");
        const rememberMe = Boolean(req.body.rememberMe);

        if (!name) {
            return res.status(400).json({ error: "Name is required." });
        }

        if (!email || !email.includes("@")) {
            return res.status(400).json({ error: "A valid email is required." });
        }

        const passwordError = validatePassword(password);
        if (passwordError) {
            return res.status(400).json({ error: passwordError });
        }

        const existingUser = await dbGet("SELECT id FROM users WHERE email = ?", [email]);
        if (existingUser) {
            return res.status(409).json({ error: "An account with that email already exists." });
        }

        const userCountRow = await dbGet("SELECT COUNT(*) AS count FROM users");
        const role = userCountRow?.count === 0 ? "admin" : "user";
        const passwordHash = await hashPassword(password);
        const result = await dbRun(
            `
                INSERT INTO users (name, email, password_hash, role)
                VALUES (?, ?, ?, ?)
            `,
            [name, email, passwordHash, role]
        );

        let claimedHabits = 0;
        if (role === "admin") {
            claimedHabits = await assignLegacyHabitsToUser(result.lastID);
        }

        await replaceSession(res, result.lastID, rememberMe);

        return res.status(201).json({
            message: "Account created.",
            user: {
                id: result.lastID,
                name,
                email,
                role
            },
            migration: {
                claimedHabits
            }
        });
    } catch (error) {
        return res.status(500).json({ error: "Unable to register user." });
    }
});

app.post("/auth/login", async (req, res) => {
    try {
        await pruneExpiredAuthArtifacts();

        const email = normalizeEmail(req.body.email);
        const password = String(req.body.password || "");
        const rememberMe = Boolean(req.body.rememberMe);

        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required." });
        }

        const user = await dbGet(
            `
                SELECT id, name, email, password_hash, role
                FROM users
                WHERE email = ?
            `,
            [email]
        );

        if (!user) {
            return res.status(401).json({ error: "Invalid email or password." });
        }

        const isValid = await verifyPassword(password, user.password_hash);
        if (!isValid) {
            return res.status(401).json({ error: "Invalid email or password." });
        }

        const challenge = await createLoginVerificationChallenge(user, rememberMe);

        return res.json({
            message: "Verification code sent.",
            requiresTwoStep: true,
            challengeId: challenge.challengeId,
            email: user.email,
            expiresAt: challenge.expiresAt,
            delivery: challenge.delivery
        });
    } catch (error) {
        return res.status(500).json({ error: "Unable to log in." });
    }
});

app.post("/auth/verify-login-code", async (req, res) => {
    try {
        await pruneExpiredAuthArtifacts();

        const challengeId = String(req.body.challengeId || "").trim();
        const code = String(req.body.code || "").trim();

        if (!challengeId || !code) {
            return res.status(400).json({ error: "Challenge and code are required." });
        }

        const challenge = await dbGet(
            `
                SELECT challenge_id, user_id, code_hash, remember_me, email, expires_at, attempt_count
                FROM login_verification_codes
                WHERE challenge_id = ?
            `,
            [challengeId]
        );

        if (!challenge) {
            return res.status(400).json({ error: "Verification challenge is invalid." });
        }

        if (new Date(challenge.expires_at).getTime() <= Date.now()) {
            await dbRun("DELETE FROM login_verification_codes WHERE challenge_id = ?", [challengeId]);
            return res.status(400).json({ error: "Verification code has expired." });
        }

        if (challenge.attempt_count >= LOGIN_CODE_MAX_ATTEMPTS) {
            await dbRun("DELETE FROM login_verification_codes WHERE challenge_id = ?", [challengeId]);
            return res.status(400).json({ error: "Too many attempts. Please log in again." });
        }

        const isValid = await verifyPassword(code, challenge.code_hash);

        if (!isValid) {
            await dbRun(
                `
                    UPDATE login_verification_codes
                    SET attempt_count = attempt_count + 1
                    WHERE challenge_id = ?
                `,
                [challengeId]
            );

            return res.status(401).json({ error: "Verification code is incorrect." });
        }

        await dbRun("DELETE FROM login_verification_codes WHERE challenge_id = ?", [challengeId]);
        await replaceSession(res, challenge.user_id, Boolean(challenge.remember_me));

        const user = await dbGet(
            "SELECT id, name, email, role FROM users WHERE id = ?",
            [challenge.user_id]
        );

        return res.json({
            message: "Logged in successfully.",
            user
        });
    } catch (error) {
        return res.status(500).json({ error: "Unable to verify login code." });
    }
});

app.post("/auth/resend-login-code", async (req, res) => {
    try {
        await pruneExpiredAuthArtifacts();

        const challengeId = String(req.body.challengeId || "").trim();
        if (!challengeId) {
            return res.status(400).json({ error: "Challenge is required." });
        }

        const existingChallenge = await dbGet(
            `
                SELECT challenge_id, user_id, remember_me
                FROM login_verification_codes
                WHERE challenge_id = ?
            `,
            [challengeId]
        );

        if (!existingChallenge) {
            return res.status(400).json({ error: "Verification challenge is invalid." });
        }

        const user = await dbGet("SELECT id, email FROM users WHERE id = ?", [existingChallenge.user_id]);
        if (!user) {
            await dbRun("DELETE FROM login_verification_codes WHERE challenge_id = ?", [challengeId]);
            return res.status(400).json({ error: "User no longer exists." });
        }

        const challenge = await createLoginVerificationChallenge(user, Boolean(existingChallenge.remember_me));

        return res.json({
            message: "A new verification code was sent.",
            challengeId: challenge.challengeId,
            email: user.email,
            expiresAt: challenge.expiresAt,
            delivery: challenge.delivery
        });
    } catch (error) {
        return res.status(500).json({ error: "Unable to resend verification code." });
    }
});

app.post("/auth/request-password-reset", async (req, res) => {
    try {
        await pruneExpiredAuthArtifacts();

        const email = normalizeEmail(req.body.email);

        if (!email || !email.includes("@")) {
            return res.status(400).json({ error: "A valid email is required." });
        }

        const user = await dbGet("SELECT id FROM users WHERE email = ?", [email]);

        if (!user) {
            return res.json({
                message: "If that email exists, a reset link has been created."
            });
        }

        await dbRun("DELETE FROM password_reset_tokens WHERE user_id = ?", [user.id]);

        const token = crypto.randomBytes(24).toString("hex");
        const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();

        await dbRun(
            `
                INSERT INTO password_reset_tokens (token, user_id, expires_at)
                VALUES (?, ?, ?)
            `,
            [token, user.id, expiresAt]
        );

        const resetUrl = buildResetUrl(token);
        const delivery = deliverResetEmail(email, resetUrl, expiresAt);

        return res.json({
            message: "Reset link created.",
            resetUrl: delivery.preview,
            expiresAt,
            delivery
        });
    } catch (error) {
        return res.status(500).json({ error: "Unable to create reset link." });
    }
});

app.post("/auth/reset-password", async (req, res) => {
    try {
        await pruneExpiredAuthArtifacts();

        const token = String(req.body.token || "").trim();
        const password = String(req.body.password || "");

        if (!token) {
            return res.status(400).json({ error: "Reset token is required." });
        }

        const passwordError = validatePassword(password);
        if (passwordError) {
            return res.status(400).json({ error: passwordError });
        }

        const resetToken = await dbGet(
            `
                SELECT token, user_id, expires_at
                FROM password_reset_tokens
                WHERE token = ?
            `,
            [token]
        );

        if (!resetToken) {
            return res.status(400).json({ error: "Reset token is invalid." });
        }

        if (new Date(resetToken.expires_at).getTime() <= Date.now()) {
            await dbRun("DELETE FROM password_reset_tokens WHERE token = ?", [token]);
            return res.status(400).json({ error: "Reset token has expired." });
        }

        const passwordHash = await hashPassword(password);
        await dbRun("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, resetToken.user_id]);
        await dbRun("DELETE FROM password_reset_tokens WHERE user_id = ?", [resetToken.user_id]);
        await dbRun("DELETE FROM sessions WHERE user_id = ?", [resetToken.user_id]);

        return res.json({ message: "Password reset successfully." });
    } catch (error) {
        return res.status(500).json({ error: "Unable to reset password." });
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
                SELECT id, name, description
                FROM habits
                WHERE user_id = ?
                ORDER BY id DESC
            `,
            [req.user.id]
        );

        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: "Failed to load habits." });
    }
});

app.post("/habits", requireAuth, async (req, res) => {
    try {
        const name = String(req.body.name || "").trim();
        const description = String(req.body.description || "").trim();

        if (!name) {
            return res.status(400).json({ error: "Habit name required." });
        }

        const result = await dbRun(
            `
                INSERT INTO habits (user_id, name, description)
                VALUES (?, ?, ?)
            `,
            [req.user.id, name, description || null]
        );

        return res.json({
            id: result.lastID,
            message: "Habit created."
        });
    } catch (error) {
        return res.status(500).json({ error: "Failed to create habit." });
    }
});

app.put("/habits/:id", requireAuth, async (req, res) => {
    try {
        const name = String(req.body.name || "").trim();
        const description = String(req.body.description || "").trim();

        if (!name) {
            return res.status(400).json({ error: "Habit name required." });
        }

        const result = await dbRun(
            `
                UPDATE habits
                SET name = ?, description = ?
                WHERE id = ? AND user_id = ?
            `,
            [name, description || null, req.params.id, req.user.id]
        );

        if (result.changes === 0) {
            return res.status(404).json({ error: "Habit not found." });
        }

        return res.json({ message: "Habit updated." });
    } catch (error) {
        return res.status(500).json({ error: "Failed to update habit." });
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
                SELECT completion_date
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
        const today = new Date().toISOString().split("T")[0];

        if (!completionDate) {
            return res.status(400).json({ error: "Completion date required." });
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

        await dbRun(
            `
                INSERT INTO habit_logs (habit_id, completion_date)
                VALUES (?, ?)
            `,
            [req.params.id, completionDate]
        );

        return res.json({ message: "Habit logged successfully." });
    } catch (error) {
        if (String(error.message || "").includes("UNIQUE")) {
            return res.status(400).json({ error: "Habit already logged today." });
        }

        return res.status(500).json({ error: "Failed to log habit." });
    }
});

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "pages", "index.html"));
});

app.listen(PORT, () => {
    console.log(`HabitTrack running on port ${PORT}`);
});

pruneExpiredAuthArtifacts().catch((error) => {
    console.error("Failed to prune auth artifacts on startup:", error.message);
});

setInterval(() => {
    pruneExpiredAuthArtifacts().catch((error) => {
        console.error("Failed to prune auth artifacts:", error.message);
    });
}, 1000 * 60 * 15);
