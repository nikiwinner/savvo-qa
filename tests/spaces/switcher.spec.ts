/**
 * Spaces — Active Space Context (Phase 01, Story 1.10)
 *
 * Verifies URL-based space context: expense filtering, dashboard stats
 * scoping, and space management page visibility.
 *
 * The top-bar space switcher was removed in Phase 3. Space context
 * is now driven entirely by the ?space=<id> URL query param.
 */
import { test, expect } from '../../fixtures/index'
import { ExpensesPage } from '../../pages/ExpensesPage'
import { DashboardPage } from '../../pages/DashboardPage'

const TODAY = new Date().toISOString().split('T')[0]

test.describe('Active space context', () => {
  test('active space is reflected in the URL query param', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const h1 = await api.createSpace('Param House One')
    await api.createSpace('Param House Two')

    await page.goto(`/dashboard/expenses?space=${h1.id}`)
    await page.waitForLoadState('networkidle')

    expect(page.url()).toContain(`space=${h1.id}`)
  })

  test('switching space via URL updates the expense list', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const h1 = await api.createSpace('Switch House A')
    const h2 = await api.createSpace('Switch House B')

    await api.createExpense({ space: h1.id, description: 'House A Expense', amount: 100, expense_date: TODAY })
    await api.createExpense({ space: h2.id, description: 'House B Expense', amount: 200, expense_date: TODAY })

    // Navigate to h1
    await page.goto(`/dashboard/expenses?space=${h1.id}`)
    await page.waitForLoadState('networkidle')

    await expect(page.locator('tbody tr', { hasText: 'House A Expense' })).toBeVisible()
    await expect(page.locator('tbody tr', { hasText: 'House B Expense' })).not.toBeVisible()

    // Switch to h2 via URL
    await page.goto(`/dashboard/expenses?space=${h2.id}`)
    await page.waitForLoadState('networkidle')

    await expect(page.locator('tbody tr', { hasText: 'House B Expense' })).toBeVisible()
    await expect(page.locator('tbody tr', { hasText: 'House A Expense' })).not.toBeVisible()
  })

  test('URL space param pre-selects the space in the create form', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    await api.createSpace('Preselect House A')
    const h2 = await api.createSpace('Preselect House B')

    const expenses = new ExpensesPage(page)
    await page.goto(`/dashboard/expenses?space=${h2.id}`)
    await page.waitForLoadState('networkidle')

    await expenses.openCreateForm()

    const spaceSelect = page.locator('.form-paper #space_id')
    await expect(spaceSelect).toHaveValue(String(h2.id))
  })

  test('dashboard stats reflect the active space', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const h1 = await api.createSpace('Stats House A')
    const h2 = await api.createSpace('Stats House B')

    await api.createExpense({ space: h1.id, description: 'H1 Expense', amount: 500, expense_date: TODAY })
    await api.createExpense({ space: h2.id, description: 'H2 Expense', amount: 999, expense_date: TODAY })

    const dashboard = new DashboardPage(page)

    // Navigate to dashboard with h1 active
    await page.goto(`/dashboard?space=${h1.id}`)
    await page.waitForLoadState('networkidle')

    // Should show h1's expense amount only
    await expect(dashboard.totalExpenseAmount()).toContainText('500')
    await expect(dashboard.totalExpenseAmount()).not.toContainText('999')
  })

  test('spaces management page shows all spaces regardless of active selection', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const h1 = await api.createSpace('Mgmt House A')
    await api.createSpace('Mgmt House B')

    // Set active to h1 and navigate to spaces page
    await page.goto(`/dashboard/spaces?space=${h1.id}`)
    await page.waitForLoadState('networkidle')

    // Both spaces should be visible
    await expect(page.locator('.space-card', { hasText: 'Mgmt House A' })).toBeVisible()
    await expect(page.locator('.space-card', { hasText: 'Mgmt House B' })).toBeVisible()
  })
})
