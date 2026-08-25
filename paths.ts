import fs from 'fs'
import path from 'path'

/**
 * The QA suite starts the servers it tests, so it has to know WHICH checkout to
 * start them from. `BACKEND_DIR` / `FRONTEND_DIR` override that — point either at
 * a git worktree under `<repo>/.worktrees/<branch>` to test a branch instead of
 * `main`. Unset means the sibling checkout, exactly as before these existed.
 *
 * Resolved HERE, once, rather than at each call site: a relative value would
 * otherwise land against three different bases — the webServer shell `cd`s from
 * Playwright's config directory, while `execSync({cwd})` and `path.resolve` go
 * from `process.cwd()`. A split base lets global-setup migrate one checkout's
 * schema while the spawned server serves another checkout's code against the one
 * shared `savvo_test` database: the exact silent mismatch these overrides exist
 * to prevent. `path.resolve` returns an absolute value untouched, so the absolute
 * form `worktree-start.sh` prints is unaffected.
 *
 * The marker check fails loudly at import time — before any server starts — so a
 * typo reads as a bad path instead of surfacing as "migration failed, is Docker
 * running?" three steps later.
 */
// Deliberately NOT read from `qa/.env`. Both consumers call `dotenv.config()`
// AFTER importing this module, so a line there would be ignored anyway — and a
// value persisted in `.env` outlives the worktree it points at, silently pinning
// every later run to a directory `worktree-finish.sh` has already deleted. Fail
// loudly rather than quietly ignoring it.
// `export KEY=value` is the form worktree-start.sh prints, so it is the single
// most likely thing to get pasted into .env — dotenv honours it, and a guard that
// misses it advertises coverage it does not have. `KEY : value` and `KEY = value`
// are honoured too.
const PERSISTED_KEY = /^(?:export\s+)?(BACKEND_DIR|FRONTEND_DIR)\s*[=:]/
const envFile = path.resolve(__dirname, '.env')
if (fs.existsSync(envFile)) {
  const persisted = [
    ...new Set(
      fs
        .readFileSync(envFile, 'utf8')
        .split('\n')
        .map((line) => line.trim().match(PERSISTED_KEY)?.[1])
        .filter((key): key is string => key !== undefined)
    ),
  ]
  if (persisted.length > 0) {
    throw new Error(
      `qa/.env sets ${persisted.join(' and ')}. Export it for the run instead — ` +
        `a value persisted in .env outlives the worktree it points at.`
    )
  }
}

function resolveCheckout(envVar: 'BACKEND_DIR' | 'FRONTEND_DIR', fallback: string, marker: string): string {
  // `||` not `??`: an empty string is what a bare `BACKEND_DIR=` line or an
  // unset shell variable produces, and it must fall back, not resolve to nothing.
  const raw = process.env[envVar] || fallback
  const dir = path.resolve(__dirname, raw)
  if (!fs.existsSync(path.join(dir, marker))) {
    const why = process.env[envVar]
      ? `${envVar}=${process.env[envVar]}`
      : `${envVar} is unset, so it defaulted to ${fallback} — the sibling of the qa/ directory in ` +
        `use, which a worktree does not have`
    throw new Error(
      `${why}. That resolves to ${dir}, which contains no ${marker}. ` +
        `Set ${envVar} to an absolute path to a checkout of that repository.`
    )
  }
  return dir
}

export const BACKEND_DIR = resolveCheckout('BACKEND_DIR', '../backend', 'manage.py')
// svelte.config.js, not package.json: every repo in this tree has a package.json,
// so `FRONTEND_DIR=<the qa repo>` would sail through and fail ~180s later inside
// `npm run build` with a vite error naming neither the variable nor the path.
export const FRONTEND_DIR = resolveCheckout('FRONTEND_DIR', '../frontend', 'svelte.config.js')
