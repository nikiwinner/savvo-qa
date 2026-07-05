import fs from 'fs'
import path from 'path'

/**
 * Backend rung-3 categorization guard (CLAUDE.md gotcha #37).
 *
 * The backend auto-categorizes any bank row whose `description.lower()` CONTAINS
 * one of the `MERCHANT_SEED` tokens as a SUBSTRING (`token in description`,
 * see `backend/src/app/banking/categorization.py`). Several auto-suggest specs
 * need merchant descriptions that hit NO seed token, so the cascade never
 * categorizes them on its own. A randomly generated name can coincidentally
 * contain a short token (e.g. `dia`, `kfc`, `hbo`, `omv`, `axa`) and flip the
 * assertion ~1/run — the documented flake this helper kills.
 *
 * We read the token list from the LIVE backend source (READ-ONLY) instead of
 * mirroring it, so it can never drift when the seed grows. The QA stack already
 * couples to `../backend` (playwright.config.ts spawns the backend from there),
 * so the file is always present during a run.
 */
const SEED_PATH = path.resolve(__dirname, '../../backend/src/app/banking/seed_merchants.py')

function loadSeedTokens(): string[] {
  const src = fs.readFileSync(SEED_PATH, 'utf8')
  const start = src.indexOf('MERCHANT_SEED: list')
  const open = src.indexOf('[', start)
  const close = src.indexOf('\n]', open)
  if (start === -1 || open === -1 || close === -1) {
    throw new Error(`could not locate the MERCHANT_SEED list in ${SEED_PATH}`)
  }
  // Each entry is `('token', _CATEGORY),` or `("tok's", _CATEGORY),` — grab the
  // first string literal (single- OR double-quoted) of every tuple.
  const block = src.slice(open, close)
  const re = /\(\s*(?:'([^']*)'|"([^"]*)")\s*,/g
  const tokens: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(block)) !== null) {
    const raw = m[1] ?? m[2]
    // Replicate the backend's normalization EXACTLY: `seed_merchant_library`
    // stores `raw_token.strip().lower()` (categorization.py). This is
    // load-bearing — trailing-space literals like `'o2 '`, `'bp '`, `'sfr '`
    // become the SHORT tokens `o2`/`bp`/`sfr` at match time, which readily
    // appear inside a random string. Parsing the raw literal (with the space)
    // would miss those and let a collision through.
    const tok = raw?.trim().toLowerCase()
    if (tok) tokens.push(tok)
  }
  if (tokens.length < 100) {
    throw new Error(`parsed only ${tokens.length} MERCHANT_SEED tokens from ${SEED_PATH} — parser likely broke`)
  }
  return tokens
}

/** All MERCHANT_SEED tokens, lower-cased, read once from the live backend source. */
export const SEED_TOKENS: string[] = loadSeedTokens()

/** True if `s` (case-insensitively) contains any MERCHANT_SEED token as a substring. */
export function containsSeedToken(s: string): boolean {
  const lower = s.toLowerCase()
  return SEED_TOKENS.some((t) => lower.includes(t))
}

/**
 * A unique merchant description GUARANTEED to hit no MERCHANT_SEED token
 * (gotcha #37 rung-3 substring match), so the backend cascade leaves it
 * uncategorized. Filter-regenerates until the assembled string is token-free.
 */
export function tokenFreeMerchant(prefix = 'QZX'): string {
  for (let i = 0; i < 100; i++) {
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase()
    const candidate = `${prefix}${rand} VNDR`
    if (!containsSeedToken(candidate)) return candidate
  }
  throw new Error('could not generate a seed-token-free merchant after 100 attempts')
}
