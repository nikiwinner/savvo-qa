/**
 * Phase 11 Story 11.4 — `/dashboard/analytics` page shell + period control.
 *
 * Backend endpoints (Stories 11.1–11.3) are live. This spec covers the
 * frontend shell only — section bodies render "Coming in next story" stubs
 * (filled in by 11.5/11.6/11.7). What we validate here:
 *   • Sidebar link → page reachable.
 *   • Page renders header + period pill + 5 section cards.
 *   • Period changes round-trip via URL params (no client-side state).
 *   • Empty-space path doesn't crash.
 *   • Non-member space renders error states cleanly, no JS errors.
 *
 * The analytics page now mounts the SAME shared period pill the
 * dashboard/transactions use (container testid `dashboard-period-selector`,
 * preset chips `period-preset-*`, custom range `period-custom-*`). The old
 * MONTH + TREND-WINDOW dropdowns (`period-selector` / `period-month-select` /
 * `period-months-select`) and the old `?period=` / `?months=` URL params are
 * gone — the range is driven by `?preset=` or `?preset=custom&date_from&date_to`.
 */
import { test, expect } from '../../fixtures/index'

const TODAY = new Date()

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/** First day of the current month, ISO. */
function firstOfThisMonth(): string {
  return `${TODAY.getFullYear()}-${pad2(TODAY.getMonth() + 1)}-01`
}

/** Last day of the current month, ISO. */
function lastOfThisMonth(): string {
  return iso(new Date(TODAY.getFullYear(), TODAY.getMonth() + 1, 0))
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
    // The shared period pill is mounted (replaces the old `period-selector`).
    await expect(page.getByTestId('dashboard-period-selector')).toBeVisible()
  })

  test('changing the period (preset chip) updates the URL and reloads the page data', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Period Home')

    await page.goto(`/dashboard/analytics?space=${hh.id}`)
    await page.waitForLoadState('networkidle')

    // Default (no preset) → "this month" → the cashflow chart slices to the
    // single current month. The mirror count proves the range is one month.
    await expect(page.getByTestId('period-preset-month')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('cashflow-trend-month-count')).toHaveText('1')

    // Drive the 6M preset chip → URL gains ?preset=6m AND the data reloads
    // (the cashflow chart now spans six months). This is the new equivalent of
    // "changing the period updates the URL + reloads data".
    await page.getByTestId('period-preset-6m').click()
    await page.waitForURL(/preset=6m/)
    expect(page.url()).toContain('preset=6m')
    expect(page.url()).toContain(`space=${hh.id}`)

    // Page heading still rendered — server data round-trip completed cleanly.
    await expect(page.locator('h1.page-title')).toHaveText('Analytics')
    await expect(page.getByTestId('dashboard-period-selector')).toBeVisible()
    await expect(page.getByTestId('period-preset-6m')).toHaveAttribute('aria-pressed', 'true')
    // The reload widened the cashflow window from 1 → 6 months — observable
    // proof the period change re-fetched, not just rewrote the URL.
    await expect(page.getByTestId('cashflow-trend-month-count')).toHaveText('6')
  })

  test('the trend window is user-controllable via a custom range and reflected in the chart', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Window Home')

    await page.goto(`/dashboard/analytics?space=${hh.id}`)
    await page.waitForLoadState('networkidle')

    // The old TREND-WINDOW dropdown is gone — the period pill's date range now
    // defines the cashflow window. A 3-calendar-month custom range (the prior
    // two months + this month) must produce a 3-bucket chart. This preserves
    // the original "months dropdown controls the trend window" coverage.
    const start = new Date(TODAY.getFullYear(), TODAY.getMonth() - 2, 1)
    const dateFrom = iso(start)
    const dateTo = lastOfThisMonth()

    await page.goto(
      `/dashboard/analytics?space=${hh.id}&preset=custom&date_from=${dateFrom}&date_to=${dateTo}`,
    )
    await page.waitForLoadState('networkidle')

    expect(page.url()).toContain('preset=custom')
    expect(page.url()).toContain(`date_from=${dateFrom}`)
    expect(page.url()).toContain(`date_to=${dateTo}`)
    expect(page.url()).toContain(`space=${hh.id}`)
    await expect(page.getByTestId('period-preset-custom')).toHaveAttribute('aria-pressed', 'true')

    // The cashflow chart spans exactly three calendar months.
    await expect(page.getByTestId('cashflow-trend-month-count')).toHaveText('3')

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
