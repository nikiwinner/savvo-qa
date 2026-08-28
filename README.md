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
pnpm test               # run all E2E tests (3 browser projects: chromium, mobile-safari, tablet + a `setup` pre-seed project all three depend on)
pnpm test:auth          # run auth tests only
pnpm test:spaces        # run spaces tests only
pnpm test:expenses      # run expenses tests only
pnpm test:dashboard     # run dashboard tests only
pnpm test:mobile        # run the mobile-safari project only
pnpm test:tablet        # run the tablet project only
pnpm test:headed        # run with browser visible
pnpm test:ui            # open the Playwright UI runner
pnpm report             # open the last HTML report
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

### Testing a branch instead of `main`

The suite starts the servers it tests, so it has to be told which checkout to
start them from. **Running from a qa worktree, set both — absolute.** Unset means
"the sibling of the `qa/` directory in use", and a worktree has no sibling
checkout, so leaving one out aborts the run instead of falling back to `main`.
To test a branch on one side only, point that variable at the worktree and the
other at the main checkout.

| Variable       | Default       | Purpose                                                             |
|----------------|---------------|---------------------------------------------------------------------|
| `BACKEND_DIR`  | `../backend`  | Backend checkout: the server, migrations, seeds, merchant seed list |
| `FRONTEND_DIR` | `../frontend` | Frontend checkout that gets built and previewed                     |

```bash
BACKEND_DIR=/Users/you/code/savvo/backend/.worktrees/<branch> \
FRONTEND_DIR=/Users/you/code/savvo/frontend \
  pnpm test
```

`.claude/scripts/worktree-start.sh` prints both lines already filled in, absolute.

Three things worth knowing:

- **Both are resolved once, in `paths.ts`,** against the `qa/` directory — so a
  relative value means the same thing no matter where you invoke the suite from.
  Resolving them at each call site is what would let `global-setup.ts` migrate one
  checkout's schema while the spawned server serves another checkout's code
  against the one shared `savvo_test` database.
- **Do not put them in `qa/.env`.** A value persisted there outlives the worktree
  it points at and silently pins every later run to a deleted directory. `paths.ts`
  refuses to start if it finds either key in `.env`; export them for the run instead.
- **The QA stack itself is still global** — `:8001`, `:5174` and `savvo_test` are
  fixed, and `reuseExistingServer: false` means a second concurrent run fails on the
  taken port. Only one QA run at a time, worktree or not.

A path that does not contain `manage.py` (backend) or `svelte.config.js`
(frontend) fails at import with the resolved path in the message, before any
server starts. The frontend marker is deliberately not `package.json` — the qa
repo has one too, so `FRONTEND_DIR` typo'd at the qa checkout would pass.

## Diagnosing a failure

Read selectors LIVE, never from a hardcoded list — the app's markup changes every phase and any
copied selector table goes stale and lies. For each failure, in this order: the page object under
`pages/*.ts` (this is what to fix), then the real `data-testid` in the Svelte component under
`frontend/src/routes/**` or `frontend/src/lib/components/**`, then `helpers/` for how auth and data
are seeded. Prefer `data-testid` over text or class selectors.

Causes that bite repeatedly:

| Symptom | Cause and fix |
|---|---|
| `Timeout` on a locator that visibly exists | Add `.waitFor({ state: 'visible' })` before the assertion |
| A `confirm()` dialog is never handled | `page.once('dialog', d => d.accept())` must come BEFORE the click that triggers it |
| Inline edit form not found after clicking Edit | The card locator loses its context on the DOM swap — re-query by the hidden `input[name="id"]` |
| `APIResponse.json()` throws | Check `res.ok()` first and throw with the body; only then call `.json()` |
| Cookie not set in the browser | Domain mismatch — cookies need `domain: 'localhost'` with no port |
| Redirected to `/login` when a session was expected | The session cookie never reached the browser context — check the `context.addCookies()` call |
| A pass/fail flicker across runs | A race, not flake. Re-run the spec in isolation ×3 and fix the race — never retry it away |

**Only the test side is a legitimate fix here.** If the failure is an app bug, describe it precisely
and stop — a previously-green test going red is a code bug to fix, never a test to weaken, skip or
`.fixme` (`.claude/rules/gsd.md` VERIFY gate).

### The WebKit wedge — 10 failures, 5 `mobile-safari` + 5 `tablet`, `page.goto` at exactly 30s

**This is not your code. Do not chase it, and do not weaken a test to get past it.**

Recognise it by all five of these at once:

1. Every failure is `Error: page.goto` with `Test timeout of 30000ms exceeded` — the page never
   loaded at all, not an assertion that went false.
2. The failing specs are DIFFERENT every run and span unrelated features, usually including
   `tests/landing/landing-structure.spec.ts`, which loads the public landing page with no auth.
3. Roughly 5 per WebKit project, ~10 total, whatever the worker count — reproduced at
   `--workers=5`, `3` and `2` (the last over 21.6 minutes).
4. `qa/test-results/*/test-failed-1.png` is byte-identical **pure white** across the failures. The
   app is dark-themed, so white means `about:blank`: the document never committed and no page code
   ran. Check this first — it is the fastest way to tell a wedge from a real regression.
5. `error-context.md` also says `Tearing down "context" exceeded the test timeout` — a page cannot
   wedge its own teardown, but a sick browser process can.

Cause: Playwright's bundled WebKit network process dies. macOS files a crash report per event —
`ls -lt ~/Library/Logs/DiagnosticReports/ExcUserFault_com.apple.WebKit.Networking.Development-*.ips`
— every one faulting in
`WebKit::NetworkConnectionToWebProcess::didReceiveInvalidMessage`, with the binary under
`~/Library/Caches/ms-playwright/webkit-2272/`. Each event wedges one worker for its whole test.

**`chromium` being clean is NOT evidence that your change is WebKit-specific.** The three projects
run STRICTLY SEQUENTIALLY — chromium occupies roughly the first third of the wall clock and finishes
before the first WebKit test starts. A late-run stall cannot touch it. Measured in five runs:
chromium 18–171s, mobile-safari 174–370s, tablet 370–555s, zero overlap.

To tell a wedge from a real regression, in ascending cost:

1. Look at the failure screenshots. All white → wedge.
2. Re-run the failing spec files alone on the same projects. A wedge passes; 129/129 in 1.1 min was
   the observed case on 2026-08-21.
3. Re-run the specs covering only the pages your diff touched, all three projects.

Recorded 2026-08-21 after this cost several hours. It is not new — three runs on 2026-08-20 show the
identical `10 failed / 1185 passed`, 5 + 5, before the work being tested existed.
