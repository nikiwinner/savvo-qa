/**
 * Reconciliation — Dashboard suggestion-count banner
 * (Phase 08, Story 8.3)
 *
 * Verifies:
 *  - When pending suggestions exist for the active household, the dashboard
 *    renders a banner whose copy reads exactly the singular form for count = 1.
 *  - When no matching pairs exist, the banner is absent from the DOM.
 *  - Clicking the banner navigates to /dashboard/reconciliation with the
 *    active household preserved in the query string.
 */
import { test, expect } from '../../fixtures/index'

test.describe('Dashboard suggestion-count banner', () => {
  test('banner shows when pending suggestions exist', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Banner Singular')
    const categories = await api.listCategories()
    const cat = categories[0]

    // Seed exactly one matching expense + bank-txn pair (don't link them).
    // Same amount + currency + date so the suggestion algorithm matches.
    await api.createExpense({
      household: hh.id,
      description: 'Banner singular expense BANNER-A',
      amount: 17.77,
      category: cat.id,
      type: 'expense',
      expense_date: '2026-05-01',
    })
    await api.createBankTransaction({
      description: 'BANNER-A BANK SHOP',
      merchant_display_name: 'BANNER-A BANK SHOP',
      amount: '17.77',
      type: 'expense',
      transaction_date: '2026-05-01',
      household_id: hh.id,
      category_id: cat.id,
      currency: 'EUR',
    })

    // Pre-flight: confirm the API actually surfaces exactly 1 suggestion.
    const suggestions = await api.listSuggestions(hh.id)
    expect(suggestions.count).toBe(1)

    await page.goto(`/dashboard?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    const banner = page.locator('a.suggestion-banner')
    await expect(banner).toBeVisible({ timeout: 5000 })

    const text = banner.locator('.suggestion-banner-text')
    await expect(text).toHaveText('You have 1 suggested match to review.')
  })

  test('banner is hidden when count is zero', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Banner Hidden')

    // No expenses, no bank txns — suggestion count should be 0.
    const suggestions = await api.listSuggestions(hh.id)
    expect(suggestions.count).toBe(0)

    await page.goto(`/dashboard?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    // Wait for a known dashboard element so we know the page rendered.
    await expect(page.locator('h1', { hasText: 'Dashboard' })).toBeVisible()

    const banner = page.locator('a.suggestion-banner')
    await expect(banner).toHaveCount(0)
  })

  test('banner navigates to reconciliation page with household preserved', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Banner Navigates')
    const categories = await api.listCategories()
    const cat = categories[0]

    await api.createExpense({
      household: hh.id,
      description: 'Banner nav expense BANNER-C',
      amount: 9.99,
      category: cat.id,
      type: 'expense',
      expense_date: '2026-05-02',
    })
    await api.createBankTransaction({
      description: 'BANNER-C BANK SHOP',
      merchant_display_name: 'BANNER-C BANK SHOP',
      amount: '9.99',
      type: 'expense',
      transaction_date: '2026-05-02',
      household_id: hh.id,
      category_id: cat.id,
      currency: 'EUR',
    })

    const suggestions = await api.listSuggestions(hh.id)
    expect(suggestions.count).toBe(1)

    await page.goto(`/dashboard?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    const banner = page.locator('a.suggestion-banner')
    await expect(banner).toBeVisible({ timeout: 5000 })
    await banner.click()

    await page.waitForURL(`**/dashboard/reconciliation?household=${hh.id}`, { timeout: 5000 })
    expect(page.url()).toContain(`/dashboard/reconciliation?household=${hh.id}`)
  })
})
