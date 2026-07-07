# task_managing_system

A ticket tracker: three-tier SPA (**React + TypeScript + Tailwind**)
backed by an **HTTP API (Rails 8.1, API-only)** and a **PostgreSQL** database.

Built for the DataArt hackathon requirements.

## Features

- **Accounts:** email/password sign-up, SMTP email verification (24h single-use
  token), login/logout, and password reset. Unverified accounts can't use the app.
- **Teams:** create / rename / delete (delete blocked while a team has tickets or epics).
- **Epics:** per-team CRUD (delete blocked while referenced by tickets).
- **Tickets:** create / view / edit / delete with type (bug/feature/fix), a fixed
  five-state workflow, optional same-team epic, title & body.
- **Comments:** chronological, attributed; authors can edit/delete their own.
- **Board:** per-team five-column view with drag-and-drop state changes (persisted,
  with rollback on failure), plus type/epic filters and case-insensitive title search.

## Prerequisites

- **Docker** + **Docker Compose v2+** (the only requirement for the canonical run).
- For local (non-Docker) dev only: Ruby 4.0.5, Node 22.

## Quick start (Docker — canonical path)

```bash
cp .env.example .env      # optional; compose has sensible defaults
docker compose up --build
```

Then open **http://localhost:8080**.

- The SPA is served by nginx, which reverse-proxies `/api` → the Rails API, so
  the browser uses a single origin (no CORS).
- On startup the API runs migrations (`db:prepare`) — **no seed data**. A fresh
  database contains only schema + migration metadata; create all data via the UI/API.

Health check: `curl http://localhost:8080/api/health` → `{"status":"ok",...}`.

## Local development (run each tier separately)

The three tiers can run independently — useful for fast iteration with hot reload:

```bash
# 1. Database (in Docker)
docker compose up db

# 2. Backend API (host Ruby) — http://localhost:3000
cd backend && bundle install && bin/rails db:prepare && bin/rails s -p 3000

# 3. Frontend SPA (host Node) — http://localhost:5173
cd frontend && npm install && npm run dev   # Vite proxies /api → :3000
```

Each can also be run in its own container via `docker compose up <db|api|web>`.
The Vite dev proxy keeps the browser same-origin, so cookie auth + CSRF behave
exactly like the nginx-served production setup.

## Authentication

- Passwords hashed with **Argon2id**.
- Session auth via a **signed, HttpOnly, `SameSite=Lax` cookie** (Rails 8 `Session`)
  — no token is stored in the browser (JS can't read it).
- State-changing requests carry an **`X-CSRF-Token`** header (fetched from
  `GET /api/csrf`) and the server verifies the request `Origin`.
- All API endpoints require an authenticated, email-verified session except
  sign-up, login, email verification, resend, password reset, `/api/csrf`, and
  `/api/health`.

## API documentation

Interactive Swagger UI at **[http://localhost:8080/api-docs](http://localhost:8080/api-docs)**
(OpenAPI generated from the request specs). The UI **and** the raw spec are
protected by **HTTP Basic auth** whenever `SWAGGER_USER`/`SWAGGER_PASSWORD` are
set — and always in production (fail-closed if unset). The dev compose defaults
to **`docs` / `docs`**; clear both to open the docs in development.

Endpoint auth uses cookies + CSRF (not bearer) — to test protected endpoints:
`GET /api/csrf` → copy token → `POST /api/login` (paste token in `X-CSRF-Token`)
→ then "Try it out" (paste the token on writes). See `backend/README.md`.

## Configuration

All configuration is via environment variables — see `.env.example`. Never commit
`.env` (it is git-ignored). Key groups: PostgreSQL, Rails (`SECRET_KEY_BASE`),
SMTP (email verification via `relay1.dataart.com`), and ports.

## Project layout

```
backend/    Rails 8.1 API-only app (models, controllers, migrations, specs)
frontend/   React + TS + Vite SPA (Tailwind, TanStack Query, Redux Toolkit, React Router, dnd-kit)
bin/check   the per-milestone quality gate
docs/       design docs + wireframes        (local only — git-ignored)
.claude/    rules, skills, agents, hooks     (local only — git-ignored)
```

## Quality gate

```bash
bin/check
```
Runs rubocop (Shopify), brakeman, bundler-audit, rspec + SimpleCov (≥85%),
eslint (Airbnb), prettier, tsc, npm audit, vitest, and a compose boot + health
smoke. Steps activate as the corresponding tooling lands per milestone.

## Tech stack

- **Backend:** Rails 8.1 (API-only), PostgreSQL 17, Argon2id password hashing, **cookie-session auth** (Rails 8 `Session`, HttpOnly `SameSite=Lax`) with CSRF protection, RSpec + SimpleCov.
- **Frontend:** React 19 + TypeScript, Vite, Tailwind v4, TanStack Query (server state), **Redux Toolkit** (client/session state), React Router, dnd-kit, Vitest.
- **Infra:** Docker Compose (db + api + web), nginx (serves SPA + proxies `/api`).
