/**
 * Reconciliation — Show alternatives expand on /dashboard/reconciliation
 * (Phase 08, Story 8.4)
 *
 * Verifies:
 *  - With ?alternatives=on the suggestion card surfaces the primary row plus
 *    an `.alternatives-list` containing the remaining candidates, sorted by
 *    descending confidence (matched on bank-txn descriptions).
 *  - Confirming an alternative (not the primary) creates a reconciliation
 *    link whose bank_transaction matches the chosen alternative's bank-txn id.
 */
import { test, expect } from '../../fixtures/index'
import type { ApiHelper, HouseholdRecord, CategoryRecord } from '../../helpers/api'

interface Seeded {
  hh: HouseholdRecord
  cat: CategoryRecord
  expenseId: number
  txnDay0Id: number   // same-day → highest confidence (primary)
  txnDay1Id: number   // +1 day  → second confidence
  txnDay2Id: number   // +2 days → lowest confidence
}

/**
 * Seed one expense + 3 bank-txns (all €50 EUR) with date offsets +0/+1/+2.
 * The confidence algorithm awards +0.2 for same-day, +0.1 for ±1d, +0.0 for
 * ±2d — so day-0 is the primary and day-1, day-2 are the alternatives in
 * descending order. Description tokens are intentionally non-overlapping with
 * the expense, so token-overlap doesn't tip the ordering.
 */
async function seed(api: ApiHelper, label: string): Promise<Seeded> {
  const hh = await api.createHousehold(`Alternatives ${label}`)
  const categories = await api.listCategories()
  const cat = categories[0]

  const expense = await api.createExpense({
    household: hh.id,
    description: `Alt expense ${label}`,
    amount: 50.00,
    category: cat.id,
    type: 'expense',
    expense_date: '2026-04-15',
  })

  const txn0 = await api.createBankTransaction({
    description: `${label}-DAY0-PRIMARY`,
    merchant_display_name: `${label}-DAY0-PRIMARY`,
    amount: '50.00',
    type: 'expense',
    transaction_date: '2026-04-15',
    household_id: hh.id,
    category_id: cat.id,
    currency: 'EUR',
  })
  const txn1 = await api.createBankTransaction({
    description: `${label}-DAY1-ALT`,
    merchant_display_name: `${label}-DAY1-ALT`,
    amount: '50.00',
    type: 'expense',
    transaction_date: '2026-04-16',
    household_id: hh.id,
    category_id: cat.id,
    currency: 'EUR',
  })
  const txn2 = await api.createBankTransaction({
    description: `${label}-DAY2-ALT`,
    merchant_display_name: `${label}-DAY2-ALT`,
    amount: '50.00',
    type: 'expense',
    transaction_date: '2026-04-17',
    household_id: hh.id,
    category_id: cat.id,
    currency: 'EUR',
  })

  return {
    hh,
    cat,
    expenseId: expense.id,
    txnDay0Id: txn0.id,
    txnDay1Id: txn1.id,
    txnDay2Id: txn2.id,
  }
}

test.describe('Reconciliation — Show alternatives (Story 8.4)', () => {
  test('Show alternatives reveals secondary candidates', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const s = await seed(api, 'A')

    // Pre-flight: default suggestions endpoint returns one row per expense.
    const baseline = await api.listSuggestions(s.hh.id)
    expect(baseline.count).toBe(1)

    await page.goto(`/dashboard/reconciliation?household=${s.hh.id}`)
    await page.waitForLoadState('networkidle')

    // One suggestion card, no alternatives list, "Show alternatives" link present.
    const card = page.locator('.suggestion-card')
    await expect(card).toHaveCount(1, { timeout: 5000 })
    await expect(card.locator('.alternatives-list')).toHaveCount(0)

    const showLink = page.locator('a.alternatives-link')
    await expect(showLink).toBeVisible()
    await expect(showLink).toHaveText(/Show alternatives/i)

    await showLink.click()

    // URL updates with ?alternatives=on
    await page.waitForURL(/[?&]alternatives=on(\b|&)/, { timeout: 5000 })
    expect(page.url()).toContain('alternatives=on')

    // Now: same single card, primary + 2 alternative rows ordered by descending confidence.
    const cardAfter = page.locator('.suggestion-card')
    await expect(cardAfter).toHaveCount(1)

    const altList = cardAfter.locator('.alternatives-list')
    await expect(altList).toBeVisible()

    const altRows = altList.locator('.alternative-row')
    await expect(altRows).toHaveCount(2)

    // Day-1 alt has higher confidence than day-2 alt → ordered first.
    await expect(altRows.nth(0)).toContainText('A-DAY1-ALT')
    await expect(altRows.nth(1)).toContainText('A-DAY2-ALT')

    // The primary card markup still shows the day-0 candidate.
    await expect(cardAfter.locator('.suggestion-sides .bank-side')).toContainText('A-DAY0-PRIMARY')

    // Header now exposes "Hide alternatives".
    const hideLink = page.locator('a.alternatives-mode-toggle')
    await expect(hideLink).toBeVisible()
    await expect(hideLink).toHaveText(/Hide alternatives/i)
  })

  test('confirming an alternative creates the link to the chosen txn', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const s = await seed(api, 'B')

    // Navigate directly with alternatives mode on.
    await page.goto(`/dashboard/reconciliation?household=${s.hh.id}&alternatives=on`)
    await page.waitForLoadState('networkidle')

    const card = page.locator('.suggestion-card')
    await expect(card).toHaveCount(1, { timeout: 5000 })

    const altRows = card.locator('.alternatives-list .alternative-row')
    await expect(altRows).toHaveCount(2)

    // Sanity: second alternative row corresponds to the day-2 bank txn.
    const secondAlt = altRows.nth(1)
    await expect(secondAlt).toContainText('B-DAY2-ALT')

    // Pre-flight: no links yet.
    const before = await api.listReconciliationLinks(s.hh.id)
    expect(before.count).toBe(0)

    // Click Confirm on the second alternative row.
    const confirmBtn = secondAlt.locator('.btn-confirm.btn-sm')
    await expect(confirmBtn).toBeVisible()
    await confirmBtn.click()

    // Wait for the link to land server-side.
    await expect.poll(async () => (await api.listReconciliationLinks(s.hh.id)).count, {
      timeout: 5000,
    }).toBe(1)

    const after = await api.listReconciliationLinks(s.hh.id)
    expect(after.results).toHaveLength(1)
    const link = after.results[0]
    expect(link.expense_id).toBe(s.expenseId)
    // The link MUST point to the second alternative (day-2), not primary or day-1.
    expect(link.bank_transaction_id).toBe(s.txnDay2Id)
    // Created via the suggestion surface → server stamps source='suggestion'.
    expect(link.source).toBe('suggestion')
  })
})
