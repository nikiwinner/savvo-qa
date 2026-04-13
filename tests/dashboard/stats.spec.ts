/**
 * Dashboard — Stats (Phase 00 + Phase 01, Story 1.7)
 *
 * Verifies that the dashboard stat cards display real data loaded via djangoFetch.
 * Before Story 1.7, expenses were hardcoded to []; stats showed zeroes regardless.
 */
import { test, expect } from '../../fixtures/index'
import { DashboardPage } from '../../pages/DashboardPage'
import { ApiHelper, uniqueUser } from '../../helpers/api'

const TODAY = new Date().toISOString().split('T')[0]

test.describe('Dashboard stats', () => {
  test('shows 0 for all stats when user has no data', async ({ page, loggedInPage: _ }) => {
    const dashboard = new DashboardPage(page)
    await dashboard.goto()

    await expect(dashboard.totalHouseholds()).toHaveText('0')
    await expect(dashboard.totalExpenses()).toHaveText('0')
    await expect(dashboard.totalAmount()).toContainText('0')
    await expect(dashboard.monthlyAmount()).toContainText('0')
  })

  test('total households count reflects created households', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage

    await api.createHousehold('House 1')
    await api.createHousehold('House 2')

    const dashboard = new DashboardPage(page)
    await dashboard.goto()

    await expect(dashboard.totalHouseholds()).toHaveText('2')
  })

  test('total expenses count reflects created expenses', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Stats Home')

    await api.createExpense({ household: hh.id, description: 'Exp 1', amount: 10, category: 'Other', expense_date: TODAY })
    await api.createExpense({ household: hh.id, description: 'Exp 2', amount: 20, category: 'Other', expense_date: TODAY })
    await api.createExpense({ household: hh.id, description: 'Exp 3', amount: 30, category: 'Other', expense_date: TODAY })

    const dashboard = new DashboardPage(page)
    await dashboard.goto()

    await expect(dashboard.totalExpenses()).toHaveText('3')
  })

  test('total amount is the sum of all expense amounts', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Amount Stats Home')

    await api.createExpense({ household: hh.id, description: 'A', amount: 100, category: 'Rent', expense_date: TODAY })
    await api.createExpense({ household: hh.id, description: 'B', amount: 55.50, category: 'Groceries', expense_date: TODAY })

    const dashboard = new DashboardPage(page)
    await dashboard.goto()

    // total = 155.50
    await expect(dashboard.totalAmount()).toContainText('155.50')
  })

  test('monthly amount counts only expenses from the current month', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Monthly Stats Home')

    const lastMonth = new Date()
    lastMonth.setMonth(lastMonth.getMonth() - 1)
    const lastMonthStr = lastMonth.toISOString().split('T')[0]

    // One expense this month, one last month
    await api.createExpense({
      household: hh.id,
      description: 'This Month',
      amount: 300,
      category: 'Rent',
      expense_date: TODAY,
    })
    await api.createExpense({
      household: hh.id,
      description: 'Last Month',
      amount: 500,
      category: 'Rent',
      expense_date: lastMonthStr,
    })

    const dashboard = new DashboardPage(page)
    await dashboard.goto()

    // Monthly amount should be 300, not 800
    await expect(dashboard.monthlyAmount()).toContainText('300')
    // But total should include both
    await expect(dashboard.totalAmount()).toContainText('800')
  })

  test('stats only reflect data from the current user (scoping)', async ({
    page,
    context,
    loggedInPage,
    playwright,
  }) => {
    // User A creates some data
    const { api: apiA } = loggedInPage
    const hhA = await apiA.createHousehold('A Home')
    await apiA.createExpense({ household: hhA.id, description: 'A Expense', amount: 999, category: 'Other', expense_date: TODAY })

    // Switch to user B (no data)
    const ctxB = await playwright.request.newContext()
    const apiB = new ApiHelper(ctxB)
    const userB = uniqueUser('bob-stats')
    await apiB.signup(userB)
    await apiB.login(userB.email, userB.password)

    const cookiesB = await apiB.cookies()
    await context.clearCookies()
    await context.addCookies(cookiesB)

    const dashboard = new DashboardPage(page)
    await dashboard.goto()

    // User B sees 0 everywhere — not user A's data
    await expect(dashboard.totalHouseholds()).toHaveText('0')
    await expect(dashboard.totalExpenses()).toHaveText('0')

    await ctxB.dispose()
  })

  test('dashboard has quick action links to households and expenses', async ({
    page,
    loggedInPage: _,
  }) => {
    const dashboard = new DashboardPage(page)
    await dashboard.goto()

    await expect(dashboard.householdsLink.first()).toBeVisible()
    await expect(dashboard.expensesLink.first()).toBeVisible()
  })
})
