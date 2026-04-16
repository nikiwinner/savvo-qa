/**
 * Expenses — Month Filter (Phase 01, Story 1.9)
 *
 * Verifies that the month selector filters the transaction list,
 * "All time" shows everything, and the filter state is URL-driven.
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
  test('month filter is present on the expenses page', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    await api.createHousehold('Filter Home')

    const expenses = new ExpensesPage(page)
    await expenses.goto()

    const monthInput = page.locator('#month-filter')
    await expect(monthInput).toBeVisible()
  })

  test('changing the month filter updates the displayed transactions', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Month Filter Home')

    // Create one expense this month and one last month
    await api.createExpense({ household: hh.id, description: 'This Month Expense', amount: 100, expense_date: TODAY })
    await api.createExpense({ household: hh.id, description: 'Last Month Expense', amount: 200, expense_date: lastMonthStr() })

    const expenses = new ExpensesPage(page)
    await expenses.goto()

    // Set filter to current month
    await page.locator('#month-filter').fill(currentMonthParam())
    await page.locator('#month-filter').dispatchEvent('change')
    await page.waitForLoadState('networkidle')

    // Should see this month's expense but not last month's
    await expect(page.locator('tbody tr', { hasText: 'This Month Expense' })).toBeVisible()
    await expect(page.locator('tbody tr', { hasText: 'Last Month Expense' })).not.toBeVisible()
  })

  test('"All time" option shows all transactions', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('All Time Home')

    await api.createExpense({ household: hh.id, description: 'This Month', amount: 100, expense_date: TODAY })
    await api.createExpense({ household: hh.id, description: 'Last Month', amount: 200, expense_date: lastMonthStr() })

    const expenses = new ExpensesPage(page)
    // Navigate with month filter set first
    await page.goto(`/dashboard/expenses?month=${currentMonthParam()}`)
    await page.waitForLoadState('networkidle')

    // Should only see this month
    await expect(page.locator('tbody tr', { hasText: 'This Month' })).toBeVisible()
    await expect(page.locator('tbody tr', { hasText: 'Last Month' })).not.toBeVisible()

    // Click "All time" button
    await page.locator('button', { hasText: 'All time' }).click()
    await page.waitForLoadState('networkidle')

    // Now both should be visible
    await expect(page.locator('tbody tr', { hasText: 'This Month' })).toBeVisible()
    await expect(page.locator('tbody tr', { hasText: 'Last Month' })).toBeVisible()
  })

  test('month filter is reflected in the URL', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('URL State Home')

    // Navigate directly with the month param — URL-driven state
    const monthParam = currentMonthParam()
    await page.goto(`/dashboard/expenses?household=${hh.id}&month=${monthParam}`)
    await page.waitForLoadState('networkidle')

    // The URL should still contain the month param after navigation
    expect(page.url()).toContain(`month=${monthParam}`)

    // The month input should reflect the current month filter
    const monthInput = page.locator('#month-filter')
    await expect(monthInput).toHaveValue(monthParam)
  })

  test('empty state shown when no transactions exist for selected month', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Empty Month Home')

    // Create an expense last month only — this month should show empty
    await api.createExpense({ household: hh.id, description: 'Old Expense', amount: 50, expense_date: lastMonthStr() })

    const expenses = new ExpensesPage(page)
    await page.goto(`/dashboard/expenses?month=${currentMonthParam()}`)
    await page.waitForLoadState('networkidle')

    await expect(expenses.emptyState).toBeVisible()
    await expect(page.locator('tbody tr', { hasText: 'Old Expense' })).not.toBeVisible()
  })
})
