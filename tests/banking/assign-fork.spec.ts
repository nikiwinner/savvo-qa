/**
 * Phase 16 — Story 16.3: the assign-vs-rule fork inside SpaceSplitModal
 * (REVISED 2026-06-03).
 *
 * The split-modal assign was always a ONE-TIME attribution. The fork surfaces
 * two explicit choices on a single-space Save:
 *   - "Just this transaction" → set_allocations fires once, no rule, no extra confirm.
 *   - "Also create a rule"     → closes the fork + split modal, opens the SHARED
 *                                rule dialog (MakeRulePopover, "Sort transactions
 *                                like this automatically") prefilled with the chosen
 *                                space; creating there POSTs from_transaction.
 *   - Cancel                   → no network call, still unassigned.
 * A multi-space split (≥2) and an unmap (0) POST immediately with NO fork.
 *
 * The word "Permanently" appears NOWHERE. The popover is merchant-only (no scope
 * radiogroup, no account cards).
 *
 * UI surfaces (from the live components):
 *   - "Map spaces" button:  button[aria-label="Map spaces"] in a bank row's space cell.
 *   - split modal:          .dialog[role="dialog"][aria-labelledby="split-modal-title"]
 *                           with per-space `.include-toggle input[type=checkbox]`.
 *   - fork dialog:          .dialog[role="dialog"][aria-labelledby="assign-fork-title"]
 *                           with `.fork-choice` buttons.
 *   - shared rule popover:  .dialog[role="dialog"][aria-labelledby="make-rule-title"]
 *                           with `select#make-rule-space`, `button.btn-confirm` "Create rule".
 */
import { test, expect } from '../../fixtures/index'
import { ExpensesPage } from '../../pages/ExpensesPage'

const TODAY = new Date().toISOString().split('T')[0]

/** Open the split modal on the named bank row (Inbox filter). */
async function openSplitModalFor(page: import('@playwright/test').Page, desc: string) {
  await page.goto('/dashboard/transactions?unmapped=true')
  await page.waitForLoadState('networkidle')
  const row = page.locator('tbody tr.row-bank', { hasText: desc })
  await expect(row).toBeVisible()
  await row.locator('button[aria-label="Map spaces"]').click()
  const modal = page.locator('.dialog[aria-labelledby="split-modal-title"]')
  await expect(modal).toBeVisible()
  return modal
}

test.describe('Assign-vs-rule fork (Phase 16, Story 16.3)', () => {
  test('single-space Save opens the assign fork with two choices', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    await api.createSpace('Fork Single Space')
    await api.createBankTransaction({
      description: 'FORK OPEN MERCHANT',
      amount: '10.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: null,
    })

    const modal = await openSplitModalFor(page, 'FORK OPEN MERCHANT')

    // Select exactly one space.
    await modal.locator('.include-toggle input[type="checkbox"]').first().check()

    // Track whether ANY set_allocations call fires while just opening the fork.
    let allocFired = false
    await page.route('**/set_allocations/', async (route) => {
      allocFired = true
      await route.continue()
    })

    await modal.locator('button.btn-confirm', { hasText: 'Save split' }).click()

    const fork = page.locator('.dialog[aria-labelledby="assign-fork-title"]')
    await expect(fork).toBeVisible()
    await expect(fork.locator('.fork-choice', { hasText: 'Just this transaction' })).toBeVisible()
    await expect(fork.locator('.fork-choice', { hasText: 'Also create a rule' })).toBeVisible()
    // No "Permanently" wording anywhere in the fork.
    await expect(fork).not.toContainText(/permanent/i)
    // No network call happened merely by opening the fork.
    expect(allocFired).toBe(false)
  })

  test('"Just this transaction" assigns once with no rule', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Fork Once Space')
    const txn = await api.createBankTransaction({
      description: 'FORK ONCE MERCHANT',
      amount: '11.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: null,
    })

    const modal = await openSplitModalFor(page, 'FORK ONCE MERCHANT')
    await modal.locator('.include-toggle input[type="checkbox"]').first().check()
    await modal.locator('button.btn-confirm', { hasText: 'Save split' }).click()

    const fork = page.locator('.dialog[aria-labelledby="assign-fork-title"]')
    await expect(fork).toBeVisible()
    await fork.locator('.fork-choice', { hasText: 'Just this transaction' }).click()

    // The modal closes after the one-time assign.
    await expect(page.locator('.dialog[aria-labelledby="split-modal-title"]')).toHaveCount(0, {
      timeout: 8000,
    })

    // The row moved to the chosen space (manual lock set) and NO claim rule exists.
    const fresh = await api.getBankTransaction(txn.id)
    expect(fresh!.space).toBe(space.id)
    expect(fresh!.is_manually_assigned).toBe(true)

    const rules = await api.listClaimRules(space.id)
    expect(rules.length).toBe(0)
  })

  test('a single-space assign on a MANUAL expense saves directly with no fork', async ({
    page,
    loggedInPage,
  }) => {
    // Manual expenses are NOT rule-eligible (claim rules route bank txns only),
    // so a single-space assign must skip the fork and POST immediately — never a
    // useless one-button "Just this transaction" dialog. (Regression guard for
    // the onSave `!ruleEligible` short-circuit.)
    const { api } = loggedInPage
    const space = await api.createSpace('Fork Manual Space')
    await api.createExpense({
      space: space.id,
      description: 'MANUAL NO FORK',
      amount: 12.5,
      expense_date: TODAY,
    })

    const expenses = new ExpensesPage(page)
    await expenses.gotoWithSpace(space.id)

    const row = page.locator('tbody tr:not(.row-bank)', { hasText: 'MANUAL NO FORK' })
    await expect(row).toBeVisible()
    await row.locator('button[aria-label="Map spaces"]').click()
    const modal = page.locator('.dialog[aria-labelledby="split-modal-title"]')
    await expect(modal).toBeVisible()

    // Exactly one space exists → one toggle; ensure it is included (idempotent).
    await modal.locator('.include-toggle input[type="checkbox"]').first().check()

    let allocFired = false
    await page.route('**/set_allocations/', async (route) => {
      allocFired = true
      await route.continue()
    })

    await modal.locator('button.btn-confirm', { hasText: 'Save split' }).click()

    // No fork dialog appears for a manual row — it saves directly and closes.
    await expect(page.locator('.dialog[aria-labelledby="assign-fork-title"]')).toHaveCount(0)
    await expect(modal).toHaveCount(0, { timeout: 8000 })
    expect(allocFired).toBe(true)
  })

  test('"Also create a rule" creates a merchant rule + assigns + applies', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Fork Rule Space')
    const txn = await api.createBankTransaction({
      description: 'CARREFOUR FORK SOURCE',
      amount: '23.45',
      type: 'expense',
      transaction_date: TODAY,
      space_id: null,
    })
    // A sibling unmapped row from the same merchant (both contain "carrefour")
    // — proves the generalized rule's apply-to-existing moved it too.
    const sibling = await api.createBankTransaction({
      description: 'CARREFOUR FORK SIBLING',
      amount: '9.99',
      type: 'expense',
      transaction_date: TODAY,
      space_id: null,
    })

    const modal = await openSplitModalFor(page, 'CARREFOUR FORK SOURCE')
    await modal.locator('.include-toggle input[type="checkbox"]').first().check()
    await modal.locator('button.btn-confirm', { hasText: 'Save split' }).click()

    const fork = page.locator('.dialog[aria-labelledby="assign-fork-title"]')
    await fork.locator('.fork-choice', { hasText: 'Also create a rule' }).click()

    // The fork closes and the SHARED rule popover opens, prefilled with the space.
    const popover = page.locator('.dialog[aria-labelledby="make-rule-title"]')
    await expect(popover).toBeVisible()
    await expect(popover.locator('h3')).toHaveText('Sort transactions like this automatically')
    // The chosen space is preselected in the "File into" select.
    await expect(popover.locator('select#make-rule-space')).toHaveValue(String(space.id))
    // Merchant-only: no scope radiogroup / account cards.
    await expect(popover.locator('input[name="scope"]')).toHaveCount(0)

    // Generalize the merchant so it also matches the sibling, tick apply-to-existing.
    await popover.locator('input#make-rule-merchant').fill('carrefour')
    await popover.locator('.check-row input[type="checkbox"]').check()
    await popover.locator('button.btn-confirm', { hasText: 'Create rule' }).click()

    await expect(popover).toHaveCount(0, { timeout: 8000 })

    // A merchant-scope claim rule now exists.
    const rules = await api.listClaimRules(space.id)
    expect(rules.some((r) => r.merchant_contains === 'carrefour')).toBeTruthy()

    // The source row is assigned, and the sibling was moved by apply-to-existing.
    const freshSource = await api.getBankTransaction(txn.id)
    expect(freshSource!.space).toBe(space.id)
    const freshSibling = await api.getBankTransaction(sibling.id)
    expect(freshSibling!.space).toBe(space.id)
  })

  test('cancelling the fork aborts with no network call', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    await api.createSpace('Fork Cancel Space')
    const txn = await api.createBankTransaction({
      description: 'FORK CANCEL MERCHANT',
      amount: '7.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: null,
    })

    const modal = await openSplitModalFor(page, 'FORK CANCEL MERCHANT')
    await modal.locator('.include-toggle input[type="checkbox"]').first().check()

    let allocFired = false
    await page.route('**/set_allocations/', async (route) => {
      allocFired = true
      await route.continue()
    })

    await modal.locator('button.btn-confirm', { hasText: 'Save split' }).click()

    const fork = page.locator('.dialog[aria-labelledby="assign-fork-title"]')
    await expect(fork).toBeVisible()
    // Cancel the fork (its dedicated Cancel button).
    await fork.locator('button.btn-ghost', { hasText: 'Cancel' }).click()
    await expect(fork).toHaveCount(0)

    // No POST happened; the row is still unassigned.
    expect(allocFired).toBe(false)
    const fresh = await api.getBankTransaction(txn.id)
    expect(fresh!.space).toBeNull()
  })

  test('a multi-space split saves with no fork', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    await api.createSpace('Split Fork A')
    await api.createSpace('Split Fork B')
    const txn = await api.createBankTransaction({
      description: 'MULTI SPLIT MERCHANT',
      amount: '20.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: null,
    })

    const modal = await openSplitModalFor(page, 'MULTI SPLIT MERCHANT')
    // Select TWO spaces and split evenly (10 + 10).
    const boxes = modal.locator('.include-toggle input[type="checkbox"]')
    await boxes.nth(0).check()
    await boxes.nth(1).check()
    await modal.locator('button.btn-tool', { hasText: 'Split evenly' }).click()

    await modal.locator('button.btn-confirm', { hasText: 'Save split' }).click()

    // No fork dialog appears — a split POSTs immediately. The modal closes.
    await expect(page.locator('.dialog[aria-labelledby="assign-fork-title"]')).toHaveCount(0)
    await expect(page.locator('.dialog[aria-labelledby="split-modal-title"]')).toHaveCount(0, {
      timeout: 8000,
    })

    // The split persisted (2 allocations).
    const parent = await api.getBankTransaction(txn.id)
    expect(parent!.space).not.toBeNull()
  })

  test('unmapping a row shows no fork', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Unmap Fork Space')
    // A bank row already mapped to a space, so deselecting all = unmap.
    const txn = await api.createBankTransaction({
      description: 'UNMAP FORK MERCHANT',
      amount: '6.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: space.id,
    })

    // Open the split modal from the space-scoped view (the row is mapped, not Inbox).
    await page.goto(`/dashboard/transactions?space=${space.id}`)
    await page.waitForLoadState('networkidle')
    const row = page.locator('tbody tr.row-bank', { hasText: 'UNMAP FORK MERCHANT' })
    await expect(row).toBeVisible()
    await row.locator('button[aria-label="Map spaces"]').click()
    const modal = page.locator('.dialog[aria-labelledby="split-modal-title"]')
    await expect(modal).toBeVisible()

    // Deselect all included spaces → unmap state.
    const checked = modal.locator('.include-toggle input[type="checkbox"]:checked')
    const count = await checked.count()
    for (let i = 0; i < count; i++) {
      // Re-query each iteration since the set shrinks as we uncheck.
      await modal.locator('.include-toggle input[type="checkbox"]:checked').first().uncheck()
    }

    // The confirm button now reads "Unmap"; clicking it POSTs with no fork.
    await modal.locator('button.btn-confirm', { hasText: 'Unmap' }).click()

    await expect(page.locator('.dialog[aria-labelledby="assign-fork-title"]')).toHaveCount(0)
    await expect(modal).toHaveCount(0, { timeout: 8000 })

    const fresh = await api.getBankTransaction(txn.id)
    expect(fresh!.space).toBeNull()
  })
})
