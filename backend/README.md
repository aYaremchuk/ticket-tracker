# Backend — Ticket Tracker API

Rails 8.1 **API-only** application. Serves JSON under `/api` and owns all
persistence (PostgreSQL). See the repo root `README.md` for the full-stack setup.

## Tech stack

- **Ruby** 4.0.5, **Rails** 8.1 (API-only)
- **PostgreSQL** 16 (via the `pg` gem)
- **Puma** web server
- **Argon2id** password hashing (`argon2` gem)
- Auth: Rails 8 built-in (`Session` model + signed HttpOnly `SameSite=Lax` cookie,
  `Current.user`, `Authentication` concern) + CSRF protection
- **rack-cors** (only for cross-origin local dev; no-op in the proxied setup)
- Testing: **RSpec** + **FactoryBot** + **SimpleCov** (min 85% coverage)
- Quality: **RuboCop** (rubocop-shopify), **Brakeman**, **bundler-audit**
- API docs: **rswag** — interactive **Swagger UI at `/api-docs`**, OpenAPI spec
  generated from the request specs

## API docs

Interactive Swagger UI (browse endpoints + "Try it out" live testing) is served
at **`/api-docs`** (via nginx: `http://localhost:8080/api-docs`; standalone:
`http://localhost:3000/api-docs`). The OpenAPI spec is generated from the RSpec
request specs, so it stays in sync with the tested behavior:

```bash
bundle exec rails rswag:specs:swaggerize   # regenerate the OpenAPI spec
```

**Access:** the UI *and* the raw OpenAPI spec are protected by **HTTP Basic auth**
whenever `SWAGGER_USER` / `SWAGGER_PASSWORD` are set, and **always in production**
(fail-closed if unset, so docs are never exposed by accident). The dev compose
defaults to **`docs` / `docs`**; clear both env vars to open the docs in
development. Verified: no/invalid creds → `401` (with a `WWW-Authenticate`
challenge), correct creds → `200`. See "Authorizing in Swagger" below for the
cookie+CSRF handshake used to exercise the endpoints themselves.

### Authorizing in Swagger (cookie + CSRF)
Auth is a session cookie + CSRF token, not a bearer token, so:
1. `GET /api/csrf` → *Execute* → copy the `csrf_token`.
2. `POST /api/login` → *Try it out* → enter a **verified** user's email/password,
   paste the token into the **`X-CSRF-Token`** field → *Execute* (sets the session cookie).
3. Call any endpoint via *Try it out*. GETs work automatically (same-origin cookie);
   for writes, paste the `csrf_token` into that operation's `X-CSRF-Token` field.

(The green "Authorize" `session_cookie` dialog can be ignored — the cookie is
HttpOnly and set automatically by login. Must be accessed on the app origin,
`localhost:8080`, for the cookie + Origin checks to pass.)

## Run

### Via Docker (from the repo root)
```bash
docker compose up --build        # starts db + api + web
docker compose up api            # just this service (needs db)
```
The container entrypoint waits for Postgres, runs `db:prepare` (migrate, **no
seed**), then boots Puma on port 3000.

### Run this app on its own (host Ruby)
The API runs independently of the SPA — it only needs a PostgreSQL database.
```bash
bundle install
DATABASE_HOST=localhost bin/rails db:prepare      # create + migrate (no seed)
DATABASE_HOST=localhost bin/rails s -p 3000       # → http://localhost:3000
```
Easiest DB source: `docker compose up db` (published on localhost:5432).
Connection + SMTP settings come from environment variables — see the root
`.env.example`. In development, verification emails are captured at
**http://localhost:3000/letter_opener** (no SMTP server needed).

Run the test suite standalone:
```bash
RAILS_ENV=test DATABASE_HOST=localhost bin/rails db:prepare
RAILS_ENV=test DATABASE_HOST=localhost bundle exec rspec   # + rubocop / brakeman
```

## Health

```bash
curl http://localhost:3000/api/health   # {"status":"ok","database":"up",...}
```

## Tests & checks

```bash
bundle exec rspec                          # specs + SimpleCov (fails under 85%)
bundle exec rubocop                        # style (Shopify)
bundle exec brakeman -q                    # security static analysis
bundle exec bundler-audit check --update   # dependency CVEs
```

## Conventions

- Controller → service → model layering; thin controllers.
- UUID primary keys; tickets also expose a sequential `number` (`TCK-<number>`).
- All validation enforced server-side; JSON error envelope
  `{ "error": { code, message, details? } }`.
- Timestamps are ISO-8601 UTC. Migrations only — a fresh DB has no application data.
