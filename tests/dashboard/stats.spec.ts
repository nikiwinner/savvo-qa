/**
 * Dashboard — Stats (Phase 00/01, reworked at user review 2026-06-02)
 *
 * After the period-control rework the dashboard's money display is the per-space
 * summary card (covered by space-summary.spec.ts) and the only `.stat-value`
 * cards left are Total Spaces + a period-scoped Transactions count. The all-time
 * money totals and the "This Month" cards were removed.
 */
import { test, expect } from '../../fixtures/index'
import { DashboardPage } from '../../pages/DashboardPage'
import { ApiHelper, uniqueUser } from '../../helpers/api'

const TODAY = new Date().toISOString().split('T')[0]

test.describe('Dashboard stats', () => {
  test('shows 0 for the stat cards when user has no data', async ({ page, loggedInPage: _ }) => {
    const dashboard = new DashboardPage(page)
    await dashboard.goto()

    await expect(dashboard.totalSpaces()).toHaveText('0')
    await expect(dashboard.totalTransactions()).toHaveText('0')
  })

  test('total spaces count reflects created spaces', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage

    await api.createSpace('House 1')
    await api.createSpace('House 2')

    const dashboard = new DashboardPage(page)
    await dashboard.goto()

    await expect(dashboard.totalSpaces()).toHaveText('2')
  })

  test('transactions count reflects this-period transactions', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createSpace('Stats Home')

    // Default window is the current month, so date these in it.
    await api.createExpense({ space: hh.id, description: 'Exp 1', amount: 10, expense_date: TODAY })
    await api.createExpense({ space: hh.id, description: 'Exp 2', amount: 20, expense_date: TODAY })
    await api.createExpense({ space: hh.id, description: 'Exp 3', amount: 30, expense_date: TODAY })

    const dashboard = new DashboardPage(page)
    await dashboard.goto()

    await expect(dashboard.totalTransactions()).toHaveText('3')
  })

  test('stats only reflect data from the current user (scoping)', async ({
    page,
    context,
    loggedInPage,
    playwright,
  }) => {
    // User A creates some data
    const { api: apiA } = loggedInPage
    const hhA = await apiA.createSpace('A Home')
    await apiA.createExpense({ space: hhA.id, description: 'A Expense', amount: 999, expense_date: TODAY })

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
    await expect(dashboard.totalSpaces()).toHaveText('0')
    await expect(dashboard.totalTransactions()).toHaveText('0')

    await ctxB.dispose()
  })

  test('dashboard has quick action links to spaces and transactions', async ({
    page,
    loggedInPage: _,
  }) => {
    const dashboard = new DashboardPage(page)
    await dashboard.goto()

    await expect(dashboard.spacesLink.first()).toBeVisible()
    await expect(dashboard.expensesLink.first()).toBeVisible()
  })
})
