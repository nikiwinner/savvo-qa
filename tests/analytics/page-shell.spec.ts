/**
 * Phase 11 Story 11.4 — `/dashboard/analytics` page shell + period control.
 *
 * Backend endpoints (Stories 11.1–11.3) are live. This spec covers the
 * frontend shell only — section bodies render "Coming in next story" stubs
 * (filled in by 11.5/11.6/11.7). What we validate here:
 *   • Sidebar link → page reachable.
 *   • Page renders header + period selector + 5 section cards.
 *   • Period changes round-trip via URL params (no client-side state).
 *   • Empty-household path doesn't crash.
 *   • Non-member household renders error states cleanly, no JS errors.
 */
import { test, expect } from '../../fixtures/index'

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

test.describe('Analytics page shell (Story 11.4)', () => {
  test('analytics link in sidebar navigates to the page', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Analytics Home')

    await page.goto(`/dashboard?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    const analyticsLink = page.locator('.nav-menu a', { hasText: 'Analytics' })
    await expect(analyticsLink).toBeVisible()
    await analyticsLink.click()

    await page.waitForURL(/\/dashboard\/analytics(\?|$)/)
    // The redirect normalises ?household=<id> into the URL.
    expect(page.url()).toContain(`household=${hh.id}`)
    await expect(page.locator('h1.page-title')).toHaveText('Analytics')
    await expect(page.getByTestId('period-selector')).toBeVisible()
  })

  test('period selector month change updates URL and reloads data', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Period Home')

    await page.goto(`/dashboard/analytics?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    // Pick a clearly earlier month so the active value definitely changes.
    const today = new Date()
    let prev = new Date(today.getFullYear(), today.getMonth() - 2, 1)
    const target = `${prev.getFullYear()}-${pad2(prev.getMonth() + 1)}`

    await page.getByTestId('period-month-select').selectOption(target)

    await page.waitForURL(new RegExp(`period=${target}`))
    expect(page.url()).toContain(`period=${target}`)
    expect(page.url()).toContain(`household=${hh.id}`)

    // Page heading still rendered — server data round-trip completed cleanly.
    await expect(page.locator('h1.page-title')).toHaveText('Analytics')
    await expect(page.getByTestId('period-selector')).toBeVisible()
  })

  test('months dropdown change updates URL', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Months Home')

    await page.goto(`/dashboard/analytics?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    await page.getByTestId('period-months-select').selectOption('12')

    await page.waitForURL(/months=12/)
    expect(page.url()).toContain('months=12')
    expect(page.url()).toContain(`household=${hh.id}`)

    // Section stubs still render — no crash on rerender.
    const stubs = page.getByTestId('analytics-section-stub')
    expect(await stubs.count()).toBeGreaterThan(0)
  })

  test('empty household renders empty states without crashing', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Empty Home')

    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await page.goto(`/dashboard/analytics?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    await expect(page.locator('h1.page-title')).toHaveText('Analytics')
    // All five section cards render (spending, monthly-trend, income-vs-expenses, balance, insights).
    await expect(page.getByTestId('analytics-section-spending')).toBeVisible()
    await expect(page.getByTestId('analytics-section-monthly-trend')).toBeVisible()
    await expect(page.getByTestId('analytics-section-income-expenses')).toBeVisible()
    await expect(page.getByTestId('analytics-section-balance')).toBeVisible()
    await expect(page.getByTestId('analytics-section-insights')).toBeVisible()

    expect(errors).toEqual([])
  })

  test('non-member household renders cleanly without crashing', async ({ page, twoActors, context }) => {
    const { userA, apiA, apiB } = twoActors

    // B owns a household that A is not a member of.
    const hhB = await apiB.createHousehold('B Household')

    // Log A into the browser context.
    const cookiesA = await apiA.cookies()
    await context.clearCookies()
    await context.addCookies(cookiesA)
    void userA  // silence unused

    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    // Force-feed B's household id while logged in as A. The backend should
    // 403 on every analytics endpoint, which the loader catches into
    // loadErrors — the page renders error states for each section. No crash.
    await page.goto(`/dashboard/analytics?household=${hhB.id}`)
    await page.waitForLoadState('networkidle')

    // Page heading still rendered.
    await expect(page.locator('h1.page-title')).toHaveText('Analytics')

    // Either each section shows the empty-error placeholder, OR (if the loader
    // redirected A to her first household with `?household=<idA>`) the URL no
    // longer carries hhB.id. Both are acceptable per the DoD.
    const stillOnOther = page.url().includes(`household=${hhB.id}`)
    if (stillOnOther) {
      const errorPlaceholders = page.getByTestId('analytics-section-error')
      expect(await errorPlaceholders.count()).toBeGreaterThan(0)
    }

    expect(errors).toEqual([])
  })
})
