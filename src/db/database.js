const path = require("path");
const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database(path.join(__dirname, "..", "..", "habits.db"));

function ensureColumn(tableName, columnName, definition) {
    db.all(`PRAGMA table_info(${tableName})`, (err, rows) => {
        if (err) {
            console.error(`Failed to inspect ${tableName}:`, err.message);
            return;
        }

        const hasColumn = rows.some((row) => row.name === columnName);
        if (hasColumn) return;

        db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`, (alterErr) => {
            if (alterErr) {
                console.error(`Failed to add ${columnName} to ${tableName}:`, alterErr.message);
            }
        });
    });
}

function ensureUsersRoleColumn() {
    ensureColumn("users", "role", "TEXT NOT NULL DEFAULT 'user'");

    db.run(
        "UPDATE users SET role = 'user' WHERE role IS NULL OR TRIM(role) = ''",
        (err) => {
            if (err) {
                console.error("Failed to normalize user roles:", err.message);
            }
        }
    );
}

db.serialize(() => {
    db.run("PRAGMA foreign_keys = ON");

    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS sessions (
            session_token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS habits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            name TEXT NOT NULL,
            description TEXT
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS habit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            habit_id INTEGER NOT NULL,
            completion_date DATE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE,
            UNIQUE(habit_id, completion_date)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    `);

    db.run(`
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

    ensureColumn("habits", "user_id", "INTEGER");
    ensureUsersRoleColumn();

    db.run("CREATE INDEX IF NOT EXISTS idx_habits_user_id ON habits(user_id)");
    db.run("CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)");
    db.run("CREATE INDEX IF NOT EXISTS idx_reset_tokens_user_id ON password_reset_tokens(user_id)");
    db.run("CREATE INDEX IF NOT EXISTS idx_login_codes_user_id ON login_verification_codes(user_id)");
});

module.exports = db;
