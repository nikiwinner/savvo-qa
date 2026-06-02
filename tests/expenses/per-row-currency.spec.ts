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

test.describe('Per-row currency rendering on /dashboard/transactions', () => {
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
    //
    // `hasText` is a substring match and the savvo_test DB persists across
    // parallel workers, so a bare `Date.now()` can collide (same ms) AND a
    // shorter timestamp is a substring of a longer one. A random token makes
    // the description — and therefore the row locator — collision-proof.
    const rand = Math.random().toString(36).slice(2, 8)
    const distinctiveDescription = `bob-usd-10-${Date.now()}-${rand}`
    await apiBob.createExpense({
      space: space.id,
      description: distinctiveDescription,
      amount: 10.0,
      type: 'expense',
      expense_date: '2026-05-15',
    })

    // Push Alice's session cookies into the browser context, then visit the
    // expenses page scoped to the shared space. The feed now defaults to "this
    // month" (shared dashboard period model); the seed row is dated 2026-05-15,
    // so pin ?preset=all to keep this currency test period-agnostic.
    await context.addCookies(await apiAlice.cookies())
    await page.goto(`/dashboard/transactions?space=${space.id}&preset=all`)
    await page.waitForLoadState('networkidle')

    // Locate Bob's row by description and assert per-row symbol.
    const bobRow = page.locator('tbody tr', { hasText: distinctiveDescription })
    await expect(bobRow).toBeVisible({ timeout: 5000 })

    const amountCell = bobRow.locator('td.cell-amount')
    await expect(amountCell).toBeVisible()

    // Display-currency-first layout (Story 10.7, revised): the primary
    // `.canonical` line shows the viewer's display currency when a rate exists,
    // otherwise it falls back to the row's native amount. Either way the row's
    // OWN currency ($) is rendered SOMEWHERE inside `.amount-with-fx` — as the
    // primary when no rate is cached, or as the small `.native` reference line
    // when a USD->EUR rate IS present (sibling FX specs seed a global,
    // non-user-scoped USD->EUR rate into the shared savvo_test ExchangeRate
    // cache, so under the full parallel suite a rate often IS available).
    // Assert rate-agnostically against the whole cell so the test holds in both
    // worlds — and never couple to the leaked converted € value.
    const amountWidget = amountCell.locator('.amount-with-fx')
    await expect(amountWidget).toBeVisible()
    await expect(amountWidget).toContainText('$')
    await expect(amountWidget).toContainText('10.00')

    await ctxAlice.dispose()
    await ctxBob.dispose()
  })
})
