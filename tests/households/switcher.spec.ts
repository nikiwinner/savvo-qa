/**
 * Households — Active Household Context (Phase 01, Story 1.10)
 *
 * Verifies URL-based household context: expense filtering, dashboard stats
 * scoping, and household management page visibility.
 *
 * The top-bar household switcher was removed in Phase 3. Household context
 * is now driven entirely by the ?household=<id> URL query param.
 */
import { test, expect } from '../../fixtures/index'
import { ExpensesPage } from '../../pages/ExpensesPage'
import { DashboardPage } from '../../pages/DashboardPage'

const TODAY = new Date().toISOString().split('T')[0]

test.describe('Active household context', () => {
  test('active household is reflected in the URL query param', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const h1 = await api.createHousehold('Param House One')
    await api.createHousehold('Param House Two')

    await page.goto(`/dashboard/expenses?household=${h1.id}`)
    await page.waitForLoadState('networkidle')

    expect(page.url()).toContain(`household=${h1.id}`)
  })

  test('switching household via URL updates the expense list', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const h1 = await api.createHousehold('Switch House A')
    const h2 = await api.createHousehold('Switch House B')

    await api.createExpense({ household: h1.id, description: 'House A Expense', amount: 100, expense_date: TODAY })
    await api.createExpense({ household: h2.id, description: 'House B Expense', amount: 200, expense_date: TODAY })

    // Navigate to h1
    await page.goto(`/dashboard/expenses?household=${h1.id}`)
    await page.waitForLoadState('networkidle')

    await expect(page.locator('tbody tr', { hasText: 'House A Expense' })).toBeVisible()
    await expect(page.locator('tbody tr', { hasText: 'House B Expense' })).not.toBeVisible()

    // Switch to h2 via URL
    await page.goto(`/dashboard/expenses?household=${h2.id}`)
    await page.waitForLoadState('networkidle')

    await expect(page.locator('tbody tr', { hasText: 'House B Expense' })).toBeVisible()
    await expect(page.locator('tbody tr', { hasText: 'House A Expense' })).not.toBeVisible()
  })

  test('URL household param pre-selects the household in the create form', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    await api.createHousehold('Preselect House A')
    const h2 = await api.createHousehold('Preselect House B')

    const expenses = new ExpensesPage(page)
    await page.goto(`/dashboard/expenses?household=${h2.id}`)
    await page.waitForLoadState('networkidle')

    await expenses.openCreateForm()

    const householdSelect = page.locator('.form-paper #household_id')
    await expect(householdSelect).toHaveValue(String(h2.id))
  })

  test('dashboard stats reflect the active household', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const h1 = await api.createHousehold('Stats House A')
    const h2 = await api.createHousehold('Stats House B')

    await api.createExpense({ household: h1.id, description: 'H1 Expense', amount: 500, expense_date: TODAY })
    await api.createExpense({ household: h2.id, description: 'H2 Expense', amount: 999, expense_date: TODAY })

    const dashboard = new DashboardPage(page)

    // Navigate to dashboard with h1 active
    await page.goto(`/dashboard?household=${h1.id}`)
    await page.waitForLoadState('networkidle')

    // Should show h1's expense amount only
    await expect(dashboard.totalExpenseAmount()).toContainText('500')
    await expect(dashboard.totalExpenseAmount()).not.toContainText('999')
  })

  test('households management page shows all households regardless of active selection', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const h1 = await api.createHousehold('Mgmt House A')
    await api.createHousehold('Mgmt House B')

    // Set active to h1 and navigate to households page
    await page.goto(`/dashboard/households?household=${h1.id}`)
    await page.waitForLoadState('networkidle')

    // Both households should be visible
    await expect(page.locator('.household-card', { hasText: 'Mgmt House A' })).toBeVisible()
    await expect(page.locator('.household-card', { hasText: 'Mgmt House B' })).toBeVisible()
  })
})
