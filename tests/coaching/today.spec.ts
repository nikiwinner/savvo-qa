/**
 * Coaching — Today page core loop (Phase 18, Story 18.4)
 *
 * Covers the fresh-user Day-1 render, the Complete → celebration transition with
 * a tomorrow-type preview and ZERO money figures, the Auri PNG-vs-glyph fallback
 * (PNGs ARE shipped now, so we assert the default `png` mode AND force the glyph
 * fallback by aborting the asset), and the graceful today-load-failure degraded
 * card with a working Retry.
 *
 * The `loggedInPage` fixture creates + logs in the user via the API and copies
 * the session cookies into the browser context (no UI landing), so navigating to
 * `/dashboard/today` exercises the real cold-start tz-cookie path.
 */
import { test, expect } from '../../fixtures/index'
import { TodayPage } from '../../pages/TodayPage'

// The tomorrow-type chip text — the testid block also carries a "Tomorrow"
// label, so we match the TYPE label inside it rather than exact-equality.
const MISSION_TYPE_LABEL = /\b(Track|Grow|Review) mission\b/

// Money/currency tripwire: any currency symbol or a currency-formatted amount.
// The Today surface must show ZERO money (only day-count + streak-count).
const MONEY_PATTERN = /[€$£¥]|\b\d+[.,]\d{2}\b|\bEUR\b|\bUSD\b|\bGBP\b/

test.describe('Coaching — Today page', () => {
  test('a fresh user lands on Today with the Day 1 mission', async ({ page, loggedInPage: _ }) => {
    const today = new TodayPage(page)
    await today.goto()

    // The mission card renders with its title, a non-empty step checklist, and
    // an estimated-minutes affordance.
    await expect(today.missionCard).toBeVisible()
    await expect(today.missionTitle).toBeVisible()
    await expect(today.missionTitle).not.toBeEmpty()
    await expect(today.missionStep.first()).toBeVisible()
    expect(await today.missionStep.count()).toBeGreaterThan(0)
    await expect(today.missionCard).toContainText(/min/i)

    // "Day 1 / 30" + a current-streak readout present.
    await expect(today.dayProgress).toContainText('Day 1 / 30')
    expect(await today.currentDay()).toBe(1)
    expect(await today.totalDays()).toBe(30)
    await expect(today.streakCount).toBeVisible()
  })

  test('tapping Complete shows the celebration + tomorrow-type preview', async ({
    page,
    loggedInPage: _,
  }) => {
    const today = new TodayPage(page)
    await today.goto()
    await expect(today.missionCard).toBeVisible()

    await today.complete()

    // In-place celebration state (no full reload — the card swapped).
    await expect(today.celebration).toBeVisible()
    await expect(today.missionCard).toBeHidden()

    // The tomorrow-type preview shows a valid TYPE label (Track/Grow/Review).
    await expect(today.tomorrowType).toBeVisible()
    await expect(today.tomorrowType).toContainText(MISSION_TYPE_LABEL)

    // No money/currency amount anywhere on the page (behavior-rules: ZERO money
    // on the coach surface — only day-count + streak-count).
    const pageText = await today.todayPage.innerText()
    expect(pageText).not.toMatch(MONEY_PATTERN)
  })

  test('the Auri block renders the PNG by default', async ({ page, loggedInPage: _ }) => {
    const today = new TodayPage(page)
    await today.goto()

    await expect(today.auriCharacter).toBeVisible()
    // PNGs ARE shipped → default state renders the character image, not the glyph.
    expect(await today.auriMode()).toBe('png')
    const img = today.auriCharacter.locator('img.auri-img')
    await expect(img).toBeVisible()
    // The img actually decoded (naturalWidth > 0 → not a broken image).
    const naturalWidth = await img.evaluate((el) => (el as HTMLImageElement).naturalWidth)
    expect(naturalWidth).toBeGreaterThan(0)
  })

  test('the Auri block falls back to the glyph when the PNG fails to load', async ({
    page,
    loggedInPage: _,
  }) => {
    // Force the fallback: abort every Auri PNG request BEFORE the page loads so
    // the <img> on:error handler flips the block to the glyph branch.
    await page.route('**/auri/*.png', (route) => route.abort())

    const today = new TodayPage(page)
    await today.goto()

    await expect(today.auriCharacter).toBeVisible()
    expect(await today.auriMode()).toBe('glyph')
    // No broken <img> element survives in the glyph branch.
    await expect(today.auriCharacter.locator('img.auri-img')).toHaveCount(0)
  })

  test('a today-load failure degrades gracefully and recovers on retry', async ({
    page,
    loggedInPage: _,
  }) => {
    // Clear the tz cookie so the page takes the CLIENT fetch path (the server
    // returns needsTz and the browser fetches `today/` itself — which we can
    // intercept). Then abort the mission fetch so the error card shows.
    await page.context().clearCookies({ name: 'savvo_tz' })

    let blockMission = true
    await page.route('**/api/missions/today/**', (route) => {
      if (blockMission) {
        return route.abort()
      }
      return route.continue()
    })

    await page.goto('/dashboard/today')

    // Graceful degraded card with a retry affordance — never a 500/blank.
    await expect(today_error(page)).toBeVisible({ timeout: 30_000 })
    await expect(today_retry(page)).toBeVisible()

    // Un-abort and retry → the page recovers to the real mission card.
    blockMission = false
    await today_retry(page).click()

    const today = new TodayPage(page)
    await expect(today.missionCard).toBeVisible({ timeout: 15_000 })
    await expect(today.error).toBeHidden()
  })
})

// Small local helpers so the error-path test can reference the markers before a
// successful render exists.
function today_error(page: import('@playwright/test').Page) {
  return page.getByTestId('today-error')
}
function today_retry(page: import('@playwright/test').Page) {
  return page.getByTestId('today-retry')
}
