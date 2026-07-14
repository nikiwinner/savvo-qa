/**
 * Phase 13 — Story 13.1 / 13.5 / 13.7: routing-engine-adjacent surfaces that
 * ARE reachable via E2E.
 *
 * NOTE on scope: the routing engine (`banking/routing.py`) runs at SYNC time
 * (`route_transaction` inside `sync_transactions`) and on the opt-in
 * `apply_rule_to_matching` pass. A real Tink sync cannot be driven from E2E
 * (per the phase brief — do NOT fake a sync). CONFLICT resolution
 * (`resolve_conflict`: highest routing_priority wins, ties → lowest id) and the
 * ABSENCE of a single-space fallback (Phase 16) are now E2E-covered via the DEBUG-only on-demand
 * endpoint `POST /api/seed/route-unmapped/` (helper `api.routeUnmapped()`),
 * which runs the REAL `route_transaction` over the user's unmapped /
 * non-manually-assigned / non-split bank txns — see the "Conflict resolution"
 * describe block at the bottom of this file. What else we drive E2E:
 *   - routing_priority is writable + persists (Story 13.1) via the space Edit
 *     dialog (UI) and PATCH (API), and the serializer rejects out-of-range.
 *   - the manual-override lock is honored on the re-route path (Story 13.2 /
 *     13.4 apply_to_matching) — covered in claim-rules.spec.ts.
 *   - assign / bulk_set_space reject an archived target space (Story 13.5
 *     archive guard) so money never vanishes into a hidden space.
 */
import { test, expect } from '../../fixtures/index'

const TODAY = new Date().toISOString().split('T')[0]

test.describe('Routing priority — writable + validated (API)', () => {
  test('routing_priority defaults to 0 and a PATCH persists a new value', async ({
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Priority Space')

    const before = await api.getSpaceFull(space.id)
    expect(before!.routing_priority).toBe(0)

    const patch = await api.patchSpaceRaw(space.id, { routing_priority: 2 })
    expect(patch.status()).toBe(200)

    const after = await api.getSpaceFull(space.id)
    expect(after!.routing_priority).toBe(2)
  })

  test('routing_priority accepts the full -2..2 range', async ({ loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Range Space')
    for (const v of [-2, -1, 0, 1, 2]) {
      const res = await api.patchSpaceRaw(space.id, { routing_priority: v })
      expect(res.status(), `priority ${v} should be accepted`).toBe(200)
      const fresh = await api.getSpaceFull(space.id)
      expect(fresh!.routing_priority).toBe(v)
    }
  })

  test('routing_priority rejects out-of-range values (400)', async ({ loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Out Of Range Space')

    for (const bad of [3, -3, 99]) {
      const res = await api.patchSpaceRaw(space.id, { routing_priority: bad })
      expect(res.status(), `priority ${bad} should be rejected`).toBe(400)
    }
    // The value did not change from the default.
    const fresh = await api.getSpaceFull(space.id)
    expect(fresh!.routing_priority).toBe(0)
  })

  test('is_archived stays read-only on PATCH (regression guard)', async ({ loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('ReadOnly Archive Space')
    // Attempting to flip is_archived via PATCH is silently ignored (read-only field).
    const res = await api.patchSpaceRaw(space.id, { is_archived: true })
    expect(res.status()).toBe(200)
    const fresh = await api.getSpaceFull(space.id)
    expect(fresh!.is_archived).toBe(false)
  })
})

test.describe('Routing priority — space Edit dialog (UI)', () => {
  test('setting priority to High in the Edit dialog persists it', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Edit Priority Space')

    await page.goto('/dashboard/spaces')
    await page.waitForLoadState('networkidle')

    const card = page.locator('.space-card[data-name="Edit Priority Space"]')
    await expect(card).toBeVisible()

    // Open the inline Edit form (the pencil action).
    await card.locator('.action-btn[aria-label="Edit"]').click()

    // The 5-level selector: Low / Below Normal / Normal / Above Normal / High.
    const prioritySelect = card.locator('select[name="routing_priority"]')
    await expect(prioritySelect).toBeVisible()
    await prioritySelect.selectOption({ label: 'High' })

    await card.locator('button', { hasText: 'Save' }).click()

    // Wait for the inline form to collapse back to the card face.
    await expect(card.locator('select[name="routing_priority"]')).toHaveCount(0, { timeout: 8000 })

    // Assert persisted (High ↔ 2).
    const fresh = await api.getSpaceFull(space.id)
    expect(fresh!.routing_priority).toBe(2)
  })

  test('the Edit dialog seeds the persisted priority level', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Seeded Priority Space')
    // Seed Below Normal (-1) via API, then assert the dialog reflects it.
    await api.patchSpaceRaw(space.id, { routing_priority: -1 })

    await page.goto('/dashboard/spaces')
    await page.waitForLoadState('networkidle')

    const card = page.locator('.space-card[data-name="Seeded Priority Space"]')
    await card.locator('.action-btn[aria-label="Edit"]').click()

    const prioritySelect = card.locator('select[name="routing_priority"]')
    await expect(prioritySelect).toBeVisible()
    await expect(prioritySelect).toHaveValue('-1')
  })
})

test.describe('Archive guard on assign (Story 13.5)', () => {
  test('assigning a bank txn to an archived space is rejected (400)', async ({
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    // Two spaces so archiving one leaves the user with ≥1 active space.
    await api.createSpace('Active Assign Space')
    const toArchive = await api.createSpace('To Be Archived Space')

    const txn = await api.createBankTransaction({
      description: 'ARCHIVE GUARD TXN',
      amount: '14.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: null,
    })

    const archiveResp = await api.archiveSpaceRaw(toArchive.id)
    expect(archiveResp.ok(), `archive failed: ${await archiveResp.text()}`).toBeTruthy()

    // Assigning the txn to the now-archived space must 400 (money never vanishes
    // into a space hidden by Phase-12 archive guards — no-fake-numbers).
    const res = await api.assignTransactionRaw(txn.id, toArchive.id)
    expect(res.status()).toBe(400)

    const fresh = await api.getBankTransaction(txn.id)
    expect(fresh!.space).toBeNull()
  })
})

test.describe('Conflict resolution — real routing engine (seed/route-unmapped)', () => {
  // Each test owns a fresh user (loggedInPage fixture) so there is zero
  // cross-test data leakage: the seeded txn's candidate spaces are exactly the
  // user's own non-archived spaces, and routeUnmapped only touches this user's
  // unmapped/non-manual/non-split bank txns.

  test('conflict → higher routing_priority space wins', async ({ loggedInPage }) => {
    const { api } = loggedInPage

    // Space A: High priority (2). Space B: Normal priority (0).
    const spaceA = await api.createSpace('Conflict Winner A')
    const spaceB = await api.createSpace('Conflict Loser B')
    await api.updateSpace(spaceA.id, { routing_priority: 2 })
    await api.updateSpace(spaceB.id, { routing_priority: 0 })

    // A claim rule on EACH space matching the same merchant token.
    await api.createClaimRule({
      space: spaceA.id,
      name: 'Spotify → A',
      merchant_contains: 'spotify',
    })
    await api.createClaimRule({
      space: spaceB.id,
      name: 'Spotify → B',
      merchant_contains: 'spotify',
    })

    // One unmapped bank txn whose description contains the shared token.
    const txn = await api.createBankTransaction({
      description: 'SPOTIFY PREMIUM SUB',
      amount: '9.99',
      type: 'expense',
      transaction_date: TODAY,
      space_id: null,
    })

    const result = await api.routeUnmapped()
    expect(result.routed).toBe(1)

    // Highest routing_priority wins → Space A.
    const fresh = await api.getBankTransaction(txn.id)
    expect(fresh!.space).toBe(spaceA.id)
  })

  test('conflict tie (equal priority) → lowest space id wins', async ({ loggedInPage }) => {
    const { api } = loggedInPage

    // Two spaces with EQUAL priority (both default 0). The first-created has
    // the lower id, so the tie-break (lowest id) must land the txn there.
    const first = await api.createSpace('Tie First (lower id)')
    const second = await api.createSpace('Tie Second (higher id)')
    expect(first.id).toBeLessThan(second.id)

    await api.createClaimRule({
      space: first.id,
      name: 'Netflix → First',
      merchant_contains: 'netflix',
    })
    await api.createClaimRule({
      space: second.id,
      name: 'Netflix → Second',
      merchant_contains: 'netflix',
    })

    const txn = await api.createBankTransaction({
      description: 'NETFLIX.COM MONTHLY',
      amount: '15.49',
      type: 'expense',
      transaction_date: TODAY,
      space_id: null,
    })

    const result = await api.routeUnmapped()
    expect(result.routed).toBe(1)

    // Tie on priority → lowest id wins → the first-created space.
    const fresh = await api.getBankTransaction(txn.id)
    expect(fresh!.space).toBe(first.id)
  })

  test('no single-space fallback — one candidate, no rule → stays in the Inbox (Phase 16)', async ({
    loggedInPage,
  }) => {
    const { api } = loggedInPage

    // Exactly ONE space, NO claim rule. Phase 16 (Story 16.1) REMOVED the
    // lone-candidate auto-attach fallback: a Space is a deliberate project, not
    // a default bucket. So an unmatched row stays in the Inbox (space=NULL) even
    // when there is only one place it could go. (This test was INVERTED from the
    // old Phase-13 fallback assertion — see phase_16.md "Tests touching the old
    // contract".)
    const lone = await api.createSpace('Lone No-Fallback Space')

    const txn = await api.createBankTransaction({
      description: 'CORNER SHOP GROCERIES',
      amount: '23.40',
      type: 'expense',
      transaction_date: TODAY,
      space_id: null,
    })

    const result = await api.routeUnmapped()
    expect(result.routed).toBe(0)

    const fresh = await api.getBankTransaction(txn.id)
    expect(fresh!.space).toBeNull()
    // The row was never auto-attached, so the manual-override lock stays false.
    expect(fresh!.is_manually_assigned).toBe(false)
    // Guard against an accidental attach to the lone space.
    expect(fresh!.space).not.toBe(lone.id)
  })

  test('no candidate / no match (≥2 spaces, no rule) → stays unmapped', async ({
    loggedInPage,
  }) => {
    const { api } = loggedInPage

    // Two spaces, NO claim rule on either. No rule matches and there is more
    // than one candidate, so the engine cannot decide → the txn stays in the
    // Inbox (space=NULL) and is NOT counted as routed.
    await api.createSpace('Ambiguous Space One')
    await api.createSpace('Ambiguous Space Two')

    const txn = await api.createBankTransaction({
      description: 'UNKNOWN MERCHANT XYZ',
      amount: '4.20',
      type: 'expense',
      transaction_date: TODAY,
      space_id: null,
    })

    const result = await api.routeUnmapped()
    expect(result.routed).toBe(0)

    const fresh = await api.getBankTransaction(txn.id)
    expect(fresh!.space).toBeNull()
  })
})
