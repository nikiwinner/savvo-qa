/**
 * Per-row currency rendering on expense lists (Phase 08, Story 8.7)
 *
 * Verifies that the expenses page renders each row using the row's own
 * `currency` field — NOT the viewer's user.currency and NOT a hardcoded USD.
 *
 * Setup uses two users with different `User.currency` values in the same
 * space. Bob (USD) seeds the expense, so the expense's currency is
 * snapshotted as USD at create-time (per gotcha #23). Alice (EUR) views the
 * expenses page and must see the USD symbol on Bob's row.
 */
import { test, expect } from '@playwright/test'
import { ApiHelper, uniqueUser } from '../../helpers/api'

test.describe('Per-row currency rendering on /dashboard/expenses', () => {
  test('expense row shows the row\'s own currency symbol regardless of viewer preference', async ({
    page,
    context,
    playwright,
  }) => {
    // Two API contexts — one per user.
    const ctxAlice = await playwright.request.newContext()
    const ctxBob = await playwright.request.newContext()
    const apiAlice = new ApiHelper(ctxAlice)
    const apiBob = new ApiHelper(ctxBob)

    const alice = uniqueUser('alice')
    const bob = uniqueUser('bob')

    // Alice signs up with EUR, Bob with USD.
    await apiAlice.signup(alice, 'EUR')
    await apiAlice.login(alice.email, alice.password)
    await apiBob.signup(bob, 'USD')
    await apiBob.login(bob.email, bob.password)

    // Alice creates the space and assigns Bob.
    const space = await apiAlice.createSpace('Per-Row Currency Home')
    const bobInfo = await apiBob.me()
    expect(bobInfo).not.toBeNull()
    await apiAlice.assignUser(space.id, bobInfo!.id)

    // Bob seeds an expense — backend snapshots Expense.currency from Bob's
    // user.currency (USD) at create-time per gotcha #23.
    const distinctiveDescription = `bob-usd-10-${Date.now()}`
    await apiBob.createExpense({
      space: space.id,
      description: distinctiveDescription,
      amount: 10.0,
      type: 'expense',
      expense_date: '2026-05-15',
    })

    // Push Alice's session cookies into the browser context, then visit the
    // expenses page scoped to the shared space.
    await context.addCookies(await apiAlice.cookies())
    await page.goto(`/dashboard/expenses?space=${space.id}`)
    await page.waitForLoadState('networkidle')

    // Locate Bob's row by description and assert per-row symbol.
    const bobRow = page.locator('tbody tr', { hasText: distinctiveDescription })
    await expect(bobRow).toBeVisible({ timeout: 5000 })

    const amountCell = bobRow.locator('td.cell-amount')
    await expect(amountCell).toBeVisible()

    // Phase 10 (Story 10.7) introduces the inline-converted hybrid display:
    // off-currency rows now render a small `(≈ €Y.YY)` secondary line below
    // the canonical `$X.XX`. To keep the original per-row currency invariant
    // tight, scope the symbol assertions to the canonical line only — the
    // FX hint legitimately contains the viewer's currency symbol.
    const canonical = amountCell.locator('.canonical')
    await expect(canonical).toBeVisible()
    const canonicalText = await canonical.innerText()
    expect(canonicalText).toContain('$')
    expect(canonicalText).not.toContain('€')
    expect(canonicalText).toMatch(/10\.00/)

    await ctxAlice.dispose()
    await ctxBob.dispose()
  })
})
