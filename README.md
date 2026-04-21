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

- `NODE_ENV=production`
- `APP_ORIGIN=http://localhost:3000`
- `RESET_EMAIL_MODE=file`
- `RESEND_API_KEY=your_resend_api_key`
- `RESEND_FROM_EMAIL=onboarding@resend.dev`

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
