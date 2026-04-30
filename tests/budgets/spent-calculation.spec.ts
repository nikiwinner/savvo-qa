/**
 * Budgets — Spent calculation (Phase 06, Story 6.3)
 *
 * Verifies that `spent` on a budget correctly aggregates:
 * - manual Expense rows
 * - BankTransaction rows
 * - both combined
 * - income rows are excluded
 */
import { test, expect } from '../../fixtures/index'

const NOW = new Date()
const YEAR = NOW.getFullYear()
const MONTH = NOW.getMonth() + 1
// First day of current month as ISO date
const MONTH_DATE = `${YEAR}-${String(MONTH).padStart(2, '0')}-01`

test.describe('Budget spent calculation', () => {
  test('spent reflects manual expenses only when no bank txn exists', async ({ loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Spent Manual Only')
    const categories = await api.listCategories()
    const cat = categories[0]

    // Create a budget
    await api.createBudget({
      household: hh.id,
      category: cat.id,
      amount: '500.00',
      year: YEAR,
      month: MONTH,
    })

    // Seed a manual expense in the same category
    await api.createExpense({
      household: hh.id,
      description: 'Manual only expense',
      amount: 123.45,
      category: cat.id,
      type: 'expense',
      expense_date: MONTH_DATE,
    })

    // Query the budget API and check spent
    const budgets = await api.listBudgets({ household: hh.id, year: YEAR, month: MONTH })
    const budget = budgets.find((b) => b.category === cat.id)
    expect(budget).toBeDefined()
    expect(parseFloat(budget!.spent)).toBeCloseTo(123.45, 1)
  })

  test('spent reflects bank transactions only when no manual expense exists', async ({
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Spent Bank Only')
    const categories = await api.listCategories()
    const cat = categories[0]

    await api.createBudget({
      household: hh.id,
      category: cat.id,
      amount: '500.00',
      year: YEAR,
      month: MONTH,
    })

    // Seed a bank transaction
    await api.createBankTransaction({
      description: 'Bank txn only',
      amount: '67.89',
      type: 'expense',
      transaction_date: MONTH_DATE,
      household_id: hh.id,
      category_id: cat.id,
    })

    const budgets = await api.listBudgets({ household: hh.id, year: YEAR, month: MONTH })
    const budget = budgets.find((b) => b.category === cat.id)
    expect(budget).toBeDefined()
    expect(parseFloat(budget!.spent)).toBeCloseTo(67.89, 1)
  })

  test('spent sums manual expenses and bank transactions together', async ({ loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Spent Combined')
    const categories = await api.listCategories()
    const cat = categories[0]

    await api.createBudget({
      household: hh.id,
      category: cat.id,
      amount: '1000.00',
      year: YEAR,
      month: MONTH,
    })

    // Manual expense
    await api.createExpense({
      household: hh.id,
      description: 'Combined manual',
      amount: 100.00,
      category: cat.id,
      type: 'expense',
      expense_date: MONTH_DATE,
    })

    // Bank transaction
    await api.createBankTransaction({
      description: 'Combined bank',
      amount: '50.00',
      type: 'expense',
      transaction_date: MONTH_DATE,
      household_id: hh.id,
      category_id: cat.id,
    })

    const budgets = await api.listBudgets({ household: hh.id, year: YEAR, month: MONTH })
    const budget = budgets.find((b) => b.category === cat.id)
    expect(budget).toBeDefined()
    expect(parseFloat(budget!.spent)).toBeCloseTo(150.00, 1)
  })

  test('income rows are excluded from spent', async ({ loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Spent Income Excluded')
    const categories = await api.listCategories()
    const cat = categories[0]

    await api.createBudget({
      household: hh.id,
      category: cat.id,
      amount: '500.00',
      year: YEAR,
      month: MONTH,
    })

    // Seed one expense (should count) and one income (should be ignored)
    await api.createExpense({
      household: hh.id,
      description: 'Real expense',
      amount: 40.00,
      category: cat.id,
      type: 'expense',
      expense_date: MONTH_DATE,
    })
    await api.createExpense({
      household: hh.id,
      description: 'Income row',
      amount: 200.00,
      category: cat.id,
      type: 'income',
      expense_date: MONTH_DATE,
    })

    const budgets = await api.listBudgets({ household: hh.id, year: YEAR, month: MONTH })
    const budget = budgets.find((b) => b.category === cat.id)
    expect(budget).toBeDefined()
    // Only the 40.00 expense counts
    expect(parseFloat(budget!.spent)).toBeCloseTo(40.00, 1)
  })
})
