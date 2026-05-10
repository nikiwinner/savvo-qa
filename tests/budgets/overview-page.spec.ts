/**
 * Budgets — Overview page (Phase 06, Story 6.5)
 *
 * Additional flows beyond CRUD:
 * 1. Month selector updates URL and label.
 * 2. Copy previous month creates budgets in current month.
 * 3. Unbudgeted spending list shows categories with spend but no budget.
 * 4. Currency symbol matches user preference.
 */
import { test, expect } from '../../fixtures/index'

const NOW = new Date()
const YEAR = NOW.getFullYear()
const MONTH = NOW.getMonth() + 1
const MONTH_DATE = `${YEAR}-${String(MONTH).padStart(2, '0')}-01`

// Compute previous month (handles January → December roll)
const PREV_MONTH = MONTH === 1 ? 12 : MONTH - 1
const PREV_YEAR = MONTH === 1 ? YEAR - 1 : YEAR
const PREV_MONTH_DATE = `${PREV_YEAR}-${String(PREV_MONTH).padStart(2, '0')}-01`

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

test.describe('Budget overview page', () => {
  test('month selector navigates between months', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Month Nav Home')

    await page.goto(`/dashboard/budgets?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    // Current month label should be visible
    const currentLabel = `${MONTH_NAMES[MONTH - 1]} ${YEAR}`
    await expect(page.locator('.month-label')).toContainText(currentLabel)

    // Click next-month chevron
    await page.click('button[title="Next month"]')
    await page.waitForLoadState('networkidle')

    // URL should contain next month params
    const nextMonth = MONTH === 12 ? 1 : MONTH + 1
    const nextYear = MONTH === 12 ? YEAR + 1 : YEAR
    await expect(page).toHaveURL(new RegExp(`month=${nextMonth}`))

    // Label should update
    const nextLabel = `${MONTH_NAMES[nextMonth - 1]} ${nextYear}`
    await expect(page.locator('.month-label')).toContainText(nextLabel)
  })

  test('copy previous month creates budgets in current month', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Copy Prev Home')
    const categories = await api.listCategories()
    const cat = categories[0]

    // Create a budget in the previous month
    await api.createBudget({
      household: hh.id,
      category: cat.id,
      amount: '300.00',
      year: PREV_YEAR,
      month: PREV_MONTH,
    })

    // Navigate to current month
    await page.goto(`/dashboard/budgets?household=${hh.id}&year=${YEAR}&month=${MONTH}`)
    await page.waitForLoadState('networkidle')

    // Current month should be empty
    await expect(page.locator('.empty-state')).toBeVisible()

    // Click "Copy previous month"
    await page.click('button:has-text("Copy previous month")')
    await page.waitForLoadState('networkidle')

    // A success feedback message should appear
    await expect(page.locator('.feedback-success')).toBeVisible()

    // Budget card should now exist for the current month
    await expect(page.locator('.budget-card')).toHaveCount(1)
  })

  test('unbudgeted spending list shows categories with spend but no budget', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Unbudgeted Home')
    const categories = await api.listCategories()

    // Need at least 2 categories: one with a budget, one without
    const budgetedCat = categories[0]
    const unbudgetedCat = categories[1]

    // Budget only the first category
    await api.createBudget({
      household: hh.id,
      category: budgetedCat.id,
      amount: '500.00',
      year: YEAR,
      month: MONTH,
    })

    // Create expense in the unbudgeted category
    await api.createExpense({
      household: hh.id,
      description: 'Unbudgeted spend',
      amount: 42.00,
      category: unbudgetedCat.id,
      type: 'expense',
      expense_date: MONTH_DATE,
    })

    await page.goto(`/dashboard/budgets?household=${hh.id}&year=${YEAR}&month=${MONTH}`)
    await page.waitForLoadState('networkidle')

    // Unbudgeted section should show the category
    const unbudgetedSection = page.locator('.unbudgeted-section')
    await expect(unbudgetedSection).toBeVisible()
    await expect(unbudgetedSection).toContainText(unbudgetedCat.name)
    await expect(unbudgetedSection).toContainText('42.00')
  })

  test('currency symbol matches household primary currency', async ({ page, loggedInPage }) => {
    // Phase 10 (Story 10.7): the budget card now renders the household's
    // primary_currency, NOT the viewer's User.currency. We set the household
    // primary to GBP via PATCH and assert the card shows £.
    const { api } = loggedInPage
    const hh = await api.createHousehold('Currency Symbol Home')
    const categories = await api.listCategories()
    const cat = categories[0]

    await api.setHouseholdPrimaryCurrency(hh.id, 'GBP')

    await api.createBudget({
      household: hh.id,
      category: cat.id,
      amount: '200.00',
      year: YEAR,
      month: MONTH,
    })

    await page.goto(`/dashboard/budgets?household=${hh.id}&year=${YEAR}&month=${MONTH}`)
    await page.waitForLoadState('networkidle')

    const budgetCard = page.locator('.budget-card').first()
    await expect(budgetCard).toContainText('£')
  })
})
