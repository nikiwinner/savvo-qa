/**
 * Per-row currency rendering on expense lists (Phase 08, Story 8.7)
 *
 * Verifies that the expenses page renders each row using the row's own
 * `currency` field — NOT the viewer's user.currency and NOT a hardcoded USD.
 *
 * Setup uses two users with different `User.currency` values in the same
 * household. Bob (USD) seeds the expense, so the expense's currency is
 * snapshotted as USD at create-time (per gotcha #23). Alice (EUR) views the
 * expenses page and must see the USD symbol on Bob's row.
 *
 * The aggregated /dashboard/budgets totals remain viewer-currency by design
 * (intentional gap in v1, no FX conversion) — the second test pins this so
 * the per-row vs aggregate split doesn't silently regress.
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

    // Alice creates the household and assigns Bob.
    const household = await apiAlice.createHousehold('Per-Row Currency Home')
    const bobInfo = await apiBob.me()
    expect(bobInfo).not.toBeNull()
    await apiAlice.assignUser(household.id, bobInfo!.id)

    // Bob seeds an expense — backend snapshots Expense.currency from Bob's
    // user.currency (USD) at create-time per gotcha #23.
    const distinctiveDescription = `bob-usd-10-${Date.now()}`
    await apiBob.createExpense({
      household: household.id,
      description: distinctiveDescription,
      amount: 10.0,
      type: 'expense',
      expense_date: '2026-05-15',
    })

    // Push Alice's session cookies into the browser context, then visit the
    // expenses page scoped to the shared household.
    await context.addCookies(await apiAlice.cookies())
    await page.goto(`/dashboard/expenses?household=${household.id}`)
    await page.waitForLoadState('networkidle')

    // Locate Bob's row by description and assert per-row symbol.
    const bobRow = page.locator('tbody tr', { hasText: distinctiveDescription })
    await expect(bobRow).toBeVisible({ timeout: 5000 })

    const amountCell = bobRow.locator('td.cell-amount')
    await expect(amountCell).toBeVisible()

    // Intl.NumberFormat('en-US', { currency: 'USD' }).format(10) -> "$10.00".
    // We assert the dollar sign appears and the euro sign does not — this
    // tolerates any locale-specific spacing/grouping while still pinning the
    // critical per-row currency behaviour.
    const amountText = await amountCell.innerText()
    expect(amountText).toContain('$')
    expect(amountText).not.toContain('€')
    expect(amountText).toMatch(/10\.00/)

    await ctxAlice.dispose()
    await ctxBob.dispose()
  })

  test('aggregated /dashboard/budgets totals still use the viewer\'s currency symbol', async ({
    page,
    context,
    playwright,
  }) => {
    const ctxAlice = await playwright.request.newContext()
    const ctxBob = await playwright.request.newContext()
    const apiAlice = new ApiHelper(ctxAlice)
    const apiBob = new ApiHelper(ctxBob)

    const alice = uniqueUser('alice')
    const bob = uniqueUser('bob')

    await apiAlice.signup(alice, 'EUR')
    await apiAlice.login(alice.email, alice.password)
    await apiBob.signup(bob, 'USD')
    await apiBob.login(bob.email, bob.password)

    const household = await apiAlice.createHousehold('Per-Row Currency Budgets')
    const bobInfo = await apiBob.me()
    await apiAlice.assignUser(household.id, bobInfo!.id)

    // Seed a USD expense from Bob so the household has mixed-currency rows
    // (the aggregate sums them currency-naive — known limitation).
    await apiBob.createExpense({
      household: household.id,
      description: 'bob-usd-budget-test',
      amount: 25.0,
      type: 'expense',
      expense_date: '2026-05-15',
    })

    // Pick any default category and create a budget for it as Alice so the
    // budgets page has a card to render with the viewer-currency symbol.
    const categories = await apiAlice.listCategories()
    expect(categories.length).toBeGreaterThan(0)
    const cat = categories[0]
    await apiAlice.createBudget({
      household: household.id,
      category: cat.id,
      amount: '500.00',
      year: 2026,
      month: 5,
    })

    await context.addCookies(await apiAlice.cookies())
    await page.goto(`/dashboard/budgets?household=${household.id}&year=2026&month=5`)
    await page.waitForLoadState('networkidle')

    // The budget card's progress label uses currSymbol (viewer = Alice = EUR).
    // Scope to a stable selector so we don't pick up unrelated copy.
    const budgetCard = page.locator('.budget-card').first()
    await expect(budgetCard).toBeVisible({ timeout: 5000 })

    const progressLabel = budgetCard.locator('.progress-label')
    await expect(progressLabel).toBeVisible()
    const progressText = await progressLabel.innerText()
    expect(progressText).toContain('€')
    expect(progressText).not.toContain('$')

    await ctxAlice.dispose()
    await ctxBob.dispose()
  })
})
