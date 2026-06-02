/**
 * Expenses — Transaction Type (Phase 01, Story 1.9)
 *
 * Verifies income/expense type toggle: creation, visual distinction,
 * edit form pre-selection, and dashboard stat differentiation.
 */
import { test, expect } from '../../fixtures/index'
import { ExpensesPage } from '../../pages/ExpensesPage'
import { DashboardPage } from '../../pages/DashboardPage'

const TODAY = new Date().toISOString().split('T')[0]

test.describe('Transaction type (income vs expense)', () => {
  test('type defaults to expense when opening the create form', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    await api.createSpace('Type Default Home')

    const expenses = new ExpensesPage(page)
    await expenses.goto()
    await expenses.openCreateForm()

    // The "Expense" radio should be checked by default
    const expenseRadio = page.locator('.form-paper input[type="radio"][value="expense"]')
    await expect(expenseRadio).toBeChecked()
    const incomeRadio = page.locator('.form-paper input[type="radio"][value="income"]')
    await expect(incomeRadio).not.toBeChecked()
  })

  test('can create an expense transaction', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Expense Type Home')

    const expenses = new ExpensesPage(page)
    await expenses.createExpense({
      spaceLabel: 'Expense Type Home',
      spaceId: hh.id,
      type: 'expense',
      category: 'No category',
      description: 'Monthly Rent',
      amount: '1000',
      date: TODAY,
    })

    await expect(page.locator('tbody tr', { hasText: 'Monthly Rent' })).toBeVisible()
    // Should have an "Expense" type badge
    await expect(
      page.locator('tbody tr', { hasText: 'Monthly Rent' }).locator('.badge-expense'),
    ).toBeVisible()
  })

  test('can create an income transaction', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Income Type Home')

    const expenses = new ExpensesPage(page)
    await expenses.createExpense({
      spaceLabel: 'Income Type Home',
      spaceId: hh.id,
      type: 'income',
      category: 'No category',
      description: 'Freelance Payment',
      amount: '500',
      date: TODAY,
    })

    await expect(page.locator('tbody tr', { hasText: 'Freelance Payment' })).toBeVisible()
    // Should have an "Income" type badge
    await expect(
      page.locator('tbody tr', { hasText: 'Freelance Payment' }).locator('.badge-income'),
    ).toBeVisible()
  })

  test('income and expense are visually distinguished in the table', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Visual Distinction Home')
    await api.createExpense({ space: hh.id, description: 'Salary', amount: 3000, type: 'income', expense_date: TODAY })
    await api.createExpense({ space: hh.id, description: 'Electricity', amount: 120, type: 'expense', expense_date: TODAY })

    const expenses = new ExpensesPage(page)
    await expenses.goto()

    // Income row has income-row class and type-income badge
    const salaryRow = page.locator('tbody tr', { hasText: 'Salary' })
    await expect(salaryRow).toBeVisible()
    await expect(salaryRow.locator('.badge-income')).toBeVisible()
    await expect(salaryRow.locator('.amount-income')).toBeVisible()

    // Expense row has type-expense badge
    const elecRow = page.locator('tbody tr', { hasText: 'Electricity' })
    await expect(elecRow).toBeVisible()
    await expect(elecRow.locator('.badge-expense')).toBeVisible()
    await expect(elecRow.locator('.amount-expense')).toBeVisible()
  })

  test('editing a transaction preserves its type', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Edit Type Home')
    await api.createExpense({ space: hh.id, description: 'Side Gig', amount: 200, type: 'income', expense_date: TODAY })

    const expenses = new ExpensesPage(page)
    await expenses.goto()

    // Open edit modal
    await expenses.openEditModal('Side Gig')
    const editModal = expenses.editModal()

    // Type is now a radio group — the "income" radio should be pre-selected.
    await expect(editModal.locator('input[name="type"][value="income"]')).toBeChecked()
    await expect(editModal.locator('input[name="type"][value="expense"]')).not.toBeChecked()
  })

  test('dashboard stats differentiate income and expense', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Stats Split Home')
    await api.createExpense({ space: hh.id, description: 'Paycheck', amount: 2000, type: 'income', expense_date: TODAY })
    await api.createExpense({ space: hh.id, description: 'Groceries', amount: 150, type: 'expense', expense_date: TODAY })

    const dashboard = new DashboardPage(page)
    await dashboard.goto()

    // The per-space summary card splits income vs expense (current-month default).
    // Figures render with thousands separators (e.g. €2,000.00).
    await expect(dashboard.summaryInflow()).toContainText('2,000.00')
    await expect(dashboard.summaryOutflow()).toContainText('150.00')
    // Net = 2000 - 150 = 1850
    await expect(dashboard.summaryNet()).toContainText('1,850.00')
  })
})
