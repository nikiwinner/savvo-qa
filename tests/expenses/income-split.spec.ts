/**
 * Expenses — Income vs Expense Split Filter (Phase 09, Story 9.1)
 *
 * Verifies the new sidebar Type filter (Income / Expense chips) on
 * /dashboard/expenses:
 *   1. Income chip scopes the table to type=income rows; URL gets ?type=income.
 *   2. Income rows render with a positive sign and the row-income accent class.
 *   3. Expense chip excludes income rows; URL gets ?type=expense.
 *
 * Implementation hints from coder/reviewer:
 *   - The Type filter lives in a right-side <Drawer> opened via the "Filters"
 *     button. Each chip is a <label class="filter-chip"> with text
 *     "Income" / "Expense" inside the drawer's Type section.
 *   - Active chip carries the .filter-chip-active class.
 *   - Income rows on the manual-expense table get class "row-income".
 *   - Amount cell shows leading '+' for income, '-' for expense.
 */
import { test, expect } from '../../fixtures/index'
import { ExpensesPage } from '../../pages/ExpensesPage'

const TODAY = new Date().toISOString().split('T')[0]

test.describe('Income vs expense split filter', () => {
  test('income filter chip scopes the table to type=income rows', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Income Split Home')

    // 2 expense rows + 2 income rows
    await api.createExpense({ space: hh.id, description: 'Rent', amount: 1200, type: 'expense', expense_date: TODAY })
    await api.createExpense({ space: hh.id, description: 'Groceries', amount: 80, type: 'expense', expense_date: TODAY })
    await api.createExpense({ space: hh.id, description: 'Salary', amount: 3000, type: 'income', expense_date: TODAY })
    await api.createExpense({ space: hh.id, description: 'Side Gig', amount: 500, type: 'income', expense_date: TODAY })

    const expenses = new ExpensesPage(page)
    await expenses.goto()

    // Pre-condition: all 4 manual rows are visible.
    await expect(page.locator('tbody tr:not(.edit-row):not(.row-bank)')).toHaveCount(4)

    // Open the filters drawer and click the Income chip in the Type section.
    await expenses.openFilters()
    const typeSection = expenses
      .filtersDrawer()
      .locator('.filter-section')
      .filter({ has: page.locator('.filter-section-title', { hasText: 'Type' }) })
    const incomeChip = typeSection.locator('label.filter-chip', { hasText: 'Income' })
    await incomeChip.click()

    // URL gets ?type=income.
    await expect(page).toHaveURL(/[?&]type=income(\b|$|&)/)

    // Wait for the table to settle and assert only income rows remain.
    await page.waitForLoadState('networkidle')
    const manualRows = page.locator('tbody tr:not(.edit-row):not(.row-bank)')
    await expect(manualRows).toHaveCount(2)
    await expect(page.locator('tbody tr', { hasText: 'Salary' })).toBeVisible()
    await expect(page.locator('tbody tr', { hasText: 'Side Gig' })).toBeVisible()
    await expect(page.locator('tbody tr', { hasText: 'Rent' })).toHaveCount(0)
    await expect(page.locator('tbody tr', { hasText: 'Groceries' })).toHaveCount(0)
  })

  test('income row renders with a positive sign and accent border', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Income Accent Home')

    const incomeDesc = 'income-accent-test'
    await api.createExpense({
      space: hh.id,
      description: incomeDesc,
      amount: 3000,
      type: 'income',
      expense_date: TODAY,
    })

    const expenses = new ExpensesPage(page)
    await expenses.goto()

    const row = page.locator('tbody tr', { hasText: incomeDesc })
    await expect(row).toBeVisible()

    // Selector-based accent assertion (robust across browsers).
    await expect(row).toHaveClass(/\brow-income\b/)

    // Amount cell starts with '+'.
    const amountCell = row.locator('.cell-amount')
    await expect(amountCell).toContainText(/^\+/)
  })

  test('expense filter chip excludes income rows', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Expense Filter Home')

    // Same shape as test 1: 2 expense + 2 income rows.
    await api.createExpense({ space: hh.id, description: 'Rent', amount: 1200, type: 'expense', expense_date: TODAY })
    await api.createExpense({ space: hh.id, description: 'Groceries', amount: 80, type: 'expense', expense_date: TODAY })
    await api.createExpense({ space: hh.id, description: 'Salary', amount: 3000, type: 'income', expense_date: TODAY })
    await api.createExpense({ space: hh.id, description: 'Side Gig', amount: 500, type: 'income', expense_date: TODAY })

    const expenses = new ExpensesPage(page)
    await expenses.goto()

    await expect(page.locator('tbody tr:not(.edit-row):not(.row-bank)')).toHaveCount(4)

    // Open the filters drawer and click the Expense chip in the Type section.
    await expenses.openFilters()
    const typeSection = expenses
      .filtersDrawer()
      .locator('.filter-section')
      .filter({ has: page.locator('.filter-section-title', { hasText: 'Type' }) })
    const expenseChip = typeSection.locator('label.filter-chip', { hasText: 'Expense' })
    await expenseChip.click()

    // URL gets ?type=expense.
    await expect(page).toHaveURL(/[?&]type=expense(\b|$|&)/)

    await page.waitForLoadState('networkidle')
    const manualRows = page.locator('tbody tr:not(.edit-row):not(.row-bank)')
    await expect(manualRows).toHaveCount(2)
    await expect(page.locator('tbody tr', { hasText: 'Rent' })).toBeVisible()
    await expect(page.locator('tbody tr', { hasText: 'Groceries' })).toBeVisible()
    await expect(page.locator('tbody tr', { hasText: 'Salary' })).toHaveCount(0)
    await expect(page.locator('tbody tr', { hasText: 'Side Gig' })).toHaveCount(0)
  })
})
