/**
 * Dashboard — Stats (Phase 00 + Phase 01, Stories 1.7 + 1.9)
 *
 * Verifies that the dashboard stat cards display real data loaded via djangoFetch.
 * After Story 1.9, stats are split by income vs expense type.
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
    await expect(dashboard.totalTransactions()).toHaveText('0')
    await expect(dashboard.totalIncome()).toContainText('0')
    await expect(dashboard.totalExpenseAmount()).toContainText('0')
  })

  test('total households count reflects created households', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage

    await api.createHousehold('House 1')
    await api.createHousehold('House 2')

    const dashboard = new DashboardPage(page)
    await dashboard.goto()

    await expect(dashboard.totalHouseholds()).toHaveText('2')
  })

  test('total transactions count reflects created expenses', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Stats Home')

    await api.createExpense({ household: hh.id, description: 'Exp 1', amount: 10, expense_date: TODAY })
    await api.createExpense({ household: hh.id, description: 'Exp 2', amount: 20, expense_date: TODAY })
    await api.createExpense({ household: hh.id, description: 'Exp 3', amount: 30, expense_date: TODAY })

    const dashboard = new DashboardPage(page)
    await dashboard.goto()

    await expect(dashboard.totalTransactions()).toHaveText('3')
  })

  test('total expense amount is the sum of all expense transactions', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Amount Stats Home')

    await api.createExpense({ household: hh.id, description: 'A', amount: 100, expense_date: TODAY })
    await api.createExpense({ household: hh.id, description: 'B', amount: 55.50, expense_date: TODAY })

    const dashboard = new DashboardPage(page)
    await dashboard.goto()

    // total expenses = 155.50
    await expect(dashboard.totalExpenseAmount()).toContainText('155.50')
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
      expense_date: TODAY,
    })
    await api.createExpense({
      household: hh.id,
      description: 'Last Month',
      amount: 500,
      expense_date: lastMonthStr,
    })

    const dashboard = new DashboardPage(page)
    await dashboard.goto()

    // Monthly expenses amount should include only this month's expense
    await expect(dashboard.monthlyExpenseAmount()).toContainText('300')
    // Total expenses includes both
    await expect(dashboard.totalExpenseAmount()).toContainText('800')
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
    await apiA.createExpense({ household: hhA.id, description: 'A Expense', amount: 999, expense_date: TODAY })

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
    await expect(dashboard.totalTransactions()).toHaveText('0')

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
