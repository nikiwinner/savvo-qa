/**
 * Budgets — CRUD (Phase 06, Stories 6.1 + 6.2)
 *
 * Create, edit, delete budgets via the browser UI.
 * Also verifies household scoping.
 */
import { test, expect } from '../../fixtures/index'

const NOW = new Date()
const YEAR = NOW.getFullYear()
const MONTH = NOW.getMonth() + 1

test.describe('Budgets CRUD', () => {
  test('empty state shows when no budgets exist', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Budget Empty Home')

    await page.goto(`/dashboard/budgets?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    const emptyState = page.locator('.empty-state')
    await expect(emptyState).toBeVisible()
    await expect(emptyState).toContainText('No budgets for')
  })

  test('user can create a budget and see it appear', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Budget Create Home')

    await page.goto(`/dashboard/budgets?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    // Open add form
    await page.click('button:has-text("Add budget")')
    await expect(page.locator('.budget-form')).toBeVisible()

    // Select a category
    const categorySelect = page.locator('#budget-category')
    await categorySelect.selectOption({ index: 1 })

    // Fill amount
    await page.fill('#budget-amount', '200.00')

    // Click the form's submit button
    await page.locator('.budget-form .btn-primary').click()

    // The budget card should appear in the list
    await expect(page.locator('.budget-list .budget-card').first()).toBeVisible()
  })

  test('created budget is scoped to the active household', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hhA = await api.createHousehold('Budget Scope A')
    const hhB = await api.createHousehold('Budget Scope B')

    // Get a category to use
    const categories = await api.listCategories()
    const cat = categories[0]

    // Create a budget in household A via API
    await api.createBudget({
      household: hhA.id,
      category: cat.id,
      amount: '150.00',
      year: YEAR,
      month: MONTH,
    })

    // View household B — should show empty state
    await page.goto(`/dashboard/budgets?household=${hhB.id}`)
    await page.waitForLoadState('networkidle')

    await expect(page.locator('.empty-state')).toBeVisible()
    await expect(page.locator('.budget-card')).toHaveCount(0)
  })

  test('non-member cannot access another household\'s budgets via URL', async ({ twoActors, page, context }) => {
    const { apiA, apiB } = twoActors

    // User A creates a household with a budget
    const hhA = await apiA.createHousehold('A Private Budget HH')
    const catsA = await apiA.listCategories()
    await apiA.createBudget({
      household: hhA.id,
      category: catsA[0].id,
      amount: '100.00',
      year: YEAR,
      month: MONTH,
    })

    // Switch browser session to user B
    const cookiesB = await apiB.cookies()
    await context.clearCookies()
    await context.addCookies(cookiesB)

    // User B tries to view household A's budget page
    await page.goto(`/dashboard/budgets?household=${hhA.id}`)
    await page.waitForLoadState('networkidle')

    // Should see empty / no budget cards belonging to household A
    await expect(page.locator('.budget-card')).toHaveCount(0)
  })

  test('user can edit a budget amount', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Budget Edit Home')
    const categories = await api.listCategories()
    const cat = categories[0]

    await api.createBudget({
      household: hh.id,
      category: cat.id,
      amount: '100.00',
      year: YEAR,
      month: MONTH,
    })

    await page.goto(`/dashboard/budgets?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    // Click edit button on the first budget card
    const card = page.locator('.budget-card').first()
    await card.locator('.icon-btn').first().click()

    // Edit form should appear — fill new amount
    const editForm = page.locator('.budget-form')
    await expect(editForm).toBeVisible()
    await editForm.locator('#budget-amount').fill('250.00')
    await editForm.locator('.btn-primary').click()

    // Wait for form to close
    await expect(editForm).not.toBeVisible()

    // Reload and check the amount persisted
    await page.reload()
    await page.waitForLoadState('networkidle')

    const updatedCard = page.locator('.budget-card').first()
    await expect(updatedCard).toContainText('250.00')
  })

  test('user can delete a budget', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Budget Delete Home')
    const categories = await api.listCategories()
    const cat = categories[0]

    await api.createBudget({
      household: hh.id,
      category: cat.id,
      amount: '80.00',
      year: YEAR,
      month: MONTH,
    })

    await page.goto(`/dashboard/budgets?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    await expect(page.locator('.budget-card')).toHaveCount(1)

    // Click delete (danger) button on the card
    const card = page.locator('.budget-card').first()
    await card.locator('.icon-btn-danger').click()

    // Confirm dialog
    const dialog = page.locator('[role="dialog"], .confirm-dialog, .modal')
    if (await dialog.isVisible()) {
      await page.click('button:has-text("Delete")')
    }

    // Card should be gone
    await expect(page.locator('.budget-card')).toHaveCount(0)
  })

  test('duplicate budget for same period is rejected', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Budget Dup Home')
    const categories = await api.listCategories()
    const cat = categories[0]

    // Create a budget via API first
    await api.createBudget({
      household: hh.id,
      category: cat.id,
      amount: '50.00',
      year: YEAR,
      month: MONTH,
    })

    await page.goto(`/dashboard/budgets?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    // Open add form and try to create a duplicate
    await page.click('button:has-text("Add budget")')
    await expect(page.locator('.budget-form')).toBeVisible()

    // Select the same category
    await page.locator('#budget-category').selectOption(String(cat.id))
    await page.fill('#budget-amount', '75.00')
    await page.locator('.budget-form .btn-primary').click()

    // A form-error message should be shown
    await expect(page.locator('.form-error')).toBeVisible()
  })
})
