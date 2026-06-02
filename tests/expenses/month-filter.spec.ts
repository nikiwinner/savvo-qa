/**
 * Transactions — Period filter (rework 2026-06-02)
 *
 * The old "Months" drawer section + `?month=` deep-link were removed. Period is
 * now driven by the DashboardPeriodSelector rendered at the TOP of the feed view
 * (above the table). URL model: `?preset=month|3m|6m|year|all` or
 * `?preset=custom&date_from=YYYY-MM-DD&date_to=YYYY-MM-DD`; default (no preset) =
 * this month.
 *
 * This spec is the TRANSACTIONS-page counterpart to the dashboard's
 * period-selector spec — it asserts the same control narrows / widens the unified
 * feed (not the dashboard summary cards).
 *
 * Everything is seeded in EUR (default User.currency) so figures equal native
 * amounts with no FX conversion.
 */
import { test, expect } from '../../fixtures/index'
import { ExpensesPage } from '../../pages/ExpensesPage'

const NOW = new Date()
const CURRENT_MONTH = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}`
const THIS_MID = `${CURRENT_MONTH}-15`

function lastMonthMid(): string {
  // Anchor to mid-month BEFORE subtracting so month-end days (e.g. the 31st)
  // don't overflow back into the current month.
  const d = new Date()
  d.setDate(15)
  d.setMonth(d.getMonth() - 1)
  return d.toISOString().split('T')[0]
}

test.describe('Transactions period filter', () => {
  test('the period selector is rendered above the feed', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    await api.createSpace('Period Filter Space')

    const expenses = new ExpensesPage(page)
    await expenses.goto()

    // The DashboardPeriodSelector lives on the feed view (not inside the drawer).
    await expect(page.getByTestId('dashboard-period-selector')).toBeVisible()
    // Default (no preset) → "This month" preset is pressed.
    await expect(page.getByTestId('period-preset-month')).toHaveAttribute('aria-pressed', 'true')
  })

  test('default window = this month; the "All" preset widens it', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Period Widen Space')

    // One expense this month, one last month.
    await api.createExpense({
      space: space.id,
      description: 'This Month Expense',
      amount: 100,
      expense_date: THIS_MID,
    })
    await api.createExpense({
      space: space.id,
      description: 'Last Month Expense',
      amount: 200,
      expense_date: lastMonthMid(),
    })

    // Default landing = this month → only this month's row shows.
    await page.goto(`/dashboard/transactions?space=${space.id}`)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('tbody tr', { hasText: 'This Month Expense' })).toBeVisible()
    await expect(page.locator('tbody tr', { hasText: 'Last Month Expense' })).toHaveCount(0)

    // Click the "All" preset → both months fold in.
    await page.getByTestId('period-preset-all').click()
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/preset=all/)
    await expect(page.locator('tbody tr', { hasText: 'This Month Expense' })).toBeVisible()
    await expect(page.locator('tbody tr', { hasText: 'Last Month Expense' })).toBeVisible()
  })

  test('a custom day-range deep-link narrows the feed', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Custom Range Space')

    // Two rows in the current month, on distinct days.
    await api.createExpense({
      space: space.id,
      description: 'EARLY Expense',
      amount: 11,
      expense_date: `${CURRENT_MONTH}-05`,
    })
    await api.createExpense({
      space: space.id,
      description: 'LATE Expense',
      amount: 22,
      expense_date: `${CURRENT_MONTH}-25`,
    })

    // Custom range covering only the early day.
    await page.goto(
      `/dashboard/transactions?space=${space.id}&preset=custom&date_from=${CURRENT_MONTH}-01&date_to=${CURRENT_MONTH}-10`,
    )
    await page.waitForLoadState('networkidle')

    // The custom preset chip reflects the active window.
    await expect(page.getByTestId('period-preset-custom')).toHaveAttribute('aria-pressed', 'true')

    // Only the early row is in scope.
    await expect(page.locator('tbody tr', { hasText: 'EARLY Expense' })).toBeVisible()
    await expect(page.locator('tbody tr', { hasText: 'LATE Expense' })).toHaveCount(0)
  })

  test('the active period is reflected in the URL and the active-filters bar', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Period URL Space')
    await api.createExpense({
      space: space.id,
      description: 'URL Row',
      amount: 30,
      expense_date: THIS_MID,
    })

    await page.goto(`/dashboard/transactions?space=${space.id}&preset=all`)
    await page.waitForLoadState('networkidle')

    // The URL keeps the preset param.
    expect(page.url()).toContain('preset=all')

    // A non-default period surfaces a removable chip in the active-filters bar.
    const bar = page.getByTestId('active-filters-bar')
    await expect(bar).toBeVisible()
    await expect(bar).toContainText('All time')
  })

  test('empty state shown when no transactions fall in the selected window', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Empty Window Space')

    // Only a last-month expense — the default (this-month) window is empty.
    await api.createExpense({
      space: space.id,
      description: 'Old Expense',
      amount: 50,
      expense_date: lastMonthMid(),
    })

    const expenses = new ExpensesPage(page)
    await page.goto(`/dashboard/transactions?space=${space.id}`)
    await page.waitForLoadState('networkidle')

    await expect(expenses.emptyState).toBeVisible()
    await expect(page.locator('tbody tr', { hasText: 'Old Expense' })).toHaveCount(0)
  })
})
