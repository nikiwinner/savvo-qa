/**
 * Phase 16 — Story 16.2: backfill already-auto-attached rows to the Inbox.
 *
 * Rows synced under Phase 13 were auto-attached to a lone candidate space. The
 * one-time data migration (banking/0021) re-evaluates every non-manual,
 * non-split bank txn through the fallback-free engine: rule-match → that space;
 * no match → space=NULL. Manual rows + split rows are NEVER touched.
 *
 * The migration runs at stack startup (before any test seeds its rows), so each
 * test fabricates the pre-backfill "auto-attached" state with
 * `POST /api/seed/auto-attach/` and then triggers the user-scoped backfill on
 * demand with `POST /api/seed/run-backfill/` (the same `rerun_backfill` the
 * migration calls).
 */
import { test, expect } from '../../fixtures/index'

const TODAY = new Date().toISOString().split('T')[0]

test.describe('Backfill un-route (Phase 16, Story 16.2)', () => {
  test('backfill moves auto-attached non-manual rows with no rule to the Inbox', async ({
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Backfill Lone Space')

    // Fabricate 3 auto-attached rows (non-manual, non-split, attached to the space).
    const seed = await api.seedAutoAttach(space.id, { count: 3, merchant: 'BACKFILL NO RULE' })
    expect(seed.created).toBe(3)

    // Sanity: before the backfill they're attached to the space.
    for (const id of seed.transaction_ids) {
      const before = await api.getBankTransaction(id)
      expect(before!.space).toBe(space.id)
    }

    const counts = await api.runBackfill()
    expect(counts.moved_to_inbox).toBe(3)
    expect(counts.rerouted).toBe(0)

    // After: every row is now in the Inbox (space=NULL) — no rule claims them.
    for (const id of seed.transaction_ids) {
      const after = await api.getBankTransaction(id)
      expect(after!.space).toBeNull()
    }

    // The Inbox summary reflects the moved rows.
    const summary = await api.inboxSummary()
    expect(summary.total_unmapped).toBe(3)
  })

  test('backfill routes a row to a space when a matching rule exists', async ({
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    // The row was auto-attached to the WRONG space under Phase 13; a rule now
    // points the merchant at the RIGHT space. Backfill must re-route it across.
    const wrong = await api.createSpace('Backfill Wrong Space')
    const target = await api.createSpace('Backfill Rule Target')

    // A claim rule matching the seeded merchant on the target space.
    await api.createClaimRule({
      space: target.id,
      name: 'Rule for backfill',
      merchant_contains: 'routed merchant',
    })

    // Auto-attach a matching row to the WRONG space (its pre-backfill state).
    const seed = await api.seedAutoAttach(wrong.id, { count: 1, merchant: 'ROUTED MERCHANT 99' })
    const txnId = seed.transaction_ids[0]

    const counts = await api.runBackfill()
    // The row matches the rule → it is re-routed to the target (counted as
    // rerouted: moved to a different non-NULL space), not moved to the Inbox.
    expect(counts.rerouted).toBe(1)
    expect(counts.moved_to_inbox).toBe(0)

    const after = await api.getBankTransaction(txnId)
    expect(after!.space).toBe(target.id)
  })

  test('backfill leaves a manually-assigned row untouched', async ({ loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Backfill Manual Space')

    // Seed an unmapped row, then hand-assign it (sets is_manually_assigned=True).
    const txn = await api.createBankTransaction({
      description: 'MANUAL HOLD MERCHANT',
      amount: '15.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: null,
    })
    const assignRes = await api.assignTransactionRaw(txn.id, space.id)
    expect(assignRes.ok(), `assign failed: ${await assignRes.text()}`).toBeTruthy()

    const afterAssign = await api.getBankTransaction(txn.id)
    expect(afterAssign!.is_manually_assigned).toBe(true)
    expect(afterAssign!.space).toBe(space.id)

    const counts = await api.runBackfill()
    // The manual row is skipped entirely (not moved, not re-routed).
    expect(counts.moved_to_inbox).toBe(0)
    expect(counts.rerouted).toBe(0)

    // It stays exactly where the user put it, lock intact.
    const after = await api.getBankTransaction(txn.id)
    expect(after!.space).toBe(space.id)
    expect(after!.is_manually_assigned).toBe(true)
  })

  test('backfill leaves a split row untouched', async ({ loggedInPage }) => {
    const { api } = loggedInPage
    const spaceA = await api.createSpace('Backfill Split A')
    const spaceB = await api.createSpace('Backfill Split B')

    // Seed a row attached to spaceA, then split it across both spaces.
    const txn = await api.createBankTransaction({
      description: 'SPLIT BACKFILL MERCHANT',
      amount: '20.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: spaceA.id,
    })
    const allocRes = await api.setBankAllocationsRaw(txn.id, [
      { space_id: spaceA.id, amount: '12.00' },
      { space_id: spaceB.id, amount: '8.00' },
    ])
    expect(allocRes.ok(), `set_allocations failed: ${await allocRes.text()}`).toBeTruthy()

    const beforeSplit = await api.getBankTransaction(txn.id)
    const parentSpaceBefore = beforeSplit!.space

    const counts = await api.runBackfill()
    // The split row is skipped — not moved, not re-routed.
    expect(counts.moved_to_inbox).toBe(0)
    expect(counts.rerouted).toBe(0)

    // The split + parent space FK are unchanged.
    const afterSplit = await api.getBankTransaction(txn.id)
    expect(afterSplit!.space).toBe(parentSpaceBefore)
  })
})
