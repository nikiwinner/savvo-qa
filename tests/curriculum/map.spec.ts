/**
 * Curriculum — unit-map renders the journey (Phase 21, Stories 21.1 / 21.3)
 *
 * `/dashboard/learn` is the Duolingo-style unit-map fed by ONE call,
 * `GET /api/curriculum/map/`. These specs cover the fresh-user journey render,
 * the two-bar topbar (Bar #1 real XP + streak; Bar #2 = the honest Net Wealth
 * figure since Phase 25 — the ONE legal money figure on the surface), the
 * scoped money tripwire (money lives ONLY inside Bar #2), the Auri PNG-vs-glyph
 * fallback (migrated from the retired `coaching/today.spec.ts`), and the
 * graceful map-load-failure degraded card with a working Retry (also migrated).
 *
 * The `loggedInPage` fixture creates + logs in the user via the API and copies
 * the session cookies into the browser context (no UI landing), so navigating to
 * `/dashboard/learn` exercises the real cold-start tz-cookie path.
 */
import { test, expect } from '../../fixtures/index'
import { CurriculumMapPage } from '../../pages/CurriculumMapPage'

// Money/currency tripwire: any currency symbol or a currency-formatted amount.
// The map surface must show ZERO money (only XP + streak + crest counts — none of
// which match a `\d+[.,]\d{2}` decimal or a currency symbol/code).
const MONEY_PATTERN = /[€$£¥]|\b\d+[.,]\d{2}\b|\bEUR\b|\bUSD\b|\bGBP\b/

test.describe('Curriculum — unit-map', () => {
  test('a fresh user sees the whole curriculum map as a journey', async ({ page, loggedInPage: _ }) => {
    const map = new CurriculumMapPage(page)
    await map.goto()

    // The whole tree lays out as a navigable map, not a single empty card.
    await expect(map.map).toBeVisible()
    expect(await map.sections.count()).toBeGreaterThanOrEqual(1)
    expect(await map.topics.count()).toBeGreaterThanOrEqual(1)

    // A fresh user has at least one CURRENT node (the first step-bearing level of
    // an unlocked topic) …
    await expect(map.nodesByStatus('current').first()).toBeVisible()
    expect(await map.nodesByStatus('current').count()).toBeGreaterThanOrEqual(1)

    // … and locked / coming-soon nodes ahead — the path reads as a journey.
    const locked = await map.nodesByStatus('locked').count()
    const comingSoon = await map.nodesByStatus('coming_soon').count()
    expect(locked + comingSoon).toBeGreaterThan(0)
  })

  test('Bar #1 shows real XP + streak; Bar #2 shows the honest empty Net Wealth', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage

    // Seed a real, traceable XP total — Bar #1 xp_total = Sum(XPLedgerEntry.amount).
    await api.getCurriculumMap() // lazy-seed the tree first
    await api.seedXp({ amount: 40, reason: 'qa-map-bar' })

    const map = new CurriculumMapPage(page)
    await map.goto()

    // Bar #1: the real XP total + a streak readout.
    await expect(map.barKnowledge).toBeVisible()
    await expect(map.xpTotal).toContainText('40')
    await expect(map.mapStreak).toBeVisible()

    // API parity — the number on screen traces to the ledger.
    const payload = await api.getCurriculumMap()
    expect(payload.bars.knowledge.xp_total).toBe(40)

    // Bar #2 (Net Wealth) flipped null → object in Phase 25 — the SANCTIONED
    // contract change (phase_25.md "Tests touching the old contract"). A fresh
    // user has one auto-provisioned cash account with a NULL balance, so the
    // honest figure is "0.00" with accounts_known=0 — never a fake 0/100 and
    // NEVER fed by XP (the 40 XP above does not touch this number).
    expect(payload.bars.doing).not.toBeNull()
    expect(payload.bars.doing?.score).toBeNull()
    expect(payload.bars.doing?.net_wealth.total).toBe('0.00')
    expect(payload.bars.doing?.net_wealth.accounts_known).toBe(0)

    // Bar #2 renders LIVE (a real figure now), not the locked placeholder; the
    // figure is the honest 0.00 and "Score coming soon" is present.
    await expect(map.barDoing).toHaveAttribute('data-bar-doing', 'live')
    await expect(map.netWealthFigure).toContainText('0.00')
    await expect(map.netWealthScoreNote).toContainText('Score coming soon')
  })

  test('the only money figure on the map is Bar #2 (Net Wealth)', async ({ page, loggedInPage: _ }) => {
    const map = new CurriculumMapPage(page)
    await map.goto()
    await expect(map.map).toBeVisible()
    // Bar #2 is live for a fresh user (honest 0.00) — it is the ONE legal money
    // figure on the learn surface now (Phase 25). Wait for it before subtracting.
    await expect(map.barDoing).toHaveAttribute('data-bar-doing', 'live')

    // Every money figure must live INSIDE the bar-doing island — subtract its
    // text from the page text and assert the remainder is money-free. The
    // tripwire keeps its teeth: XP / crest / streak still never render money,
    // and any NEW money figure outside Bar #2 fails here (behavior-rules).
    const pageText = await map.learnPage.innerText()
    const barDoingText = await map.barDoing.innerText()
    const outsideBarDoing = pageText.split(barDoingText).join('')
    expect(outsideBarDoing).not.toMatch(MONEY_PATTERN)

    // …and the Bar #2 figure IS a money figure (the intended exception), so the
    // subtraction above actually removed something real.
    expect(barDoingText).toMatch(MONEY_PATTERN)
  })

  test('Auri renders the PNG by default and falls back to the glyph', async ({ page, loggedInPage: _ }) => {
    const map = new CurriculumMapPage(page)

    // Glyph branch FIRST: abort every Auri PNG BEFORE the first load — a successfully
    // loaded PNG would be served from the browser cache on reload, bypassing route
    // interception (this is why the abort cannot come second).
    await page.route('**/auri/*.png', (route) => route.abort())
    await map.goto()
    await expect(map.auriCharacter).toBeVisible()
    // Auto-retrying attribute assertion: the block mounts in `png` mode and only
    // flips after the aborted request fires the <img> on:error handler — a
    // one-shot read races that handler.
    await expect(map.auriCharacter).toHaveAttribute('data-auri-mode', 'glyph')
    await expect(map.auriCharacter.locator('img.auri-img')).toHaveCount(0)

    // PNG branch: lift the abort and reload — PNGs ARE shipped, so the default
    // state renders the character image, not the glyph (aborted requests are not
    // cached, so this fetch hits the network).
    await page.unroute('**/auri/*.png')
    await map.goto()
    await expect(map.auriCharacter).toBeVisible()
    await expect(map.auriCharacter).toHaveAttribute('data-auri-mode', 'png')
    const img = map.auriCharacter.locator('img.auri-img')
    await expect(img).toBeVisible()
    // The img actually decoded (naturalWidth > 0 → not a broken image).
    const naturalWidth = await img.evaluate((el) => (el as HTMLImageElement).naturalWidth)
    expect(naturalWidth).toBeGreaterThan(0)
  })

  test('a map-load failure degrades gracefully and recovers on retry', async ({ page, loggedInPage: _ }) => {
    // Clear the tz cookie so the page takes the CLIENT fetch path (the server
    // returns needsTz and the browser fetches the map itself — which we can
    // intercept). Then abort the map fetch so the degraded card shows.
    await page.context().clearCookies({ name: 'savvo_tz' })

    let blockMap = true
    await page.route('**/api/curriculum/map/**', (route) => {
      if (blockMap) {
        return route.abort()
      }
      return route.continue()
    })

    await page.goto('/dashboard/learn')

    const map = new CurriculumMapPage(page)
    // Graceful degraded card with a retry affordance — never a 500/blank.
    await expect(map.error).toBeVisible({ timeout: 30_000 })
    await expect(map.retryButton).toBeVisible()

    // Un-abort and retry → the map recovers.
    blockMap = false
    await map.retryButton.click()
    await expect(map.map).toBeVisible({ timeout: 30_000 })
    await expect(map.error).toBeHidden()
  })
})
