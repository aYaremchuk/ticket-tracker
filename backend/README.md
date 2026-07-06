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

## Run

### Via Docker (from the repo root)
```bash
docker compose up --build        # starts db + api + web
docker compose up api            # just this service (needs db)
```
The container entrypoint waits for Postgres, runs `db:prepare` (migrate, **no
seed**), then boots Puma on port 3000.

### Standalone (host Ruby)
```bash
bundle install
DATABASE_HOST=localhost bin/rails db:prepare
DATABASE_HOST=localhost bin/rails s -p 3000
```
Requires a reachable PostgreSQL (`docker compose up db` is the easiest source).
Connection + SMTP settings come from environment variables — see the root
`.env.example`.

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
