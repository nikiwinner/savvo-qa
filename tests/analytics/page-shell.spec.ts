/**
 * Phase 11 Story 11.4 — `/dashboard/analytics` page shell + period control.
 *
 * Backend endpoints (Stories 11.1–11.3) are live. This spec covers the
 * frontend shell only — section bodies render "Coming in next story" stubs
 * (filled in by 11.5/11.6/11.7). What we validate here:
 *   • Sidebar link → page reachable.
 *   • Page renders header + period selector + 5 section cards.
 *   • Period changes round-trip via URL params (no client-side state).
 *   • Empty-space path doesn't crash.
 *   • Non-member space renders error states cleanly, no JS errors.
 */
import { test, expect } from '../../fixtures/index'

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

test.describe('Analytics page shell (Story 11.4)', () => {
  test('analytics link in sidebar navigates to the page', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Analytics Home')

    await page.goto(`/dashboard?space=${hh.id}`)
    await page.waitForLoadState('networkidle')

    const analyticsLink = page.locator('.nav-menu a', { hasText: 'Analytics' })
    await expect(analyticsLink).toBeVisible()
    await analyticsLink.click()

    await page.waitForURL(/\/dashboard\/analytics(\?|$)/)
    // The redirect normalises ?space=<id> into the URL.
    expect(page.url()).toContain(`space=${hh.id}`)
    await expect(page.locator('h1.page-title')).toHaveText('Analytics')
    await expect(page.getByTestId('period-selector')).toBeVisible()
  })

  test('period selector month change updates URL and reloads data', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Period Home')

    await page.goto(`/dashboard/analytics?space=${hh.id}`)
    await page.waitForLoadState('networkidle')

    // Pick a clearly earlier month so the active value definitely changes.
    const today = new Date()
    let prev = new Date(today.getFullYear(), today.getMonth() - 2, 1)
    const target = `${prev.getFullYear()}-${pad2(prev.getMonth() + 1)}`

    await page.getByTestId('period-month-select').selectOption(target)

    await page.waitForURL(new RegExp(`period=${target}`))
    expect(page.url()).toContain(`period=${target}`)
    expect(page.url()).toContain(`space=${hh.id}`)

    // Page heading still rendered — server data round-trip completed cleanly.
    await expect(page.locator('h1.page-title')).toHaveText('Analytics')
    await expect(page.getByTestId('period-selector')).toBeVisible()
  })

  test('months dropdown change updates URL', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Months Home')

    await page.goto(`/dashboard/analytics?space=${hh.id}`)
    await page.waitForLoadState('networkidle')

    await page.getByTestId('period-months-select').selectOption('12')

    await page.waitForURL(/months=12/)
    expect(page.url()).toContain('months=12')
    expect(page.url()).toContain(`space=${hh.id}`)

    // Sections still render — no crash on rerender. The redesign consolidated
    // the former monthly-trend + income-vs-expenses cards into one cashflow
    // combo chart and added a top-categories card.
    await expect(page.getByTestId('analytics-section-spending')).toBeVisible()
    await expect(page.getByTestId('analytics-section-cashflow')).toBeVisible()
    await expect(page.getByTestId('analytics-section-balance')).toBeVisible()
    await expect(page.getByTestId('analytics-section-insights')).toBeVisible()
    await expect(page.getByTestId('analytics-section-top-categories')).toBeVisible()
  })

  test('empty space renders empty states without crashing', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Empty Home')

    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto(`/dashboard/analytics?space=${hh.id}`)
    await page.waitForLoadState('networkidle')

    await expect(page.locator('h1.page-title')).toHaveText('Analytics')
    // All five section cards render (spending, cashflow, top-categories, insights, balance).
    await expect(page.getByTestId('analytics-section-spending')).toBeVisible()
    await expect(page.getByTestId('analytics-section-cashflow')).toBeVisible()
    await expect(page.getByTestId('analytics-section-top-categories')).toBeVisible()
    await expect(page.getByTestId('analytics-section-insights')).toBeVisible()
    await expect(page.getByTestId('analytics-section-balance')).toBeVisible()

    expect(errors).toEqual([])
  })

  test('non-member space renders cleanly without crashing', async ({ page, twoActors, context }) => {
    const { userA, apiA, apiB } = twoActors

    // A owns a space too — so she has a valid viewer context. Without this,
    // Phase 12's `resolveActiveSpaces` short-circuits the zero-space user
    // into a fixed "no space selected" empty state and never exercises the
    // non-member path at all.
    await apiA.createSpace('A Space')

    // B owns a space that A is not a member of.
    const hhB = await apiB.createSpace('B Space')

    // Log A into the browser context.
    const cookiesA = await apiA.cookies()
    await context.clearCookies()
    await context.addCookies(cookiesA)
    void userA  // silence unused

    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    // Force-feed B's space id while logged in as A. Phase 12's
    // `resolveActiveSpaces` strips the unknown id from the URL and 302s back
    // to /dashboard/analytics (no space param), where A's own spaces are used.
    // The page renders normally — no crash, no JS errors. As a fallback the
    // assertion still tolerates the older "page calls backend → 403 →
    // error-placeholders render" path in case the frontend behaviour changes
    // again.
    await page.goto(`/dashboard/analytics?space=${hhB.id}`)
    await page.waitForLoadState('networkidle')

    // Page heading still rendered.
    await expect(page.locator('h1.page-title')).toHaveText('Analytics')

    // Acceptable outcomes (any of):
    //   1. The unknown id was stripped from the URL (Phase 12 redirect path).
    //   2. The unknown id survived in the URL and each analytics section shows
    //      an error placeholder (legacy 403-pass-through path).
    const stillOnOther = page.url().includes(`space=${hhB.id}`)
    if (stillOnOther) {
      const errorPlaceholders = page.getByTestId('analytics-section-error')
      expect(await errorPlaceholders.count()).toBeGreaterThan(0)
    }

    expect(errors).toEqual([])
  })
})
