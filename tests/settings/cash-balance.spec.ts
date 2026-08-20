/**
 * Banking settings — NO cash section (settings-only contract)
 *
 * The settings/banking page no longer renders ANY cash section. The API is
 * unchanged — `bank-accounts` rows still serve the read-only `derived_*` trio
 * and Net Wealth still folds the derived cash figure (covered by the curriculum
 * specs); only the settings surface dropped it. These specs are the tripwire
 * against the section creeping back:
 *   • no "Cash accounts" heading and zero `cash-balance-figure` nodes — even
 *     for a user WITH cash Expense rows, so the absence is not vacuous;
 *   • the retired `PATCH /api/bank-accounts/<id>/balance/` still answers
 *     404/405 — `bank-accounts` stays a pure read-only surface.
 */
import { test, expect } from '../../fixtures/index'
import { seedCashIncome } from '../../helpers/netWealthFixtures'

test.describe('Banking settings — no cash section', () => {
  test('renders no cash section even when cash rows exist', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage

    // Real cash rows on the auto-provisioned cash account: the derived figure
    // EXISTS (the API serves it) — this page just must not show it.
    await seedCashIncome(api, '1500.00')
    expect((await api.cashAccount()).derived_balance).toBe('1500.00')

    await page.goto('/dashboard/settings/banking')
    await expect(page.getByRole('heading', { name: 'Banking' })).toBeVisible({ timeout: 30_000 })

    // The page is fully server-rendered (its load fetches only /api/bank-connections/),
    // so once the header paints the content is settled and these zero-counts are
    // honest, not a race. A future CLIENT-fetched cash section would break that
    // assumption — add an explicit wait if one ever lands.
    //
    // Assert the CONTRACT ("banks-only"), not one historical wording: match any
    // mention of cash, and any testid in the retired cash-balance-* family
    // (`-input`, `-currency`, `-save`, `-error` are what HEAD actually shipped).
    await expect(page.locator('main').getByText(/\bcash\b/i)).toHaveCount(0)
    await expect(page.locator('[data-testid^="cash-balance"]')).toHaveCount(0)
  })

  test('the retired balance PATCH stays gone', async ({ loggedInPage }) => {
    const { api } = loggedInPage

    // Never a 2xx write, never the old 400 guard — the route itself is GONE.
    const cash = await api.cashAccount()
    expect([404, 405]).toContain(await api.retiredBalancePatchStatus(cash.id))
  })
})
