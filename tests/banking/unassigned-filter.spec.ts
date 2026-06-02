/**
 * Phase 13 — Story 13.5 / 13.7: the "Inbox" filter on the Transactions page
 * (/dashboard/transactions).
 *
 * Design revision 2026-05-30: the old dedicated /dashboard/inbox PAGE was
 * reverted to a filter chip on Transactions. `?unmapped=true` shows only
 * unmapped bank rows (`space=NULL`); a quiet inline count on the chip is fed by
 * `GET /api/inbox/summary/`'s `total_unmapped` (loaded in the dashboard layout).
 *
 * Rework 2026-06-02: the filter was renamed "Unassigned" → "Inbox" and it
 * AUTO-HIDES — the Inbox drawer section only renders when there are unmapped rows
 * (`inboxUnmappedCount > 0`). So a test that expects the Inbox chip must first
 * seed at least one unmapped row.
 *
 * Selectors:
 *   - rows:           tbody tr.row-bank
 *   - filter chip:    .filter-chip containing "Inbox" (in the Filters drawer
 *                     "Inbox" section), with a `.filter-chip-hint` showing "· N"
 *                     when count > 0. Only present when unmapped rows exist.
 *   - empty state:    the "Inbox is empty"/"Clear the “Inbox” filter" copy.
 */
import { test, expect } from '../../fixtures/index'

const TODAY = new Date().toISOString().split('T')[0]

test.describe('Inbox filter (Transactions page)', () => {
  test('toggling the Inbox filter shows only unmapped bank rows', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Mixed Mapped Space')

    // Two mapped rows + two unmapped rows on the same (seed) account.
    await api.createBankTransaction({
      description: 'MAPPED ROW ALPHA',
      amount: '10.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: space.id,
    })
    await api.createBankTransaction({
      description: 'MAPPED ROW BETA',
      amount: '20.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: space.id,
    })
    await api.createBankTransaction({
      description: 'UNMAPPED ROW GAMMA',
      amount: '30.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: null,
    })
    await api.createBankTransaction({
      description: 'UNMAPPED ROW DELTA',
      amount: '40.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: null,
    })

    // With the filter ON (via URL), only the two unmapped rows are visible.
    await page.goto('/dashboard/transactions?unmapped=true')
    await page.waitForLoadState('networkidle')

    await expect(page.locator('tbody tr.row-bank', { hasText: 'UNMAPPED ROW GAMMA' })).toBeVisible()
    await expect(page.locator('tbody tr.row-bank', { hasText: 'UNMAPPED ROW DELTA' })).toBeVisible()
    await expect(page.locator('tbody tr.row-bank', { hasText: 'MAPPED ROW ALPHA' })).toHaveCount(0)
    await expect(page.locator('tbody tr.row-bank', { hasText: 'MAPPED ROW BETA' })).toHaveCount(0)
  })

  test('the Inbox chip count matches GET /api/inbox/summary/ total_unmapped', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    await api.createSpace('Count Space')

    // Seed exactly 3 unmapped bank rows — guarantees the Inbox section renders
    // (it auto-hides at 0 unmapped).
    for (const desc of ['COUNT ONE', 'COUNT TWO', 'COUNT THREE']) {
      await api.createBankTransaction({
        description: desc,
        amount: '5.00',
        type: 'expense',
        transaction_date: TODAY,
        space_id: null,
      })
    }

    const summary = await api.inboxSummary()
    expect(summary.total_unmapped).toBe(3)

    // The chip hint reflects the same count after a fresh navigation (layout load).
    await page.goto('/dashboard/transactions')
    await page.waitForLoadState('networkidle')

    // Open the Filters drawer.
    await page.locator('button.btn-outline', { hasText: 'Filters' }).click()
    await page.locator('.drawer-panel').waitFor({ state: 'visible' })

    const chip = page.locator('.filter-chip', { hasText: 'Inbox' })
    await expect(chip).toBeVisible()
    await expect(chip.locator('.filter-chip-hint')).toContainText(String(summary.total_unmapped))
  })

  test('the Inbox filter section is absent when there are no unmapped rows', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('All Mapped Space')

    // Only mapped rows → the Inbox section must NOT render.
    await api.createBankTransaction({
      description: 'FULLY MAPPED ROW',
      amount: '12.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: space.id,
    })

    await page.goto('/dashboard/transactions')
    await page.waitForLoadState('networkidle')

    await page.locator('button.btn-outline', { hasText: 'Filters' }).click()
    await page.locator('.drawer-panel').waitFor({ state: 'visible' })

    // No Inbox section / chip when everything is assigned.
    await expect(page.locator('.filter-section-title', { hasText: 'Inbox' })).toHaveCount(0)
    await expect(page.locator('.filter-chip', { hasText: 'Inbox' })).toHaveCount(0)
  })

  test('assigning the last unmapped row empties the Inbox view', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Drain Space')

    const txn = await api.createBankTransaction({
      description: 'SOLE UNMAPPED ROW',
      amount: '7.50',
      type: 'expense',
      transaction_date: TODAY,
      space_id: null,
    })

    await page.goto('/dashboard/transactions?unmapped=true')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('tbody tr.row-bank', { hasText: 'SOLE UNMAPPED ROW' })).toBeVisible()

    // Assign it via the API (the override-stamping assign path), then reload the filter.
    const assignRes = await api.assignTransactionRaw(txn.id, space.id)
    expect(assignRes.ok(), `assign failed: ${await assignRes.text()}`).toBeTruthy()

    await page.goto('/dashboard/transactions?unmapped=true')
    await page.waitForLoadState('networkidle')

    // The row has left the Inbox view; the empty-state copy shows.
    await expect(page.locator('tbody tr.row-bank', { hasText: 'SOLE UNMAPPED ROW' })).toHaveCount(0)
    await expect(page.locator('.empty-state')).toBeVisible()
    await expect(page.locator('.empty-state')).toContainText('Inbox')

    // And the summary is back to zero.
    const summary = await api.inboxSummary()
    expect(summary.total_unmapped).toBe(0)
  })
})
