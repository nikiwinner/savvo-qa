/**
 * Dashboard — Budget widget (Phase 06, Story 6.6)
 *
 * Verifies the budget health widget on the main dashboard:
 * 1. CTA shown when no budgets exist.
 * 2. Aggregate totals shown when budgets exist.
 * 3. Top overpaced categories listed in descending pace_ratio order.
 * 4. "View all" link points to the budgets page with active household.
 */
import { test, expect } from '../../fixtures/index'

const NOW = new Date()
const YEAR = NOW.getFullYear()
const MONTH = NOW.getMonth() + 1
const MONTH_DATE = `${YEAR}-${String(MONTH).padStart(2, '0')}-01`

test.describe('Dashboard budget widget', () => {
  test('widget shows CTA when no budgets exist', async ({ page, loggedInPage }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // The budget-cta-card should be visible with the "Set monthly limits" CTA
    const ctaCard = page.locator('.budget-cta-card')
    await expect(ctaCard).toBeVisible()
    await expect(ctaCard).toContainText('Set monthly limits')
  })

  test('widget shows aggregate totals when budgets exist', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Widget Totals Home')
    const categories = await api.listCategories()

    // Create two budgets
    await api.createBudget({
      household: hh.id,
      category: categories[0].id,
      amount: '300.00',
      year: YEAR,
      month: MONTH,
    })
    await api.createBudget({
      household: hh.id,
      category: categories[1].id,
      amount: '200.00',
      year: YEAR,
      month: MONTH,
    })

    await page.goto(`/dashboard?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    // The budget widget (not CTA) should be visible
    const widget = page.locator('.budget-widget')
    await expect(widget).toBeVisible()

    // Should show total budgeted (300 + 200 = 500)
    const totals = page.locator('.budget-totals')
    await expect(totals).toBeVisible()
    await expect(totals).toContainText('500.00')
  })

  test('widget lists top overpaced categories', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Widget Overpaced Home')
    const categories = await api.listCategories()

    // Create three over-pace budgets with distinct ratios
    // Budget=1, spend=X ensures red status; higher spend = higher ratio
    for (let i = 0; i < 3; i++) {
      const cat = categories[i]
      const spendAmount = (i + 1) * 100 // 100, 200, 300

      await api.createBudget({
        household: hh.id,
        category: cat.id,
        amount: '1.00',
        year: YEAR,
        month: MONTH,
      })

      await api.createExpense({
        household: hh.id,
        description: `Over-pace expense ${i}`,
        amount: spendAmount,
        category: cat.id,
        type: 'expense',
        expense_date: MONTH_DATE,
      })
    }

    await page.goto(`/dashboard?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    // Overpaced list should be visible
    const overpacedList = page.locator('.overpaced-list')
    await expect(overpacedList).toBeVisible()

    // Should show up to 3 rows
    const rows = overpacedList.locator('.overpaced-row')
    await expect(rows).toHaveCount(3)

    // Rows should be sorted by pace_ratio descending (highest first)
    const ratioTexts = await rows.locator('.overpaced-ratio').allTextContents()
    const ratios = ratioTexts.map((t) => parseFloat(t))
    for (let i = 0; i < ratios.length - 1; i++) {
      expect(ratios[i]).toBeGreaterThanOrEqual(ratios[i + 1])
    }
  })

  test('view all link points to budgets page with active household', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Widget ViewAll Home')
    const categories = await api.listCategories()

    // Create a budget so the widget shows (not the CTA)
    await api.createBudget({
      household: hh.id,
      category: categories[0].id,
      amount: '100.00',
      year: YEAR,
      month: MONTH,
    })

    await page.goto(`/dashboard?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    // Find the "View all" link in the budget section
    const viewAllLink = page.locator('.budget-section .view-all-link')
    await expect(viewAllLink).toBeVisible()

    const href = await viewAllLink.getAttribute('href')
    expect(href).toContain('/dashboard/budgets')
    expect(href).toContain(`household=${hh.id}`)
  })
})
