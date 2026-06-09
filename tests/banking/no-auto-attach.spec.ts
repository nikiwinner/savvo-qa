/**
 * Phase 16 — Story 16.1: kill the single-space auto-attach fallback.
 *
 * Phase 13 auto-attached a freshly-synced row to the lone candidate space when
 * no claim rule matched. Phase 16 REMOVED that fallback — a Space is a
 * deliberate life-context project, never a default dumping ground. A fresh row
 * no rule claims now ALWAYS lands in the Inbox (`space=NULL`), regardless of how
 * many spaces the user has. A rule-matched row still routes (only the fallback
 * was removed).
 *
 * The routing engine runs at Tink sync time, which an E2E cannot drive. We use
 * the DEBUG `POST /api/seed/route-unmapped/` (helper `api.routeUnmapped()`),
 * which runs the REAL `route_transaction` over the user's unmapped / non-manual
 * / non-split rows — so this exercises the live fallback-free engine.
 */
import { test, expect } from '../../fixtures/index'

const TODAY = new Date().toISOString().split('T')[0]

test.describe('No auto-attach fallback (Phase 16, Story 16.1)', () => {
  test('single-space user: an unmatched synced transaction stays in the Inbox', async ({
    loggedInPage,
  }) => {
    const { api } = loggedInPage

    // Exactly ONE active space, NO claim rule.
    const lone = await api.createSpace('Single Space No Rule')

    const txn = await api.createBankTransaction({
      description: 'UNKNOWN MERCHANT SINGLE',
      amount: '12.34',
      type: 'expense',
      transaction_date: TODAY,
      space_id: null,
    })

    // Run the real routing engine over the user's unmapped rows.
    const result = await api.routeUnmapped()
    expect(result.routed).toBe(0)

    const fresh = await api.getBankTransaction(txn.id)
    // It stays in the Inbox (space=NULL), NOT auto-attached to the lone space.
    expect(fresh!.space).toBeNull()
    expect(fresh!.space).not.toBe(lone.id)
    // No deliberate attribution happened → the manual-override lock stays false.
    expect(fresh!.is_manually_assigned).toBe(false)
  })

  test('a rule-matched transaction still routes to its space', async ({ loggedInPage }) => {
    const { api } = loggedInPage

    // A single space with a merchant claim rule. Regression guard: removing the
    // fallback must NOT break rule-driven routing.
    const space = await api.createSpace('Rule-Routed Space')
    await api.createClaimRule({
      space: space.id,
      name: 'Aldi → space',
      merchant_contains: 'aldi',
    })

    const txn = await api.createBankTransaction({
      description: 'ALDI SUED 4711',
      amount: '8.90',
      type: 'expense',
      transaction_date: TODAY,
      space_id: null,
    })

    const result = await api.routeUnmapped()
    expect(result.routed).toBe(1)

    const fresh = await api.getBankTransaction(txn.id)
    expect(fresh!.space).toBe(space.id)
  })

  test('multi-space user: an unmatched transaction stays unmapped', async ({ loggedInPage }) => {
    const { api } = loggedInPage

    // Two spaces, NO matching rule. Unchanged from Phase 13: the engine cannot
    // decide → the row stays in the Inbox.
    await api.createSpace('Multi A No Rule')
    await api.createSpace('Multi B No Rule')

    const txn = await api.createBankTransaction({
      description: 'UNKNOWN MERCHANT MULTI',
      amount: '4.56',
      type: 'expense',
      transaction_date: TODAY,
      space_id: null,
    })

    const result = await api.routeUnmapped()
    expect(result.routed).toBe(0)

    const fresh = await api.getBankTransaction(txn.id)
    expect(fresh!.space).toBeNull()
    expect(fresh!.is_manually_assigned).toBe(false)
  })
})
