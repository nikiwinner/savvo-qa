/**
 * Expenses — Month Filter (Phase 01, Story 1.9)
 *
 * Verifies that the month filter chips filter the transaction list,
 * the "All" button shows everything, and the filter state is URL-driven.
 *
 * The filter UI lives inside a right-side <Drawer> (opened via the "Filters"
 * button in the page header). Each month is a checkbox chip (label.filter-chip);
 * the "All"/"Clear" button (.btn-filter-action) appears in the Months section
 * header. The drawer only renders its content while open.
 */
import { test, expect } from '../../fixtures/index'
import { ExpensesPage } from '../../pages/ExpensesPage'

const TODAY = new Date().toISOString().split('T')[0]

function lastMonthStr(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  return d.toISOString().split('T')[0]
}

function currentMonthParam(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

test.describe('Month filter', () => {
  test('month filter is present in the filters drawer', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    await api.createSpace('Filter Home')

    const expenses = new ExpensesPage(page)
    await expenses.goto()

    // Open the filters drawer.
    await expenses.openFilters()
    const drawer = expenses.filtersDrawer()
    await expect(drawer).toBeVisible()
    // The Months filter section exists inside the drawer.
    await expect(drawer.locator('.filter-section-title', { hasText: 'Months' })).toBeVisible()
  })

  test('changing the month filter updates the displayed transactions', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Month Filter Home')

    // Create one expense this month and one last month
    await api.createExpense({ space: hh.id, description: 'This Month Expense', amount: 100, expense_date: TODAY })
    await api.createExpense({ space: hh.id, description: 'Last Month Expense', amount: 200, expense_date: lastMonthStr() })

    // Navigate with current month filter applied
    const expenses = new ExpensesPage(page)
    await page.goto(`/dashboard/expenses?space=${hh.id}&month=${currentMonthParam()}`)
    await page.waitForLoadState('networkidle')

    // Should see this month's expense but not last month's
    await expect(page.locator('tbody tr', { hasText: 'This Month Expense' })).toBeVisible()
    await expect(page.locator('tbody tr', { hasText: 'Last Month Expense' })).not.toBeVisible()
  })

  test('"All" filter shows all transactions', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('All Time Home')

    await api.createExpense({ space: hh.id, description: 'This Month', amount: 100, expense_date: TODAY })
    await api.createExpense({ space: hh.id, description: 'Last Month', amount: 200, expense_date: lastMonthStr() })

    // Navigate with current month filter set first — only this month shows
    await page.goto(`/dashboard/expenses?space=${hh.id}&month=${currentMonthParam()}`)
    await page.waitForLoadState('networkidle')

    await expect(page.locator('tbody tr', { hasText: 'This Month' })).toBeVisible()
    await expect(page.locator('tbody tr', { hasText: 'Last Month' })).not.toBeVisible()

    // Open the drawer and click the Months section's "All" button to show
    // all transactions.
    const expenses = new ExpensesPage(page)
    await expenses.openFilters()
    const monthsSection = expenses
      .filtersDrawer()
      .locator('.filter-section')
      .filter({ has: page.locator('.filter-section-title', { hasText: 'Months' }) })
    await monthsSection.locator('.btn-filter-action', { hasText: 'All' }).click()
    await page.waitForLoadState('networkidle')

    // Now both should be visible
    await expect(page.locator('tbody tr', { hasText: 'This Month' })).toBeVisible()
    await expect(page.locator('tbody tr', { hasText: 'Last Month' })).toBeVisible()
  })

  test('month filter is reflected in the URL', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('URL State Home')

    // Navigate directly with the month param — URL-driven state
    const monthParam = currentMonthParam()
    await page.goto(`/dashboard/expenses?space=${hh.id}&month=${monthParam}`)
    await page.waitForLoadState('networkidle')

    // The URL should still contain the month param after navigation
    expect(page.url()).toContain(`month=${monthParam}`)

    // Open the drawer; the corresponding month chip should be checked in the
    // Months filter section.
    const expenses = new ExpensesPage(page)
    await expenses.openFilters()
    const monthsSection = expenses
      .filtersDrawer()
      .locator('.filter-section')
      .filter({ has: page.locator('.filter-section-title', { hasText: 'Months' }) })
    const chipLabel = monthsSection.locator('.filter-chip').filter({
      has: page.locator('input[type="checkbox"]:checked'),
    })
    await expect(chipLabel.first()).toBeVisible()
  })

  test('empty state shown when no transactions exist for selected month', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Empty Month Home')

    // Create an expense last month only — this month should show empty
    await api.createExpense({ space: hh.id, description: 'Old Expense', amount: 50, expense_date: lastMonthStr() })

    const expenses = new ExpensesPage(page)
    await page.goto(`/dashboard/expenses?space=${hh.id}&month=${currentMonthParam()}`)
    await page.waitForLoadState('networkidle')

    await expect(expenses.emptyState).toBeVisible()
    await expect(page.locator('tbody tr', { hasText: 'Old Expense' })).not.toBeVisible()
  })
})
