/**
 * Curriculum — unit-map renders the journey (Phase 21, Stories 21.1 / 21.3)
 *
 * `/dashboard/learn` is the Duolingo-style unit-map fed by ONE call,
 * `GET /api/curriculum/map/`. These specs cover the fresh-user journey render,
 * the two-bar topbar (Bar #1 real XP + streak; Bar #2 = the honest Net Wealth
 * figure since Phase 25 — the ONE legal money figure on the surface), the
 * scoped money tripwire (money lives ONLY inside Bar #2), the mascot-removal
 * tripwire, and the graceful map-load-failure degraded card with a working
 * Retry (migrated from the retired `coaching/today.spec.ts`).
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
    // an unlocked topic). Its path lives inside focus mode, so zoom into the
    // chapter that holds it to see the node on-stage.
    expect(await map.nodesByStatus('current').count()).toBeGreaterThanOrEqual(1)
    const currentNode = await map.revealFirstNodeByStatus('current')
    await expect(currentNode).toBeVisible()

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

  test('the mascot is gone: no character mount, no character asset', async ({
    page,
    loggedInPage: _,
  }) => {
    // Tripwire for the removal. The 12-emotion mascot shipped 2.4 MB of 32-bit
    // RGBA for a mark that rendered at 140 px; the art is being redone from
    // scratch. Until it lands, NOTHING may re-introduce the old mounts or fetch
    // from the deleted asset folder — this test is what makes that loud.
    const mascotRequests: string[] = []
    page.on('request', (r) => {
      if (r.url().includes('/auri/')) mascotRequests.push(r.url())
    })

    const map = new CurriculumMapPage(page)
    await map.goto()
    await expect(map.map).toBeVisible()

    expect(mascotRequests).toEqual([])
    await expect(page.getByTestId('auri-character')).toHaveCount(0)
    await expect(page.getByTestId('player-auri')).toHaveCount(0)
    await expect(page.getByTestId('completion-auri')).toHaveCount(0)

    // The guide still speaks — only its face went. The copy is the product.
    await expect(map.guideMessage).toBeVisible()
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
