# CLAUDE.md — qa

Loads when a file under `qa/` is touched. Cross-repo invariants stay in `savvo/CLAUDE.md`. See
`qa/README.md` for Playwright run commands, project names, and the failure-diagnosis table. Paths
are relative to the `savvo/` working directory.

`qa/.env` — copy from `qa/.env.example` (#26).

Standalone Playwright suite (pnpm, not npm); page objects in `qa/pages/` + `qa/helpers/`; 3 browser
projects + a `setup` pre-seed project all three depend on — it seeds the content tree + ALL
`qa-fixture-*` steps ONCE (the QA DB is flushed every run; a REQUIRED — non-mission — fixture Step
created mid-run inside `smart-spending` re-locks every chain-completing spec; since Phase 32 a
`mission` fixture gates nothing and is harmless). New fixture steps go in `seedPlayerFixtures`,
never ad-hoc `seedStep` in a spec. **The QA frontend webServer serves a production build (`vite build`
+ `vite preview`), never `vite dev`** — dev-mode re-optimization force-reloads pages mid-test (this
WAS the long-standing "infra flake"); don't switch it back for speed.

Suite size: **1297 listed** (432 × 3 browser cells + 1 setup); authoritative:
`cd qa && pnpm exec playwright test --list`. Drift tripwire:
`grep -rhE "(^|\s)test(\.skip|\.fixme|\.only)?\(" qa/tests --include='*.spec.ts' | wc -l` × 3 = **1263**
(undercounts 11/project — 10 tests declared through an ALIASED fixture import, `appTest(` ×8
and `baseTest(` ×2, which the regex cannot match, plus 1 loop-parametrized spec — and the setup
spec); use it for relative drift,
`--list` for truth. A per-test skip must be written `testInfo.skip(...)`, never an in-body
`test.skip(...)`, or it inflates this count.
