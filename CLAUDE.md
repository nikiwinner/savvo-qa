# CLAUDE.md — qa

Loads when a file under `qa/` is touched. Cross-repo invariants stay in `savvo/CLAUDE.md`; the
Playwright commands, project names and the failure-diagnosis table are in `qa/README.md` and nowhere
else. Paths are relative to the `savvo/` working directory.

`qa/.env` — copy from `qa/.env.example` (#26).

Standalone Playwright suite (pnpm, not npm); page objects in `qa/pages/` + `qa/helpers/`; 3 browser
projects + a `setup` pre-seed project all three depend on — it seeds the content tree + ALL
`qa-fixture-*` steps ONCE (the QA DB is flushed every run; a fixture Step created mid-run inside
`smart-spending` re-locks every chain-completing spec). New fixture steps go in `seedPlayerFixtures`,
never ad-hoc `seedStep` in a spec. **The QA frontend webServer serves a production build (`vite build`
+ `vite preview`), never `vite dev`** — dev-mode re-optimization force-reloads pages mid-test (this
WAS the long-standing "infra flake"); don't switch it back for speed.

Suite size: **1255 listed** (418 × 3 browser cells + 1 setup); authoritative:
`cd qa && pnpm exec playwright test --list`. Drift tripwire:
`grep -rhE "(^|\s)test(\.skip|\.fixme|\.only)?\(" qa/tests --include='*.spec.ts' | wc -l` × 3 = **1221**
(undercounts 11/project — loop-parametrized specs — plus the setup spec); use it for relative drift,
`--list` for truth. A per-test skip must be written `testInfo.skip(...)`, never an in-body
`test.skip(...)`, or it inflates this count.
