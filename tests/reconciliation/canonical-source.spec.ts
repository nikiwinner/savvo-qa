/**
 * Reconciliation — Canonical source toggle (Phase 08, Story 8.5/8.6)
 *
 * Verifies the CanonicalSourceToggle wired into each existing-link card on
 * /dashboard/reconciliation:
 *  - Flipping manual → bank changes which side is counted in Budget.spent
 *    (manual=€10, bank=€12 — pair counts once, source determines which one).
 *  - The new value persists across a full page reload (server-truth).
 */
import { test, expect } from '../../fixtures/index'

const SECTION_SELECTOR = 'section[aria-labelledby="existing-links-heading"]'

// Use a fixed past date that is guaranteed to be inside the current month so
// the seeded expense + bank-txn count toward the current-month Budget.spent.
const NOW = new Date()
const YEAR = NOW.getFullYear()
const MONTH = NOW.getMonth() + 1
const MONTH_DATE = `${YEAR}-${String(MONTH).padStart(2, '0')}-05`

test.describe('Canonical source toggle', () => {
  test('toggling canonical_source from manual to bank flips the spent total', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Canonical Toggle Spent')
    const categories = await api.listCategories()
    const cat = categories[0]

    // Budget for the category (current month)
    await api.createBudget({
      household: hh.id,
      category: cat.id,
      amount: '500.00',
      year: YEAR,
      month: MONTH,
    })

    // Manual €10, bank €12 — different amounts so a pair flip is observable.
    // Both pinned to the same date so the canonical-source field is the only
    // thing that determines which side counts.
    const expense = await api.createExpense({
      household: hh.id,
      description: 'Canonical pair manual',
      amount: 10,
      category: cat.id,
      type: 'expense',
      expense_date: MONTH_DATE,
    })
    const bankTxn = await api.createBankTransaction({
      description: 'Canonical pair BANK',
      merchant_display_name: 'Canonical pair BANK',
      amount: '12.00',
      type: 'expense',
      transaction_date: MONTH_DATE,
      household_id: hh.id,
      category_id: cat.id,
      currency: 'EUR',
    })

    // Link the pair (default canonical_source = 'manual').
    const link = await api.createReconciliationLink(expense.id, bankTxn.id)
    expect(link.canonical_source).toBe('manual')

    // Initial budget — spent should equal the manual side (€10).
    const before = await api.listBudgets({ household: hh.id, year: YEAR, month: MONTH })
    const budgetBefore = before.find((b) => b.category === cat.id)
    expect(budgetBefore).toBeDefined()
    expect(parseFloat(budgetBefore!.spent)).toBeCloseTo(10, 2)

    // Visit the reconciliation page and locate the matching link card.
    await page.goto(`/dashboard/reconciliation?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    const section = page.locator(SECTION_SELECTOR)
    await expect(section).toBeVisible({ timeout: 5000 })
    const linkCard = section.locator('.link-card', { hasText: 'Canonical pair manual' })
    await expect(linkCard).toHaveCount(1)

    // Initially the Manual radio is active.
    const manualBtn = linkCard.locator('button[role="radio"]', { hasText: 'Manual' })
    const bankBtn = linkCard.locator('button[role="radio"]', { hasText: 'Bank' })
    await expect(manualBtn).toHaveAttribute('aria-checked', 'true')
    await expect(bankBtn).toHaveAttribute('aria-checked', 'false')

    // Click Bank — toggle should switch optimistically, then settle after
    // invalidateAll re-fetches.
    await bankBtn.click()
    await expect(bankBtn).toHaveAttribute('aria-checked', 'true', { timeout: 5000 })
    await expect(manualBtn).toHaveAttribute('aria-checked', 'false', { timeout: 5000 })
    await page.waitForLoadState('networkidle')

    // Server-truth: re-query the budget API. Spent now reflects the bank side (€12).
    const after = await api.listBudgets({ household: hh.id, year: YEAR, month: MONTH })
    const budgetAfter = after.find((b) => b.category === cat.id)
    expect(budgetAfter).toBeDefined()
    expect(parseFloat(budgetAfter!.spent)).toBeCloseTo(12, 2)

    // UI sanity: visit /dashboard/budgets and read the rendered progress label.
    await page.goto(`/dashboard/budgets?household=${hh.id}&year=${YEAR}&month=${MONTH}`)
    await page.waitForLoadState('networkidle')
    const budgetCard = page.locator('.budget-card', { hasText: cat.name })
    await expect(budgetCard).toBeVisible({ timeout: 5000 })
    // progress-label format: "<symbol><spent> / <symbol><amount>"
    await expect(budgetCard.locator('.progress-label')).toContainText('12.00')
  })

  test('toggling persists across reloads', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const hh = await api.createHousehold('Canonical Toggle Persist')
    const categories = await api.listCategories()
    const cat = categories[0]

    const expense = await api.createExpense({
      household: hh.id,
      description: 'Persist pair manual',
      amount: 10,
      category: cat.id,
      type: 'expense',
      expense_date: MONTH_DATE,
    })
    const bankTxn = await api.createBankTransaction({
      description: 'Persist pair BANK',
      merchant_display_name: 'Persist pair BANK',
      amount: '12.00',
      type: 'expense',
      transaction_date: MONTH_DATE,
      household_id: hh.id,
      category_id: cat.id,
      currency: 'EUR',
    })
    await api.createReconciliationLink(expense.id, bankTxn.id)

    await page.goto(`/dashboard/reconciliation?household=${hh.id}`)
    await page.waitForLoadState('networkidle')

    const section = page.locator(SECTION_SELECTOR)
    const linkCard = section.locator('.link-card', { hasText: 'Persist pair manual' })
    await expect(linkCard).toHaveCount(1)

    // Flip to Bank.
    const bankBtn = linkCard.locator('button[role="radio"]', { hasText: 'Bank' })
    await bankBtn.click()
    await expect(bankBtn).toHaveAttribute('aria-checked', 'true', { timeout: 5000 })
    await page.waitForLoadState('networkidle')

    // Full reload — toggle state must come back from server, still highlighting Bank.
    await page.reload()
    await page.waitForLoadState('networkidle')

    const sectionAfter = page.locator(SECTION_SELECTOR)
    const linkCardAfter = sectionAfter.locator('.link-card', { hasText: 'Persist pair manual' })
    await expect(linkCardAfter).toHaveCount(1)

    const bankBtnAfter = linkCardAfter.locator('button[role="radio"]', { hasText: 'Bank' })
    const manualBtnAfter = linkCardAfter.locator('button[role="radio"]', { hasText: 'Manual' })
    await expect(bankBtnAfter).toHaveAttribute('aria-checked', 'true', { timeout: 5000 })
    await expect(manualBtnAfter).toHaveAttribute('aria-checked', 'false')
  })
})
