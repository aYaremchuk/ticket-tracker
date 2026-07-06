# Frontend — Ticket Tracker SPA

React + TypeScript single-page app (Vite). Talks to the Rails API under `/api`.
See the repo root `README.md` for the full-stack setup.

## Tech stack

- **React** 19 + **TypeScript** (strict)
- **Vite** 8 (dev server + build)
- **Tailwind CSS** v4 (`@tailwindcss/vite`)
- **TanStack Query** — server state (caching, optimistic updates)
- **Redux Toolkit** + react-redux — client/session state (current user + UI)
- **React Router** v7 — routing / URL state
- **dnd-kit** — drag-and-drop board
- **Vitest** + Testing Library — tests
- **Playwright** (dev) — screenshots / E2E

Auth is a session **cookie** (HttpOnly) — no token is stored in JS. The API
client sends `credentials: 'include'` and an `X-CSRF-Token` header on writes.

## Run

### Standalone dev server (hot reload) — http://localhost:5173
```bash
npm install
npm run dev        # Vite proxies /api → http://localhost:3000
```
Point it at a running API (`docker compose up db api`, or the backend standalone).

### Production build
```bash
npm run build      # tsc -b + vite build → dist/
npm run preview    # serve the built app on http://localhost:4173
```

### Via Docker (from repo root)
```bash
docker compose up --build web   # nginx serves the built SPA + proxies /api
```

## Scripts

```bash
npm run dev        # dev server
npm run build      # type-check + production build
npm run preview    # preview the production build
npm run lint       # ESLint
npm run screens    # Playwright screenshots of each route → docs/screens/
```

## Structure

```
src/
  api/          # typed fetch wrappers (only place fetch lives)
  hooks/        # TanStack Query hooks + business logic
  store/        # Redux Toolkit slices (current user, UI state)
  types/        # shared API types (mirror the backend contract)
  components/   # reusable UI primitives + layout
  pages/        # route-level screens
```

Conventions: strict TypeScript (no `any`), Tailwind utilities only (no inline
styles), functional components + hooks, and loading/error/empty/success states
on every data-driven screen.
