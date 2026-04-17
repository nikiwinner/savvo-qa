/**
 * Expenses — CRUD (Phase 00 Story 0.4 + Phase 01)
 *
 * Create, edit, delete via the browser UI.
 * Expenses require an existing household — each test creates one via API.
 */
import { test, expect } from '../../fixtures/index'
import { HouseholdsPage } from '../../pages/HouseholdsPage'
import { ExpensesPage } from '../../pages/ExpensesPage'

const TODAY = new Date().toISOString().split('T')[0]

test.describe('Expenses CRUD', () => {
  test('shows info message when user has no households', async ({ page, loggedInPage: _ }) => {
    const expenses = new ExpensesPage(page)
    await expenses.goto()

    await expect(expenses.noHouseholdMessage).toBeVisible()
    await expect(expenses.noHouseholdMessage).toContainText('create a household first')
    // Create button should be disabled
    await expect(expenses.newExpenseButton).toBeDisabled()
  })

  test('shows empty state when user has a household but no expenses', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    await api.createHousehold('Test Home')

    const expenses = new ExpensesPage(page)
    await page.goto('/dashboard/expenses?month=all')
    await page.waitForLoadState('networkidle')

    await expect(expenses.emptyState).toBeVisible()
    await expect(expenses.emptyState).toContainText('No transactions yet')
  })

  test('creates an expense — it appears in the table', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    await api.createHousehold('My Home')

    const expenses = new ExpensesPage(page)
    await expenses.goto()

    await expenses.createExpense({
      householdLabel: 'My Home',
      category: 'Groceries',
      description: 'Weekly groceries',
      amount: '150.00',
      date: TODAY,
    })

    await expect(expenses.row('Weekly groceries')).toBeVisible()
    await expect(expenses.emptyState).not.toBeVisible()
  })

  test('create form closes after successful submission', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    await api.createHousehold('Form Close Test')

    const expenses = new ExpensesPage(page)
    await expenses.goto()
    await expenses.openCreateForm()
    await expect(expenses.createForm).toBeVisible()

    await expenses.submitCreateForm({
      householdLabel: 'Form Close Test',
      category: 'Utilities',
      description: 'Electric bill',
      amount: '80.00',
      date: TODAY,
    })

    await expect(expenses.createForm).not.toBeVisible()
  })

  test('edits an expense description', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const household = await api.createHousehold('Edit Test Home')
    await api.createExpense({
      household: household.id,
      description: 'Original Description',
      amount: 50,
      expense_date: TODAY,
    })

    const expenses = new ExpensesPage(page)
    await expenses.goto()

    await expenses.editExpense('Original Description', { description: 'Updated Description' })

    await expect(expenses.row('Updated Description')).toBeVisible()
    await expect(expenses.row('Original Description')).not.toBeVisible()
  })

  test('edits an expense amount', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const household = await api.createHousehold('Amount Edit Home')
    await api.createExpense({
      household: household.id,
      description: 'Rent Payment',
      amount: 1000,
      expense_date: TODAY,
    })

    const expenses = new ExpensesPage(page)
    await expenses.goto()

    await expenses.editExpense('Rent Payment', { amount: '1200' })

    await expect(expenses.row('Rent Payment')).toContainText('$1,200.00')
  })

  test('cancel edit reverts without saving', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const household = await api.createHousehold('Cancel Edit Home')
    await api.createExpense({
      household: household.id,
      description: 'Cancel Test',
      amount: 75,
      expense_date: TODAY,
    })

    const expenses = new ExpensesPage(page)
    await expenses.goto()

    await expenses.row('Cancel Test').locator('.btn-icon[title="Edit"]').click()
    const editRow = page.locator('tr.edit-row')
    await editRow.locator('input[name="description"]').fill('Cancelled Change')
    await expenses.cancelEdit()

    await expect(expenses.row('Cancel Test')).toBeVisible()
    await expect(expenses.row('Cancelled Change')).not.toBeVisible()
  })

  test('deletes an expense — it disappears from the table', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const household = await api.createHousehold('Delete Test Home')
    await api.createExpense({
      household: household.id,
      description: 'To Be Deleted',
      amount: 20,
      expense_date: TODAY,
    })

    const expenses = new ExpensesPage(page)
    await expenses.goto()

    await expenses.deleteExpense('To Be Deleted')

    await expect(expenses.row('To Be Deleted')).not.toBeVisible()
  })

  test('summary shows the correct total amount', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const household = await api.createHousehold('Summary Home')
    await api.createExpense({ household: household.id, description: 'Exp A', amount: 100, expense_date: TODAY })
    await api.createExpense({ household: household.id, description: 'Exp B', amount: 50.50, expense_date: TODAY })

    const expenses = new ExpensesPage(page)
    await expenses.goto()

    // 100 + 50.50 = $150.50 (in the expense summary card specifically)
    await expect(page.locator('.expense-summary .summary-value')).toContainText('$150.50')
  })

  test('link to households page is shown when no households exist', async ({
    page,
    loggedInPage: _,
  }) => {
    const expenses = new ExpensesPage(page)
    await expenses.goto()

    const link = page.locator('.info-message a', { hasText: 'Go to Households' })
    await expect(link).toBeVisible()

    await link.click()
    await expect(page).toHaveURL('/dashboard/households')
  })
})
