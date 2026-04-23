require("dotenv").config();

const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const projectRoot = path.join(__dirname, "..", "..");
const dataRoot = process.env.DATA_DIR
    || process.env.RENDER_DISK_ROOT
    || projectRoot;
const databasePath = process.env.DB_PATH || path.join(dataRoot, "habits.db");

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new sqlite3.Database(databasePath);

function runAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(err) {
            if (err) {
                reject(err);
                return;
            }

            resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

function allAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(rows);
        });
    });
}

async function ensureColumn(tableName, columnName, definition) {
    const rows = await allAsync(`PRAGMA table_info(${tableName})`);
    const hasColumn = rows.some((row) => row.name === columnName);

    if (hasColumn) {
        return;
    }

    await runAsync(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

async function initializeDatabase() {
    await runAsync("PRAGMA foreign_keys = ON");

    await runAsync(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            firebase_uid TEXT,
            role TEXT NOT NULL DEFAULT 'user',
            habit_log_retention TEXT NOT NULL DEFAULT '30_days',
            dashboard_preferences TEXT NOT NULL DEFAULT '{}',
            theme_preference TEXT NOT NULL DEFAULT 'light',
            avatar_path TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await runAsync(`
        CREATE TABLE IF NOT EXISTS sessions (
            session_token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    await runAsync(`
        CREATE TABLE IF NOT EXISTS habits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            name TEXT NOT NULL,
            description TEXT,
            category TEXT,
            icon TEXT,
            tags TEXT,
            is_favorite INTEGER NOT NULL DEFAULT 0
        )
    `);

    await runAsync(`
        CREATE TABLE IF NOT EXISTS habit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            habit_id INTEGER NOT NULL,
            completion_date DATE NOT NULL,
            entry_type TEXT NOT NULL DEFAULT 'full',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE,
            UNIQUE(habit_id, completion_date)
        )
    `);

    await runAsync(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    await runAsync(`
        CREATE TABLE IF NOT EXISTS login_verification_codes (
            challenge_id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            code_hash TEXT NOT NULL,
            remember_me INTEGER NOT NULL DEFAULT 0,
            email TEXT NOT NULL,
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            attempt_count INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    await ensureColumn("users", "role", "TEXT NOT NULL DEFAULT 'user'");
    await ensureColumn("users", "firebase_uid", "TEXT");
    await ensureColumn("users", "habit_log_retention", "TEXT NOT NULL DEFAULT '30_days'");
    await ensureColumn("users", "dashboard_preferences", "TEXT NOT NULL DEFAULT '{}'");
    await ensureColumn("users", "theme_preference", "TEXT NOT NULL DEFAULT 'light'");
    await ensureColumn("users", "avatar_path", "TEXT");
    await ensureColumn("habits", "user_id", "INTEGER");
    await ensureColumn("habits", "category", "TEXT");
    await ensureColumn("habits", "icon", "TEXT");
    await ensureColumn("habits", "tags", "TEXT");
    await ensureColumn("habits", "is_favorite", "INTEGER NOT NULL DEFAULT 0");
    await ensureColumn("habit_logs", "entry_type", "TEXT NOT NULL DEFAULT 'full'");

    await runAsync(
        "UPDATE users SET role = 'user' WHERE role IS NULL OR TRIM(role) = ''"
    );
    await runAsync(
        `UPDATE users
         SET habit_log_retention = '30_days'
         WHERE habit_log_retention IS NULL
            OR TRIM(habit_log_retention) = ''
            OR TRIM(LOWER(habit_log_retention)) = 'never'`
    );
    await runAsync(
        "UPDATE users SET dashboard_preferences = '{}' WHERE dashboard_preferences IS NULL OR TRIM(dashboard_preferences) = ''"
    );
    await runAsync(
        "UPDATE users SET theme_preference = 'light' WHERE theme_preference IS NULL OR TRIM(theme_preference) = ''"
    );
    await runAsync(
        "UPDATE habit_logs SET entry_type = 'full' WHERE entry_type IS NULL OR TRIM(entry_type) = ''"
    );

    await runAsync("CREATE INDEX IF NOT EXISTS idx_habits_user_id ON habits(user_id)");
    await runAsync("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid)");
    await runAsync("CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)");
    await runAsync("CREATE INDEX IF NOT EXISTS idx_reset_tokens_user_id ON password_reset_tokens(user_id)");
    await runAsync("CREATE INDEX IF NOT EXISTS idx_login_codes_user_id ON login_verification_codes(user_id)");
    await runAsync("CREATE INDEX IF NOT EXISTS idx_habit_logs_habit_date ON habit_logs(habit_id, completion_date)");
}

db.ready = initializeDatabase().catch((error) => {
    console.error("Failed to initialize database:", error.message);
    throw error;
});

module.exports = db;
