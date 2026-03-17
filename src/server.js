const express = require("express");
const cors = require("cors");
const db = require("./database");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("."));

// GET HABITS
app.get("/habits", (req, res) => {
    db.all("SELECT * FROM habits", [], (err, rows) => {
        if (err) return res.status(500).json(err);
        res.json(rows);
    });
});

// ADD HABIT
app.post("/habits", (req, res) => {
    const { name, description } = req.body;

    if (!name) {
        return res.status(400).json({ error: "Habit name required" });
    }

    const sql = `
        INSERT INTO habits (name, description)
        VALUES (?, ?)
    `;

    db.run(sql, [name, description ?? null], function (err) {
        if (err) return res.status(500).json(err);

        res.json({
            id: this.lastID,
            message: "Habit created"
        });
    });
});

// UPDATE HABIT
app.put("/habits/:id", (req, res) => {
    const { name, description } = req.body;

    if (!name) {
        return res.status(400).json({ error: "Habit name required" });
    }

    const sql = `
        UPDATE habits
        SET name = ?, description = ?
        WHERE id = ?
    `;

    db.run(sql, [name, description ?? null, req.params.id], function (err) {
        if (err) return res.status(500).json(err);

        res.json({
            message: "Habit updated"
        });
    });
});

// DELETE HABIT
app.delete("/habits/:id", (req, res) => {
    const habitId = req.params.id;

    db.serialize(() => {
        db.run("DELETE FROM habit_logs WHERE habit_id = ?", [habitId]);

        db.run("DELETE FROM habits WHERE id = ?", [habitId], function (err) {
            if (err) return res.status(500).json(err);
            res.json({ message: "Habit deleted" });
        });
    });
});

// GET HABIT LOGS
app.get("/habits/:id/logs", (req, res) => {
    const habitId = req.params.id;

    db.all(
        `
            SELECT completion_date
            FROM habit_logs
            WHERE habit_id = ?
            ORDER BY completion_date ASC
        `,
        [habitId],
        (err, rows) => {
            if (err) return res.status(500).json(err);
            res.json(rows);
        }
    );
});

// LOG COMPLETION
app.post("/habits/:id/log", (req, res) => {
    const habitId = req.params.id;
    const { completion_date } = req.body;

    const today = new Date().toISOString().split("T")[0];

    if (!completion_date) {
        return res.status(400).json({ error: "Completion date required" });
    }

    if (completion_date > today) {
        return res.status(400).json({
            error: "You cannot log a habit for a future date."
        });
    }

    const sql = `
        INSERT INTO habit_logs (habit_id, completion_date)
        VALUES (?, ?)
    `;

    db.run(sql, [habitId, completion_date], function (err) {
        if (err) {
            if (err.message.includes("UNIQUE")) {
                return res.status(400).json({
                    error: "Habit already logged today."
                });
            }

            return res.status(500).json(err);
        }

        res.json({
            message: "Habit logged successfully"
        });
    });
});

app.listen(3000, () => {
    console.log("HabitTrack running on port 3000");
});