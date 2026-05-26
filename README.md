# QA — Playwright E2E Tests

Standalone Playwright test suite (uses `pnpm`, not `npm`).

## Isolation: dedicated ports + dedicated database

`pnpm test` spawns its **own** isolated stack so it can never write to the dev
database:

| Layer    | Dev (`npm run dev`)    | QA (`pnpm test`)         |
|----------|------------------------|--------------------------|
| Backend  | `:8000`, DB `savvo`  | `:8001`, DB `savvo_test` |
| Frontend | `:5173`                | `:5174` (`PUBLIC_API_BASE_URL=http://localhost:8001`) |

Both `webServer` entries in `playwright.config.ts` set `reuseExistingServer:
false`, and the QA frontend runs with `--strictPort` so it fails loudly if
:5174 is taken instead of silently falling back to a random port. As a result
you can keep `npm run dev` running on :8000/:5173 indefinitely while QA runs in
parallel without contamination.

The backend already whitelists `http://localhost:5174` in
`CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS` (see
`backend/src/settings.py`).

## Running

```bash
pnpm install            # install dependencies (uses pnpm, not npm)
pnpm test               # run all E2E tests (3 projects: chromium, mobile-safari, tablet)
pnpm test:auth          # run auth tests only
pnpm test:headed        # run with browser visible
```

`global-setup.ts` creates `savvo_test` if it doesn't exist, runs
migrations, and `flush`es the database before every run.

## Configuration

`qa/.env` (copy from `qa/.env.example`):

| Variable         | Default                  | Purpose                                  |
|------------------|--------------------------|------------------------------------------|
| `FRONTEND_URL`   | `http://localhost:5174`  | Playwright `baseURL` and the origin in CORS-mock headers |
| `BACKEND_URL`    | `http://localhost:8001`  | Used by `ApiHelper` for direct API calls |
| `POSTGRES_DB_NAME` | `savvo_test`       | Test database name                       |
| `POSTGRES_USERNAME` | `postgres`            | Postgres user                            |
| `POSTGRES_PASSWORD` | `password321`         | Postgres password                        |
| `POSTGRES_HOST`  | `127.0.0.1`              | Postgres host                            |
| `POSTGRES_PORT`  | `5432`                   | Postgres port                            |

Do **not** point `FRONTEND_URL`/`BACKEND_URL` at :5173/:8000 unless you
explicitly want to share state with the dev stack — the entire isolation model
relies on the QA stack owning :5174/:8001.
