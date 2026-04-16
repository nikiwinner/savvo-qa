/**
 * Expenses — Data Scoping (Phase 01, Story 1.3)
 *
 * Verifies that:
 * 1. Users only see expenses from their own households in the UI.
 * 2. Creating an expense in a non-member household returns 400 (API-level).
 * 3. Fetching another user's expense directly returns 404 (API-level).
 */
import { test, expect } from '../../fixtures/index'
import { ExpensesPage } from '../../pages/ExpensesPage'
import { ApiHelper, uniqueUser } from '../../helpers/api'

const TODAY = new Date().toISOString().split('T')[0]

test.describe('Expense data scoping', () => {
  test('user only sees their own expenses in the UI', async ({
    page,
    context,
    loggedInPage,
    playwright,
  }) => {
    // User A (loggedInPage) creates an expense
    const { api: apiA } = loggedInPage
    const hhA = await apiA.createHousehold('Alice Kitchen')
    await apiA.createExpense({
      household: hhA.id,
      description: 'Alice Secret Expense',
      amount: 999,
      expense_date: TODAY,
    })

    // Create user B and switch the browser session to user B
    const ctxB = await playwright.request.newContext()
    const apiB = new ApiHelper(ctxB)
    const userB = uniqueUser('bob')
    await apiB.signup(userB)
    await apiB.login(userB.email, userB.password)

    const cookiesB = await apiB.cookies()
    await context.clearCookies()
    await context.addCookies(cookiesB)

    const expenses = new ExpensesPage(page)
    await expenses.goto()

    // User B should see empty state — no table exists at all
    await expect(expenses.emptyState).toBeVisible()
    await expect(page.locator('tbody')).toHaveCount(0)

    await ctxB.dispose()
  })

  test('each user only sees their own expenses via the API', async ({ twoActors }) => {
    const { apiA, apiB } = twoActors

    const hhA = await apiA.createHousehold('Alice Home')
    const hhB = await apiB.createHousehold('Bob Home')

    const expA = await apiA.createExpense({
      household: hhA.id,
      description: 'Alice Expense',
      amount: 200,
      expense_date: TODAY,
    })
    const expB = await apiB.createExpense({
      household: hhB.id,
      description: 'Bob Expense',
      amount: 100,
      expense_date: TODAY,
    })

    const listA = await apiA.listExpenses()
    const listB = await apiB.listExpenses()

    expect(listA.map((e) => e.id)).toContain(expA.id)
    expect(listA.map((e) => e.id)).not.toContain(expB.id)

    expect(listB.map((e) => e.id)).toContain(expB.id)
    expect(listB.map((e) => e.id)).not.toContain(expA.id)
  })

  test('creating an expense in a non-member household returns 400', async ({ twoActors }) => {
    const { apiA, apiB } = twoActors

    // User A creates a household — user B is not a member
    const hhA = await apiA.createHousehold('Alice Only')

    // User B tries to create an expense in Alice's household
    try {
      await apiB.createExpense({
        household: hhA.id,
        description: 'Intrusion Attempt',
        amount: 1,
        expense_date: TODAY,
      })
      // Should not reach here
      throw new Error('Expected createExpense to throw')
    } catch (err: unknown) {
      expect(String(err)).toContain('400')
    }
  })

  test("fetching another user's expense by ID returns 404", async ({ twoActors }) => {
    const { apiA, apiB } = twoActors

    const hhA = await apiA.createHousehold('Alice Exclusive')
    const expA = await apiA.createExpense({
      household: hhA.id,
      description: 'Private Expense',
      amount: 500,
      expense_date: TODAY,
    })

    // User B tries to GET the expense by ID — scoped queryset means it doesn't exist for them
    const status = await apiB.getExpenseStatus(expA.id)
    expect(status).toBe(404)
  })
})
