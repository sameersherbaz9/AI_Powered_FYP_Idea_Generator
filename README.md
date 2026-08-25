# AI FYP Idea Generator

An AI-powered Final Year Project (FYP) idea generator built for CUST
(Capital University of Science & Technology) students. Students fill in
their academic profile and area of interest, and the app generates
tailored FYP ideas using Groq's LLM API — optionally informed by the
student's own semester project history.

## Tech stack

**Frontend** — React 18 (Create React App), React Router, Tailwind CSS,
`sonner` for toasts, `lucide-react` for icons, native WebSocket for
real-time updates.

**Backend** — Node.js / Express, MySQL (via `mysql2`), JWT auth,
`bcrypt` for password hashing, `ws` for the WebSocket server, Brevo's
transactional email API (via `axios`) for OTP and password-reset emails,
Groq API for AI idea generation.

## Project structure

```
.
├── backend/              Express API + WebSocket server
│   ├── config/            MySQL connection pool
│   ├── controllers/       Route handlers (auth, students, ideas, projects)
│   ├── services/          Email sending
│   ├── server.js          Express app, routes, rate limiters
│   └── websocket.js       WebSocket server (real-time idea/save notifications)
├── src/                  React frontend
│   ├── components/        Pages (Login, Dashboard, Profile, etc.)
│   ├── contexts/          AuthContext (JWT session state)
│   ├── services/          REST API client + WebSocket client
│   └── hooks/              useWebSocket hook
├── fyp_generator.sql     Full MySQL schema (creates the database)
├── .env.example          Frontend environment variable template
└── backend/.env.example  Backend environment variable template
```

## Prerequisites

- Node.js 18+ and npm
- MySQL 8+ (or MariaDB) running locally or accessible remotely
- A [Groq API key](https://console.groq.com)
- A free [Brevo](https://www.brevo.com/) account with a verified sender
  and an API key, for sending OTP/reset emails. Brevo is used instead of
  Gmail SMTP because most cloud hosts (including Render's free tier)
  block outbound SMTP ports — Brevo sends over HTTPS instead, which is
  never blocked.

## Setup

### 1. Database

Import the schema — this creates the `fyp_generator` database and all
tables:

```bash
mysql -u root -p < fyp_generator.sql
```

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env
```

Edit `backend/.env` and fill in:

- `DB_HOST` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` — your MySQL credentials
- `JWT_SECRET` — a long random string (e.g. `openssl rand -base64 48`)
- `GROQ_API_KEY` — from console.groq.com
- `BREVO_API_KEY` — from Brevo → SMTP & API → API Keys
- `BREVO_FROM_EMAIL` — the sender address you verified in Brevo
- `FRONTEND_URL` — where the frontend will run (default `http://localhost:3000`)

Start the backend:

```bash
npm run dev      # with auto-reload (nodemon)
# or
npm start        # plain node
```

The API runs on `http://localhost:5000` by default (`PORT` in `.env`).

### 3. Frontend

From the project root:

```bash
npm install
cp .env.example .env
```

The defaults in `.env.example` (`http://127.0.0.1:5000/api` and
`ws://localhost:5000`) work out of the box if the backend is running
locally on its default port — adjust only if you changed `PORT` in the
backend, or are pointing at a remote backend.

Start the frontend:

```bash
npm start
```

The app runs on `http://localhost:3000`.

### 4. Sign up

Registration requires a `@cust.pk` email address (enforced server-side)
and sends a 6-digit OTP to that address, so `BREVO_API_KEY` and
`BREVO_FROM_EMAIL` in `backend/.env` must be working before you can
create an account.

## Available scripts

**Frontend** (run from project root): `npm start`, `npm run build`,
`npm test`.

**Backend** (run from `backend/`): `npm start`, `npm run dev` (nodemon).

## Notes on rate limiting

The backend rate-limits several endpoints per IP to protect against abuse
and to stay within the Groq free-tier quota:

- Login: 10 attempts / 15 min
- OTP requests: 5 / 15 min
- Password reset requests: 5 / 15 min
- AI idea generation: 20 / hour (each generation makes 2 Groq API calls)

## Deployment

Live stack: **Vercel** (frontend), **Render** (backend, free tier),
**Aiven** (managed MySQL).

### Keeping the backend awake on Render's free tier

Render's free tier spins the backend down after ~15 minutes of no
traffic, causing a 30–50s cold-start delay on the next request. To avoid
this, [UptimeRobot](https://uptimerobot.com/) is configured to ping the
backend's `GET /api/health` endpoint every 10 minutes, which keeps the
instance warm around the clock so the app never falls asleep on visitors.
