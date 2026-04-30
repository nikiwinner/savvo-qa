/**
 * Reconciliation — Minimal UI (Phase 07, Story 7.8)
 *
 * Verifies the /dashboard/reconciliation page renders suggestions correctly,
 * and that confirm/reject actions remove the row and persist across reloads.
 */
import { test, expect } from '../../fixtures/index'

const NOW = new Date()
const TODAY = `${NOW.getFullYear()}-${String(NOW.getMonth() + 1).padStart(2, '0')}-15`

test.describe('Reconciliation UI', () => {
  test('suggestion row appears for a matching pair', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('UI Row Visible')
    const categories = await api.listCategories()
    const cat = categories[0]

    await api.createExpense({
      household: hh.id,
      description: 'Supermarket run',
      amount: 55.00,
      category: cat.id,
      type: 'expense',
      expense_date: TODAY,
    })

    await api.createBankTransaction({
      description: 'SUPERMARKT',
      merchant_display_name: 'SUPERMARKT',
      amount: '55.00',
      type: 'expense',
      transaction_date: TODAY,
      household_id: hh.id,
      category_id: cat.id,
      currency: 'EUR',
    })

    await page.goto(`/dashboard/reconciliation?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    // A suggestion card should be visible
    const cards = page.locator('.suggestion-card')
    await expect(cards.first()).toBeVisible()

    // Both the expense description and bank txn description should appear
    await expect(page.locator('.suggestion-card').first()).toContainText('Supermarket run')
    await expect(page.locator('.suggestion-card').first()).toContainText('SUPERMARKT')

    // A confidence pill should be visible
    const pill = page.locator('.suggestion-card .confidence-pill').first()
    await expect(pill).toBeVisible()
    await expect(pill).toContainText('% match')
  })

  test('confirm button creates a link and removes the row', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('UI Confirm Removes Row')
    const categories = await api.listCategories()
    const cat = categories[0]

    await api.createExpense({
      household: hh.id,
      description: 'Confirm test expense',
      amount: 88.00,
      category: cat.id,
      type: 'expense',
      expense_date: TODAY,
    })

    await api.createBankTransaction({
      description: 'CONFIRM TEST SHOP',
      merchant_display_name: 'CONFIRM TEST SHOP',
      amount: '88.00',
      type: 'expense',
      transaction_date: TODAY,
      household_id: hh.id,
      category_id: cat.id,
      currency: 'EUR',
    })

    await page.goto(`/dashboard/reconciliation?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    // Verify the row is present
    const card = page.locator('.suggestion-card').first()
    await expect(card).toBeVisible()

    // Click Confirm
    await card.locator('.btn-confirm').click()

    // Row should disappear
    await expect(page.locator('.suggestion-card')).toHaveCount(0, { timeout: 5000 })

    // Reload and confirm it's still gone
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.suggestion-card')).toHaveCount(0)
  })

  test('reject button records rejection and removes the row', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('UI Reject Removes Row')
    const categories = await api.listCategories()
    const cat = categories[0]

    await api.createExpense({
      household: hh.id,
      description: 'Reject test expense',
      amount: 33.50,
      category: cat.id,
      type: 'expense',
      expense_date: TODAY,
    })

    await api.createBankTransaction({
      description: 'REJECT TEST SHOP',
      merchant_display_name: 'REJECT TEST SHOP',
      amount: '33.50',
      type: 'expense',
      transaction_date: TODAY,
      household_id: hh.id,
      category_id: cat.id,
      currency: 'EUR',
    })

    await page.goto(`/dashboard/reconciliation?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    const card = page.locator('.suggestion-card').first()
    await expect(card).toBeVisible()

    // Click Reject
    await card.locator('.btn-reject').click()

    // Row should disappear
    await expect(page.locator('.suggestion-card')).toHaveCount(0, { timeout: 5000 })

    // Reload and confirm it's still gone
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.suggestion-card')).toHaveCount(0)
  })

  test('empty state renders when no suggestions', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('UI Empty State')

    // No expenses, no bank transactions — nothing to suggest
    await page.goto(`/dashboard/reconciliation?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    await expect(
      page.locator('text=All caught up — nothing to reconcile right now.'),
    ).toBeVisible()
  })
})
