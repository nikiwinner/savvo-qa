/**
 * Phase 14 — Story 14.5 / 14.7 — Auto-suggest (rung-2 repeat-detection) chip,
 * first-time "new merchant" hint, and the manual-category lock.
 *
 * The chip is driven by `GET /api/categorization/suggestions/`
 * (`detect_repeat_suggestions`): a merchant the user hand-categorized to the
 * SAME category >= 2 times, NOT already covered by an `is_auto` rule. Merchant
 * identity = `description.strip().lower()` (the same normalization
 * `create_auto_rule`/`apply_rules` use), so the two trigger rows share an
 * IDENTICAL description.
 *
 * Tests 1-3 use a description that matches NO `MERCHANT_SEED` token and NO
 * provider category, so the cascade never categorizes it on its own — the
 * 2-repeat path is the only way it gets a category. Tests 4-5 exercise the
 * manual lock and the first-time hint.
 */
import { test, expect } from '../../fixtures/index'
import { ExpensesPage } from '../../pages/ExpensesPage'

const TODAY = new Date().toISOString().split('T')[0]

// No real brand here → guaranteed not to hit a MERCHANT_SEED token (seed tokens
// are brand names: lidl, netflix, …). The shown merchant = this, lower-cased.
//
// The savvo_test DB persists across projects (chromium → mobile-safari →
// tablet) and across parallel workers, and merchant identity (= description
// lower-cased) is what drives repeat-detection AND the dismiss-hash. A shared
// constant therefore cross-contaminates: another worker's same-merchant
// categorizations can create a suppressing is_auto rule, and one worker's
// localStorage dismiss can't bleed across browser contexts but the SERVER-side
// suggestion can. So mint a UNIQUE token per test invocation.
function uniqueMerchant(): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `QZX${rand} VNDR`
}

test.describe('Auto-suggest (rung-2) + first-time hint + manual lock', () => {
  test('categorizing the same merchant twice surfaces an auto-suggest chip', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Suggest Twice Home')
    const dining = await api.getCategoryByName('Restaurant')
    expect(dining, 'Restaurant default category should exist').not.toBeNull()

    const merchant = uniqueMerchant()

    // Two bank rows with the SAME description (merchant identity = description).
    const t1 = await api.createBankTransaction({
      description: merchant,
      amount: '4.50',
      type: 'expense',
      transaction_date: TODAY,
      space_id: space.id,
    })
    const t2 = await api.createBankTransaction({
      description: merchant,
      amount: '5.20',
      type: 'expense',
      transaction_date: TODAY,
      space_id: space.id,
    })

    // Hand-categorize BOTH rows to Restaurant via the API with createRule=false
    // (same lock-stamping path as tests 2/3). This is the 2-repeat trigger.
    //
    // We deliberately do NOT use the modal (`categorizeRow`): the modal posts
    // `create_rule: true`, which spawns an is_auto rule, and
    // `detect_repeat_suggestions` excludes any merchant already covered by an
    // is_auto rule — so the chip could never appear. The API path with
    // createRule=false stamps the manual lock without the suppressing rule.
    await api.categorizeBankTransaction(t1.id, dining!.id)
    await api.categorizeBankTransaction(t2.id, dining!.id)

    await page.goto(`/dashboard/expenses?space=${space.id}`)
    await page.waitForLoadState('networkidle')

    const chip = page
      .locator('tbody tr.row-bank', { hasText: merchant })
      .locator('.suggest-chip')
      .first()
    await expect(chip).toBeVisible()
    await expect(chip).toContainText('Restaurant')
  })

  test('accepting the auto-suggest creates a rule and updates only the merchant rows', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Suggest Accept Home')
    const dining = await api.getCategoryByName('Restaurant')
    expect(dining).not.toBeNull()

    const merchant = uniqueMerchant()
    const unrelatedMerchant = `ZZZ${Math.random().toString(36).slice(2, 8).toUpperCase()} OTHER`

    // Two trigger rows (categorized by hand via the API — same lock-stamping
    // path as the modal — for deterministic ids), one MORE uncategorized
    // same-merchant row, and an UNRELATED uncategorized row.
    const t1 = await api.createBankTransaction({
      description: merchant,
      amount: '4.50',
      type: 'expense',
      transaction_date: TODAY,
      space_id: space.id,
    })
    const t2 = await api.createBankTransaction({
      description: merchant,
      amount: '5.20',
      type: 'expense',
      transaction_date: TODAY,
      space_id: space.id,
    })
    const third = await api.createBankTransaction({
      description: merchant,
      amount: '6.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: space.id,
    })
    const unrelated = await api.createBankTransaction({
      description: unrelatedMerchant,
      amount: '9.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: space.id,
    })

    await api.categorizeBankTransaction(t1.id, dining!.id)
    await api.categorizeBankTransaction(t2.id, dining!.id)

    await page.goto(`/dashboard/expenses?space=${space.id}`)
    await page.waitForLoadState('networkidle')

    // Accept the suggestion (one tap on the chip's "Yes"). Wait on the actual
    // accept POST rather than `networkidle` — the click handler is async, so
    // networkidle can resolve in the gap BEFORE the POST fires (the row-3
    // categorization then hasn't landed yet, which is the flake we're killing).
    const chip = page
      .locator('tbody tr.row-bank', { hasText: merchant })
      .locator('.suggest-chip')
      .first()
    await expect(chip).toBeVisible()
    const acceptResponse = page.waitForResponse(
      (res) =>
        res.request().method() === 'POST' &&
        res.url().includes('/api/categorization/suggestions/accept/'),
    )
    await chip.locator('.suggest-yes').click()
    const acceptRes = await acceptResponse
    // The accept endpoint CREATES an is_auto rule → 201.
    expect(acceptRes.status(), await acceptRes.text()).toBe(201)

    // The 3rd same-merchant row is now categorized via the new `is_auto` rule.
    // Poll: the accept endpoint applies the rule synchronously, but read it back
    // via the API with a small poll window to stay robust under parallel load.
    await expect
      .poll(
        async () => (await api.getBankTransaction(third.id))?.category ?? null,
        { timeout: 5000 },
      )
      .toBe(dining!.id)
    // …and the applied scope is HONEST: the unrelated row is untouched.
    const afterUnrelated = await api.getBankTransaction(unrelated.id)
    expect(afterUnrelated!.category, 'an unrelated merchant must NOT be affected').toBeNull()

    // The merchant is now covered by an is_auto rule → the chip disappears.
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(
      page.locator('tbody tr.row-bank', { hasText: merchant }).locator('.suggest-chip'),
    ).toHaveCount(0)
  })

  test('dismissing the auto-suggest hides it and it does not reappear', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Suggest Dismiss Home')
    const dining = await api.getCategoryByName('Restaurant')
    expect(dining).not.toBeNull()

    const merchant = uniqueMerchant()

    const t1 = await api.createBankTransaction({
      description: merchant,
      amount: '4.50',
      type: 'expense',
      transaction_date: TODAY,
      space_id: space.id,
    })
    const t2 = await api.createBankTransaction({
      description: merchant,
      amount: '5.20',
      type: 'expense',
      transaction_date: TODAY,
      space_id: space.id,
    })
    await api.categorizeBankTransaction(t1.id, dining!.id)
    await api.categorizeBankTransaction(t2.id, dining!.id)

    await page.goto(`/dashboard/expenses?space=${space.id}`)
    await page.waitForLoadState('networkidle')

    const chip = page
      .locator('tbody tr.row-bank', { hasText: merchant })
      .locator('.suggest-chip')
      .first()
    await expect(chip).toBeVisible()

    // Dismiss (localStorage `savvo:dismissed_category_suggestions:v1`).
    await chip.locator('.suggest-no').click()
    await expect(page.locator('.suggest-chip')).toHaveCount(0)

    // Reload — the dismiss persists (no backend dismiss; localStorage only).
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.suggest-chip')).toHaveCount(0)
  })

  test('a manually categorized bank row stays categorized when the cascade re-runs', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Suggest Lock Home')

    // A seed-token row (`lidl` → Groceries) hand-categorized to Shopping. The
    // cascade `reapply` runs the IDENTICAL `run_cascade` a Tink re-sync runs
    // post-routing, so this proves the manual lock survives a re-sync.
    // Keep the `LIDL` seed token but mint a unique suffix so a parallel worker
    // can't collide on an identical description.
    const lidlDesc = `LIDL ${Math.random().toString(36).slice(2, 8).toUpperCase()} HAMBURG`
    const txn = await api.createBankTransaction({
      description: lidlDesc,
      amount: '21.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: space.id,
    })
    const shopping = await api.getCategoryByName('Shopping')
    const groceries = await api.getCategoryByName('Groceries')
    expect(shopping).not.toBeNull()
    expect(groceries).not.toBeNull()

    const expenses = new ExpensesPage(page)
    await page.goto(`/dashboard/expenses?space=${space.id}`)
    await page.waitForLoadState('networkidle')
    const row = page.locator('tbody tr.row-bank', { hasText: lidlDesc })
    await expect(row).toBeVisible()
    await expenses.categorizeRow(row, 'Shopping')
    await expect(row.locator('.badge-category')).toContainText('Shopping')

    // Re-run the cascade. The seed (Groceries) must NOT overwrite the lock.
    await api.categorizationReapply(space.id)

    const after = await api.getBankTransaction(txn.id)
    expect(after!.category, 'manual lock must survive the cascade').toBe(shopping!.id)
    expect(after!.category).not.toBe(groceries!.id)
  })

  test('a brand-new unknown merchant row shows the first-time pick-a-category hint', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Suggest Hint Home')

    // No seed token, no provider category, no rule → the cascade leaves it
    // uncategorized (badge-none), which surfaces the first-time hint. Unique
    // suffix keeps it parallel-safe (and still matches no MERCHANT_SEED token).
    const unknownDesc = `POS ${Math.random().toString(36).slice(2, 8).toUpperCase()} ZZVND`
    await api.createBankTransaction({
      description: unknownDesc,
      amount: '7.40',
      type: 'expense',
      transaction_date: TODAY,
      space_id: space.id,
    })

    // Run the cascade so we assert the POST-cascade uncategorized state.
    await api.categorizationReapply(space.id)

    await page.goto(`/dashboard/expenses?space=${space.id}`)
    await page.waitForLoadState('networkidle')
    const row = page.locator('tbody tr.row-bank', { hasText: unknownDesc })
    await expect(row).toBeVisible()
    await expect(row.locator('.badge-none')).toBeVisible()
    const hint = row.locator('.first-time-hint')
    await expect(hint).toBeVisible()
    await expect(hint).toContainText('New merchant')
  })
})
