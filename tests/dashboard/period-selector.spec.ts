/**
 * Period selector driving the per-space summary cards (Phase 17, Story 17.3 —
 * the cards + period pill moved from the old `/dashboard` root to
 * `/dashboard/spaces`).
 *
 * The Spaces page is driven by a single period window (preset chips + custom day
 * range). Each per-space summary card's Income/Expense/Net reflects the chosen
 * window, and each card figure deep-links to a feed query that sums to it for
 * that window (no-fake-numbers gate).
 *
 * NOTE the shared period pill also exists on the main `/dashboard` (where it
 * drives the analytics KPI/cashflow — covered by analytics/dashboard specs);
 * here we cover the pill driving the Spaces card numbers.
 *
 * Everything is seeded in EUR (default User.currency) so figures equal native
 * amounts with no FX conversion.
 */
import type { Locator, Page } from '@playwright/test'
import { test, expect } from '../../fixtures/index'
import { DashboardPage } from '../../pages/DashboardPage'

const NOW = new Date()
const CURRENT_MONTH = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}`
const THIS_MID = `${CURRENT_MONTH}-15`
const prev = new Date(NOW.getFullYear(), NOW.getMonth() - 1, 15)
const PREV_MONTH = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
const PREV_MID = `${PREV_MONTH}-15`

/**
 * Pick a day in one of the custom-range DatePickers. `field` is the visible
 * "From"/"To" label; the panel seeds both pickers to the current month on open,
 * so for current-month days no month navigation is needed.
 */
async function pickCustomDay(page: Page, panel: Locator, field: 'From' | 'To', day: number): Promise<void> {
  const picker = panel
    .locator('.range-field')
    .filter({ has: page.locator('.range-field-label', { hasText: field }) })
    .locator('.dp')
  await picker.locator('.dp-trigger').click()
  await picker.locator('.dp-dropdown').waitFor({ state: 'visible' })
  // Exact match so day "1" doesn't match "10"/"15".
  await picker.locator('.dp-day:not(.dp-day-empty)').getByText(String(day), { exact: true }).click()
  await picker.locator('.dp-dropdown').waitFor({ state: 'hidden' })
}

test.describe('Spaces page period selector', () => {
  test('defaults to this month; the "All" preset widens the window', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Period Space')
    await api.createExpense({ space: space.id, description: 'PS-THIS', amount: 100, expense_date: THIS_MID })
    await api.createExpense({ space: space.id, description: 'PS-PREV', amount: 50, expense_date: PREV_MID })

    const dashboard = new DashboardPage(page)
    await dashboard.gotoSpaces()

    // Default (no preset) → this month only → 100.
    await expect(dashboard.periodPreset('month')).toHaveAttribute('aria-pressed', 'true')
    await expect(dashboard.summaryOutflow()).toContainText('100.00')

    // All → both months fold in → 150.
    await dashboard.periodPreset('all').click()
    await page.waitForLoadState('networkidle')
    await expect(dashboard.summaryOutflow()).toContainText('150.00')
  })

  test('a custom day range filters the summary cards', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Custom Space')
    await api.createExpense({ space: space.id, description: 'CR-EARLY', amount: 11, expense_date: `${CURRENT_MONTH}-05` })
    await api.createExpense({ space: space.id, description: 'CR-LATE', amount: 22, expense_date: `${CURRENT_MONTH}-25` })

    const dashboard = new DashboardPage(page)
    await dashboard.gotoSpaces()
    // Default this month → both days → 33.
    await expect(dashboard.summaryOutflow()).toContainText('33.00')

    // Custom range covering only the early day.
    await page.goto(`/dashboard/spaces?preset=custom&date_from=${CURRENT_MONTH}-01&date_to=${CURRENT_MONTH}-10`)
    await page.waitForLoadState('networkidle')
    await expect(dashboard.periodPreset('custom')).toHaveAttribute('aria-pressed', 'true')
    await expect(dashboard.summaryOutflow()).toContainText('11.00')
    await expect(dashboard.summaryOutflow()).not.toContainText('33')
  })

  test('a card figure deep-links to the feed for the SAME custom window (no-fake-numbers)', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('DL Period Space')
    await api.createExpense({ space: space.id, description: 'DLP-IN', amount: 18, expense_date: `${CURRENT_MONTH}-10` })
    await api.createExpense({ space: space.id, description: 'DLP-OUT', amount: 7, expense_date: `${CURRENT_MONTH}-20` })

    const dashboard = new DashboardPage(page)
    // Custom range covering only day 10 → card outflow = 18 (day 20 excluded).
    await page.goto(
      `/dashboard/spaces?space=${space.id}&preset=custom&date_from=${CURRENT_MONTH}-01&date_to=${CURRENT_MONTH}-15`,
    )
    await page.waitForLoadState('networkidle')
    await expect(dashboard.summaryOutflow()).toContainText('18.00')

    // Click the Expense figure → lands on the feed filtered to the same window.
    await dashboard.summaryOutflowLink().click()
    await page.waitForURL(/\/dashboard\/transactions\?/)
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/type=expense/)
    await expect(page).toHaveURL(/date_from=/)

    // The landed list's expense totals-strip == the card figure (18, not 25).
    const stripExpense = page.locator('.summary-strip .stat-expense .stat-value')
    await expect(stripExpense).toContainText('18.00')
    await expect(stripExpense).not.toContainText('25')
  })

  test('clicking Custom → picking a range → Apply narrows the summary (full click flow)', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Click Custom Space')
    // Two current-month days; the custom range will include only the early one.
    await api.createExpense({ space: space.id, description: 'CC-EARLY', amount: 14, expense_date: `${CURRENT_MONTH}-05` })
    await api.createExpense({ space: space.id, description: 'CC-LATE', amount: 28, expense_date: `${CURRENT_MONTH}-25` })

    const dashboard = new DashboardPage(page)
    await dashboard.gotoSpaces()
    // Default this month → both days → 42.
    await expect(dashboard.summaryOutflow()).toContainText('42.00')

    // Open the custom-range panel via a real click.
    await dashboard.periodPreset('custom').click()
    const panel = page.getByTestId('period-custom-range')
    await expect(panel).toBeVisible()

    // Pick From=1, To=10 (current month) — excludes day 25.
    await pickCustomDay(page, panel, 'From', 1)
    await pickCustomDay(page, panel, 'To', 10)

    // Apply.
    await page.getByTestId('period-custom-apply').click()
    await page.waitForLoadState('networkidle')

    // URL now carries the custom window.
    await expect(page).toHaveURL(/preset=custom/)
    await expect(page).toHaveURL(new RegExp(`date_from=${CURRENT_MONTH}-01`))
    await expect(page).toHaveURL(new RegExp(`date_to=${CURRENT_MONTH}-10`))
    await expect(dashboard.periodPreset('custom')).toHaveAttribute('aria-pressed', 'true')

    // Figures narrowed: only the early (14) day is in scope.
    await expect(dashboard.summaryOutflow()).toContainText('14.00')
    await expect(dashboard.summaryOutflow()).not.toContainText('42')
  })

  test('re-applying the same custom range still refreshes (Apply is never a silent no-op)', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Reapply Space')
    await api.createExpense({ space: space.id, description: 'RA-IN', amount: 9, expense_date: `${CURRENT_MONTH}-05` })

    const dashboard = new DashboardPage(page)
    // Land already on the exact custom window the user will re-pick, so Apply
    // produces an identical URL — the component must still invalidate (refresh)
    // rather than silently no-op.
    await page.goto(
      `/dashboard/spaces?space=${space.id}&preset=custom&date_from=${CURRENT_MONTH}-01&date_to=${CURRENT_MONTH}-10`,
    )
    await page.waitForLoadState('networkidle')
    await expect(dashboard.summaryOutflow()).toContainText('9.00')

    // Landing on ?preset=custom opens the panel automatically (customOpen =
    // preset === 'custom'). Only click the chip to open it if it's still closed,
    // otherwise the click would toggle it shut.
    const panel = page.getByTestId('period-custom-range')
    if (!(await panel.isVisible())) {
      await dashboard.periodPreset('custom').click()
    }
    await expect(panel).toBeVisible()
    // Re-pick the SAME range, then Apply → identical target URL.
    await pickCustomDay(page, panel, 'From', 1)
    await pickCustomDay(page, panel, 'To', 10)

    // Apply must not throw / hang and the figure stays correct after the refresh.
    await page.getByTestId('period-custom-apply').click()
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(new RegExp(`date_from=${CURRENT_MONTH}-01`))
    await expect(page).toHaveURL(new RegExp(`date_to=${CURRENT_MONTH}-10`))
    await expect(dashboard.summaryOutflow()).toContainText('9.00')
  })
})
