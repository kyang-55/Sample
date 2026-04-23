# HabitTrack
HabitTrack is a web-based habit tracker built with Node.js, Express, and SQLite. Users can create, edit, and delete habits, log daily completions, view streaks, and track progress visually. The app supports reminders for off-days and provides a responsive, interactive interface.

## Features

- Add, edit, and delete habits
- Log daily habit completions
- Prevent duplicate logging for the same day
- Highlight completed habits visually
- Show success/error feedback messages
- Responsive habit cards with hover effects
- Simple streak and habit organization
- Off-day scheduling support
- Fully interactive UI

## Tech Stack

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Node.js, Express
- **Database:** SQLite
- **Tools:** VSCode (for testing APIs)

## Bash Command Package

`npm install express cors sqlite3`

## Installation

1. Clone the repository:

```bash
git clone 
```

2. Install dependencies and start the app:

```bash
npm install
npm start
```

## Auth Notes

- The first registered account becomes `admin`.
- Passwords must be at least 8 characters and include at least one letter and one number.
- `Remember me` creates a longer-lived session.
- Password reset links are written to `tmp/reset-emails.log` by default.

## Environment Variables

- `PORT=3000`
- `NODE_ENV=production`
- `APP_ORIGIN=http://localhost:3000`
- `RESET_EMAIL_MODE=file`
- `RESEND_API_KEY=your_resend_api_key`
- `RESEND_FROM_EMAIL=onboarding@resend.dev`
- `DATA_DIR=optional custom data directory`
- `DB_PATH=optional custom sqlite file path`
- `UPLOADS_DIR=optional custom uploads directory`
- `RESET_OUTBOX_PATH=optional custom reset email log path`

## Real Email Delivery With Resend

HabitTrack can now send password reset links and login verification codes through Resend.

1. Create a free Resend account and generate an API key.
2. Create a local `.env` file in the project root.
3. Add:

```bash
RESET_EMAIL_MODE=resend
RESEND_API_KEY=your_resend_api_key
RESEND_FROM_EMAIL=onboarding@resend.dev
APP_ORIGIN=http://localhost:3000
```

4. Restart the server with `npm start`.

Notes:
- `onboarding@resend.dev` is convenient for initial testing, but sending to broader real users usually requires a verified domain in Resend.
- If `RESET_EMAIL_MODE` stays as `file`, the app continues using the local outbox log instead of sending real email.

## Deploying To Render

HabitTrack can run on a Render web service.

What changed to support Render:
- The server now listens on `process.env.PORT`.
- `APP_ORIGIN` can use `RENDER_EXTERNAL_URL` if you do not set it manually.
- SQLite, uploaded avatars, and file-based reset logs can live in a configurable data directory instead of the repo folder.
- A `GET /health` endpoint is available for health checks.

Recommended Render setup:
1. Create a new `Web Service`.
2. Use:

```bash
Build Command: npm install
Start Command: npm start
```

3. Add environment variables:

```bash
NODE_ENV=production
APP_ORIGIN=https://your-render-service.onrender.com
RESET_EMAIL_MODE=file
```

4. Add a persistent disk in Render if you want your SQLite data and avatars to survive redeploys/restarts.
5. Point the service at the disk path with either:

```bash
DATA_DIR=/var/data
```

or explicit paths:

```bash
DB_PATH=/var/data/habits.db
UPLOADS_DIR=/var/data/uploads
RESET_OUTBOX_PATH=/var/data/tmp/reset-emails.log
```

Important:
- Without a persistent disk, SQLite data, uploaded avatars, and file-based reset logs can be lost on redeploy or restart.
- If you switch to `RESET_EMAIL_MODE=resend`, set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` too.
- You can use `/health` as the Render health check path.
