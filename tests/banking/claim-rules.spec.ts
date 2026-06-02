/**
 * Phase 13 — Story 13.1 / 13.4 / 13.7: SpaceClaimRule CRUD + one-tap
 * make-rule-from-transaction (API + UI).
 *
 * Backend contracts (mas/roadmap/phase_13.md, API Reference):
 *   - GET  /api/claim-rules/                  — scoped to the user's spaces, ?space= filter
 *   - POST /api/claim-rules/                  — ≥1 condition required (else 400 non_field_errors)
 *   - DELETE /api/claim-rules/<id>/           — 204; 404 for a non-member rule
 *   - POST /api/claim-rules/from_transaction/ — derive rule + assign txn (is_manually_assigned=True),
 *                                               optional apply_to_matching re-route, dedupe.
 *
 * UI: the "Make a rule" Wand2 icon on an unmapped/assigned bank row on
 * /dashboard/transactions opens MakeRulePopover (`.dialog[role="dialog"]`,
 * `<select id="make-rule-space">`, scope radios `input[name="scope"]`,
 * apply-to-matching checkbox, `.btn-confirm` "Create rule").
 */
import { test, expect } from '../../fixtures/index'

const TODAY = new Date().toISOString().split('T')[0]

test.describe('Claim rules — CRUD + scoping (API)', () => {
  test('a rule with one condition can be created, listed, and deleted', async ({ loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Claim CRUD Space')

    const rule = await api.createClaimRule({
      space: space.id,
      name: 'Claim: lidl',
      merchant_contains: 'lidl',
    })
    expect(rule.id).toBeGreaterThan(0)
    expect(rule.space).toBe(space.id)
    expect(rule.merchant_contains).toBe('lidl')

    const rules = await api.listClaimRules(space.id)
    expect(rules.map((r) => r.id)).toContain(rule.id)

    const del = await api.deleteClaimRule(rule.id)
    expect(del.status()).toBe(204)

    const afterDelete = await api.listClaimRules(space.id)
    expect(afterDelete.map((r) => r.id)).not.toContain(rule.id)
  })

  test('creating a rule with zero conditions is rejected (400)', async ({ loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Zero Condition Space')

    // No condition fields, txn_type defaults to 'any' (= not a constraint).
    const res = await api.createClaimRuleRaw({ space: space.id, name: 'empty rule' })
    expect(res.status()).toBe(400)
    const body = (await res.text()).toLowerCase()
    expect(body).toContain('at least one condition')
  })

  test('claim-rules list is scoped to the requesting user (no cross-user leak)', async ({
    twoActors,
  }) => {
    const { apiA, apiB } = twoActors
    const spaceA = await apiA.createSpace('A claim space')
    const spaceB = await apiB.createSpace('B claim space')

    const ruleA = await apiA.createClaimRule({ space: spaceA.id, merchant_contains: 'aaaa' })
    const ruleB = await apiB.createClaimRule({ space: spaceB.id, merchant_contains: 'bbbb' })

    const aRules = await apiA.listClaimRules()
    const bRules = await apiB.listClaimRules()

    expect(aRules.map((r) => r.id)).toContain(ruleA.id)
    expect(aRules.map((r) => r.id)).not.toContain(ruleB.id)
    expect(bRules.map((r) => r.id)).toContain(ruleB.id)
    expect(bRules.map((r) => r.id)).not.toContain(ruleA.id)
  })

  test('cannot create a claim rule in a space the user is not a member of', async ({
    twoActors,
  }) => {
    const { apiA, apiB } = twoActors
    const spaceB = await apiB.createSpace('B private space')

    // userA tries to attach a rule to userB's space.
    const res = await apiA.createClaimRuleRaw({ space: spaceB.id, merchant_contains: 'sneaky' })
    expect(res.status()).toBe(400)
    const body = (await res.text()).toLowerCase()
    expect(body).toContain('space')
  })

  test("deleting another user's rule returns 404", async ({ twoActors }) => {
    const { apiA, apiB } = twoActors
    const spaceB = await apiB.createSpace('B owned space')
    const ruleB = await apiB.createClaimRule({ space: spaceB.id, merchant_contains: 'owned' })

    const res = await apiA.deleteClaimRule(ruleB.id)
    expect(res.status()).toBe(404)

    // The rule still exists for its owner.
    const stillThere = await apiB.listClaimRules(spaceB.id)
    expect(stillThere.map((r) => r.id)).toContain(ruleB.id)
  })
})

test.describe('Claim rules — from_transaction (API)', () => {
  test('from_transaction derives a merchant rule and assigns the source txn (manual lock)', async ({
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('FromTxn Space')

    const txn = await api.createBankTransaction({
      description: 'LIDL BERLIN 4711',
      amount: '19.99',
      type: 'expense',
      transaction_date: TODAY,
      space_id: null,
    })

    const result = await api.fromTransaction({
      transaction_id: txn.id,
      space_id: space.id,
      scope: 'merchant',
    })

    expect(result.assigned_transaction_id).toBe(txn.id)
    expect(result.rule.space).toBe(space.id)
    // Default merchant scope derives merchant_contains from the lowercased description.
    expect(result.rule.merchant_contains).toBe('lidl berlin 4711')
    expect(result.matched_count).toBe(0) // apply_to_matching defaults false

    const fresh = await api.getBankTransaction(txn.id)
    expect(fresh!.space).toBe(space.id)
    expect(fresh!.is_manually_assigned).toBe(true)
  })

  test('a merchant_contains override is used verbatim (lowercased) instead of the description', async ({
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Override Space')
    const txn = await api.createBankTransaction({
      description: 'SPOTIFY AB STOCKHOLM #99',
      amount: '9.99',
      type: 'expense',
      transaction_date: TODAY,
      space_id: null,
    })

    const result = await api.fromTransaction({
      transaction_id: txn.id,
      space_id: space.id,
      scope: 'merchant',
      merchant_contains: 'Spotify',
    })
    expect(result.rule.merchant_contains).toBe('spotify')
  })

  test('a second identical from_transaction tap reuses the rule (dedupe, no duplicate)', async ({
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Dedupe Space')
    const txn1 = await api.createBankTransaction({
      description: 'NETFLIX.COM',
      amount: '12.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: null,
    })
    const txn2 = await api.createBankTransaction({
      description: 'NETFLIX.COM',
      amount: '12.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: null,
    })

    const r1 = await api.fromTransaction({ transaction_id: txn1.id, space_id: space.id })
    const r2 = await api.fromTransaction({ transaction_id: txn2.id, space_id: space.id })

    expect(r2.rule.id).toBe(r1.rule.id)
    const rules = (await api.listClaimRules(space.id)).filter(
      (r) => r.merchant_contains === 'netflix.com',
    )
    expect(rules.length).toBe(1)
  })

  test('apply_to_matching re-routes sibling non-manual rows and reports the count', async ({
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('ApplyMatching Space')

    // Three unmapped sibling rows from the same merchant.
    const seed = await Promise.all(
      ['ALDI SUED 1', 'ALDI SUED 2', 'ALDI SUED 3'].map((desc) =>
        api.createBankTransaction({
          description: desc,
          amount: '5.00',
          type: 'expense',
          transaction_date: TODAY,
          space_id: null,
        }),
      ),
    )

    // Make a rule from the first row, generalized to "aldi sued", apply to matching.
    const result = await api.fromTransaction({
      transaction_id: seed[0].id,
      space_id: space.id,
      scope: 'merchant',
      merchant_contains: 'aldi sued',
      apply_to_matching: true,
    })

    // The source row is the manually-assigned one; matched_count covers the OTHER
    // non-manual rows the rule re-routed (2 here).
    expect(result.matched_count).toBe(2)

    for (const t of seed) {
      const fresh = await api.getBankTransaction(t.id)
      expect(fresh!.space, `txn "${t.description}" should be routed`).toBe(space.id)
    }
  })

  test('apply_to_matching does NOT move a manually-assigned row in another space', async ({
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const target = await api.createSpace('Rule Target Space')
    const otherSpace = await api.createSpace('Manual Hold Space')

    // A row hand-assigned to otherSpace (is_manually_assigned=True via assign).
    const manualTxn = await api.createBankTransaction({
      description: 'REWE CITY',
      amount: '8.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: null,
    })
    const assignRes = await api.assignTransactionRaw(manualTxn.id, otherSpace.id)
    expect(assignRes.ok()).toBeTruthy()
    const afterAssign = await api.getBankTransaction(manualTxn.id)
    expect(afterAssign!.is_manually_assigned).toBe(true)

    // A second unmapped row from the same merchant — this one is rule-routable.
    const freshTxn = await api.createBankTransaction({
      description: 'REWE CITY',
      amount: '8.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: null,
    })

    // Make a "rewe" rule into target with apply_to_matching.
    await api.fromTransaction({
      transaction_id: freshTxn.id,
      space_id: target.id,
      scope: 'merchant',
      merchant_contains: 'rewe',
      apply_to_matching: true,
    })

    // The manually-held row stays where the user put it; the fresh one is in target.
    const manualFresh = await api.getBankTransaction(manualTxn.id)
    expect(manualFresh!.space).toBe(otherSpace.id)
    const freshFresh = await api.getBankTransaction(freshTxn.id)
    expect(freshFresh!.space).toBe(target.id)
  })

  test('from_transaction into a foreign space is rejected (400)', async ({ twoActors }) => {
    const { apiA, apiB } = twoActors
    const spaceB = await apiB.createSpace('B target')
    const txnA = await apiA.createBankTransaction({
      description: 'OWN A TXN',
      amount: '3.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: null,
    })

    const res = await apiA.fromTransactionRaw({ transaction_id: txnA.id, space_id: spaceB.id })
    expect(res.status()).toBe(400)

    // The txn was NOT assigned.
    const fresh = await apiA.getBankTransaction(txnA.id)
    expect(fresh!.space).toBeNull()
  })
})

test.describe('Claim rules — make-rule popover (UI)', () => {
  test('make-rule from a bank row creates a rule and assigns the row', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('UI MakeRule Space')

    const txn = await api.createBankTransaction({
      description: 'CARREFOUR PARIS',
      amount: '23.45',
      type: 'expense',
      transaction_date: TODAY,
      space_id: null,
    })

    // Open the Transactions page with the Inbox filter so the unmapped row shows.
    await page.goto('/dashboard/transactions?unmapped=true')
    await page.waitForLoadState('networkidle')

    const row = page.locator('tbody tr.row-bank', { hasText: 'CARREFOUR PARIS' })
    await expect(row).toBeVisible()

    // The "Make a rule" Wand2 button lives in the SPACE column actions.
    await row.locator('button[aria-label="Make a rule from this transaction"]').click()

    const dialog = page.locator('.dialog[role="dialog"]')
    await expect(dialog).toBeVisible()

    // Pick the target space and confirm.
    await dialog.locator('select#make-rule-space').selectOption({ label: 'UI MakeRule Space' })
    await dialog.locator('button.btn-confirm', { hasText: 'Create rule' }).click()
    await expect(dialog).not.toBeVisible({ timeout: 8000 })

    // Assert via API: the row is now in the space and a rule exists.
    const fresh = await api.getBankTransaction(txn.id)
    expect(fresh!.space).toBe(space.id)
    expect(fresh!.is_manually_assigned).toBe(true)

    const rules = await api.listClaimRules(space.id)
    expect(rules.length).toBeGreaterThanOrEqual(1)
    expect(rules.some((r) => r.merchant_contains === 'carrefour paris')).toBeTruthy()
  })

  test('a split (≥2 spaces) bank row shows the info hint and NO make-rule button', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const spaceA = await api.createSpace('Split A')
    const spaceB = await api.createSpace('Split B')

    // Seed a bank txn, then split it across two spaces via set_allocations.
    const txn = await api.createBankTransaction({
      description: 'SPLIT MERCHANT XYZ',
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

    await page.goto(`/dashboard/transactions?space=${spaceA.id}`)
    await page.waitForLoadState('networkidle')

    const row = page.locator('tbody tr.row-bank', { hasText: 'SPLIT MERCHANT XYZ' })
    await expect(row).toBeVisible()

    // Split rows show the "X spaces" pill and an Info hint instead of the Wand2 button.
    await expect(row.locator('.hh-split-pill')).toContainText('2 spaces')
    await expect(
      row.locator('button[aria-label="Make a rule from this transaction"]'),
    ).toHaveCount(0)
    await expect(
      row.locator('[aria-label="Can\'t make a rule from a split transaction"]'),
    ).toBeVisible()
  })
})
