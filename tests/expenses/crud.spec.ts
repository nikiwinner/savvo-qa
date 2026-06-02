/**
 * Expenses — CRUD (Phase 00 Story 0.4 + Phase 01)
 *
 * Create, edit, delete via the browser UI.
 * Expenses require an existing space — each test creates one via API.
 */
import { test, expect } from '../../fixtures/index'
import { SpacesPage } from '../../pages/SpacesPage'
import { ExpensesPage } from '../../pages/ExpensesPage'

const TODAY = new Date().toISOString().split('T')[0]

test.describe('Expenses CRUD', () => {
  // Phase 15, Story 15.2 — the page moved to /dashboard/transactions; the legacy
  // /dashboard/expenses route now redirects, preserving the query string so
  // bookmarked links keep working.
  test('legacy /dashboard/expenses redirects to /dashboard/transactions preserving query', async ({
    page,
    loggedInPage: _,
  }) => {
    await page.goto('/dashboard/expenses?unmapped=true')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL('/dashboard/transactions?unmapped=true')
  })

  test('shows info message when user has no spaces', async ({ page, loggedInPage: _ }) => {
    const expenses = new ExpensesPage(page)
    await expenses.goto()

    await expect(expenses.noSpaceMessage).toBeVisible()
    await expect(expenses.noSpaceMessage).toContainText('create a space first')
    // Create button should be disabled
    await expect(expenses.newExpenseButton).toBeDisabled()
  })

  test('shows empty state when user has a space but no expenses', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    await api.createSpace('Test Home')

    const expenses = new ExpensesPage(page)
    await page.goto('/dashboard/transactions')
    await page.waitForLoadState('networkidle')

    await expect(expenses.emptyState).toBeVisible()
    await expect(expenses.emptyState).toContainText('No transactions yet')
  })

  test('creates an expense — it appears in the table', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('My Home')

    const expenses = new ExpensesPage(page)

    await expenses.createExpense({
      spaceLabel: 'My Home',
      spaceId: space.id,
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
    const space = await api.createSpace('Form Close Test')

    const expenses = new ExpensesPage(page)
    await expenses.gotoWithSpace(space.id)
    await expenses.openCreateForm()
    await expect(expenses.createForm).toBeVisible()

    await expenses.submitCreateForm({
      spaceLabel: 'Form Close Test',
      category: 'Utilities',
      description: 'Electric bill',
      amount: '80.00',
      date: TODAY,
    })

    await expect(expenses.createForm).not.toBeVisible()
  })

  test('edits an expense description', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Edit Test Home')
    await api.createExpense({
      space: space.id,
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
    const space = await api.createSpace('Amount Edit Home')
    await api.createExpense({
      space: space.id,
      description: 'Rent Payment',
      amount: 1000,
      expense_date: TODAY,
    })

    const expenses = new ExpensesPage(page)
    await expenses.goto()

    await expenses.editExpense('Rent Payment', { amount: '1200' })

    // Default user.currency is EUR (backend default); per-row rendering uses
    // expense.currency (snapshotted at create-time) — Story 8.7.
    await expect(expenses.row('Rent Payment')).toContainText('€1,200.00')
  })

  test('cancel edit reverts without saving', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Cancel Edit Home')
    await api.createExpense({
      space: space.id,
      description: 'Cancel Test',
      amount: 75,
      expense_date: TODAY,
    })

    const expenses = new ExpensesPage(page)
    await expenses.goto()

    await expenses.openEditModal('Cancel Test')
    await expenses.editModal().locator('#edit-description').fill('Cancelled Change')
    await expenses.cancelEdit()

    await expect(expenses.row('Cancel Test')).toBeVisible()
    await expect(expenses.row('Cancelled Change')).not.toBeVisible()
  })

  test('deletes an expense — it disappears from the table', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Delete Test Home')
    await api.createExpense({
      space: space.id,
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
    const space = await api.createSpace('Summary Home')
    await api.createExpense({ space: space.id, description: 'Exp A', amount: 100, expense_date: TODAY })
    await api.createExpense({ space: space.id, description: 'Exp B', amount: 50.50, expense_date: TODAY })

    const expenses = new ExpensesPage(page)
    await expenses.goto()

    // 100 + 50.50 = €150.50 (in the Expenses card of the summary strip).
    // Summary uses the viewer's user.currency, which defaults to EUR.
    await expect(page.locator('.summary-strip .stat-expense .stat-value')).toContainText('€150.50')
  })

  test('link to spaces page is shown when no spaces exist', async ({
    page,
    loggedInPage: _,
  }) => {
    const expenses = new ExpensesPage(page)
    await expenses.goto()

    const link = page.locator('.alert.alert-info a', { hasText: 'Go to Spaces' })
    await expect(link).toBeVisible()

    await link.click()
    await expect(page).toHaveURL('/dashboard/spaces')
  })
})
