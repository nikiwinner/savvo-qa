/**
 * Households — Active Household Switcher (Phase 01, Story 1.10)
 *
 * Verifies the household switcher in the top bar: dropdown vs static label,
 * URL-driven state, expense filtering, dashboard stats scoping.
 */
import { test, expect } from '../../fixtures/index'
import { ExpensesPage } from '../../pages/ExpensesPage'
import { DashboardPage } from '../../pages/DashboardPage'

const TODAY = new Date().toISOString().split('T')[0]

test.describe('Active household switcher', () => {
  test('household switcher shows static label when user has only one household', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    await api.createHousehold('Solo House')

    const dashboard = new DashboardPage(page)
    await dashboard.goto()

    // Static household name (not a select dropdown)
    await expect(page.locator('.household-name', { hasText: 'Solo House' })).toBeVisible()
    await expect(page.locator('#household-switcher')).not.toBeVisible()
  })

  test('household switcher is visible in the top bar when user has multiple households', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    await api.createHousehold('House One')
    await api.createHousehold('House Two')

    const dashboard = new DashboardPage(page)
    await dashboard.goto()

    // Switcher dropdown should appear
    const switcher = page.locator('#household-switcher')
    await expect(switcher).toBeVisible()
    await expect(switcher.locator('option', { hasText: 'House One' })).toBeAttached()
    await expect(switcher.locator('option', { hasText: 'House Two' })).toBeAttached()
  })

  test('active household is reflected in the URL query param', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const h1 = await api.createHousehold('Param House One')
    await api.createHousehold('Param House Two')

    // Navigate to expenses (will redirect to first household)
    const expenses = new ExpensesPage(page)
    await expenses.goto()
    await page.waitForLoadState('networkidle')

    // URL should contain ?household=<id>
    expect(page.url()).toContain('household=')
  })

  test('active household falls back to first if URL param is absent or invalid', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const h1 = await api.createHousehold('Fallback House')

    // Navigate without ?household param
    await page.goto('/dashboard/expenses')
    await page.waitForLoadState('networkidle')

    // Should redirect to include the first household's ID
    expect(page.url()).toContain(`household=${h1.id}`)
  })

  test('switching household updates the expense list', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const h1 = await api.createHousehold('Switch House A')
    const h2 = await api.createHousehold('Switch House B')

    // Create expenses in each household
    await api.createExpense({ household: h1.id, description: 'House A Expense', amount: 100, expense_date: TODAY })
    await api.createExpense({ household: h2.id, description: 'House B Expense', amount: 200, expense_date: TODAY })

    const expenses = new ExpensesPage(page)
    // Navigate to h1
    await page.goto(`/dashboard/expenses?household=${h1.id}`)
    await page.waitForLoadState('networkidle')

    await expect(page.locator('tbody tr', { hasText: 'House A Expense' })).toBeVisible()
    await expect(page.locator('tbody tr', { hasText: 'House B Expense' })).not.toBeVisible()

    // Switch to h2 via the switcher
    await page.locator('#household-switcher').selectOption(String(h2.id))
    await page.waitForLoadState('networkidle')

    await expect(page.locator('tbody tr', { hasText: 'House B Expense' })).toBeVisible()
    await expect(page.locator('tbody tr', { hasText: 'House A Expense' })).not.toBeVisible()
  })

  test('switching household pre-selects the household in the create form', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const h1 = await api.createHousehold('Preselect House A')
    const h2 = await api.createHousehold('Preselect House B')

    const expenses = new ExpensesPage(page)
    // Navigate with h2 active
    await page.goto(`/dashboard/expenses?household=${h2.id}`)
    await page.waitForLoadState('networkidle')

    await expenses.openCreateForm()

    // The household select in the create form should default to h2
    const householdSelect = page.locator('.form-card #household_id')
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
    const h2 = await api.createHousehold('Mgmt House B')

    // Set active to h1 and navigate to households page
    await page.goto(`/dashboard/households?household=${h1.id}`)
    await page.waitForLoadState('networkidle')

    // Both households should be visible
    await expect(page.locator('.household-card', { hasText: 'Mgmt House A' })).toBeVisible()
    await expect(page.locator('.household-card', { hasText: 'Mgmt House B' })).toBeVisible()
  })
})
