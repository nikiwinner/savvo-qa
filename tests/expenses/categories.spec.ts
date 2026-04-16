/**
 * Expenses — Categories (Phase 01, Story 1.9)
 *
 * Verifies category dropdown population from API, inline category creation,
 * category display in the table, global category visibility, and duplicate rejection.
 */
import { test, expect } from '../../fixtures/index'
import { ExpensesPage } from '../../pages/ExpensesPage'

const TODAY = new Date().toISOString().split('T')[0]

test.describe('Expense categories', () => {
  test('category dropdown is populated from the API (not hardcoded)', async ({
    page,
    loggedInPage,
  }) => {
    // Create a household — this seeds default categories
    const { api } = loggedInPage
    await api.createHousehold('Category Dropdown Home')

    const expenses = new ExpensesPage(page)
    await expenses.goto()
    await expenses.openCreateForm()

    // The category select should contain at least "Groceries" (a seeded default)
    const categorySelect = page.locator('.form-card #category')
    await expect(categorySelect).toBeVisible()
    // Wait for categories to load (they load via onMount)
    await expect(categorySelect.locator('option', { hasText: 'Groceries' })).toBeAttached({ timeout: 5000 })
  })

  test('can create a new category inline', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    await api.createHousehold('Inline Category Home')

    const expenses = new ExpensesPage(page)
    await expenses.goto()
    await expenses.openCreateForm()

    // Click "+ New Category" button
    await page.locator('.form-card .btn-link', { hasText: '+ New Category' }).click()

    // An inline input should appear
    const newCatInput = page.locator('.new-category-input')
    await expect(newCatInput).toBeVisible()
    await newCatInput.fill('Vacation Fund')
    await page.locator('.new-category-row button', { hasText: 'Add' }).click()

    // After adding, the dropdown should reappear with the new category
    const categorySelect = page.locator('.form-card #category')
    await expect(categorySelect).toBeVisible()
    await expect(categorySelect.locator('option', { hasText: 'Vacation Fund' })).toBeAttached({ timeout: 5000 })
  })

  test('created expense shows the selected category name', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    await api.createHousehold('Category Display Home')

    const expenses = new ExpensesPage(page)
    await expenses.goto()

    await expenses.createExpense({
      householdLabel: 'Category Display Home',
      category: 'Groceries',
      description: 'Weekly Shop',
      amount: '80',
      date: TODAY,
    })

    // The table row should show the category name (not an ID)
    const row = page.locator('tbody tr', { hasText: 'Weekly Shop' })
    await expect(row).toBeVisible()
    await expect(row.locator('.category-badge')).toContainText('Groceries')
  })

  test('categories are global — user B sees user A\'s created category', async ({
    twoActors,
    page,
    context,
  }) => {
    const { apiA, apiB } = twoActors

    // User A creates a custom category
    await apiA.createCategory('Pet Care')

    // Switch browser to user B
    await apiB.createHousehold('Bob Category Home')
    const cookiesB = await apiB.cookies()
    await context.clearCookies()
    await context.addCookies(cookiesB)

    const expenses = new ExpensesPage(page)
    await expenses.goto()
    await expenses.openCreateForm()

    // Wait for categories to load
    const categorySelect = page.locator('.form-card #category')
    await expect(categorySelect.locator('option', { hasText: 'Pet Care' })).toBeAttached({ timeout: 5000 })
  })

  test('duplicate category name returns 400', async ({ loggedInPage }) => {
    const { api } = loggedInPage

    // Create a category, then try to create the same name again
    await api.createCategory('Unique Cat ' + Date.now())
    const catName = 'DupCheck-' + Date.now()
    await api.createCategory(catName)

    // Second creation of same name should throw with 400
    try {
      await api.createCategory(catName)
      throw new Error('Expected createCategory to throw')
    } catch (err: unknown) {
      expect(String(err)).toContain('400')
    }
  })
})
