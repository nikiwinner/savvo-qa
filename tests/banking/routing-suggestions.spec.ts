/**
 * Phase 16 — Story 16.5: learned merchant→space suggestions (suggest-then-confirm).
 *
 * After the user manually assigns the SAME merchant token to the SAME space
 * N=2 times (with no claim rule covering it), a dismissible chip appears on
 * /dashboard/transactions: "Always route '<merchant>' to <Space>?" [Yes] [No].
 *   - Yes → POST /api/claim-rules/suggestions/accept/ → merchant rule + apply.
 *   - No  → localStorage dismiss ('savvo:dismissed_routing_suggestions:v1').
 * A merchant already covered by a claim rule produces NO suggestion.
 *
 * UI surfaces (from the live transactions page):
 *   - chip:   .routing-suggest-chip "Always route '<merchant>' to <Space>?"
 *   - yes:    button.suggest-yes
 *   - no:     button.suggest-no
 */
import { test, expect } from '../../fixtures/index'

const TODAY = new Date().toISOString().split('T')[0]

/** Manually assign two same-merchant rows to the same space (the N=2 trigger). */
async function seedTwoManualAssigns(
  api: import('../../helpers/api').ApiHelper,
  spaceId: number,
  merchant: string,
): Promise<void> {
  for (let i = 0; i < 2; i++) {
    const txn = await api.createBankTransaction({
      description: merchant,
      amount: '5.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: null,
    })
    const res = await api.assignTransactionRaw(txn.id, spaceId)
    expect(res.ok(), `assign failed: ${await res.text()}`).toBeTruthy()
  }
}

test.describe('Learned routing suggestions (Phase 16, Story 16.5)', () => {
  test('assigning the same merchant to the same space twice surfaces a suggestion', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Suggest Space One')
    await seedTwoManualAssigns(api, space.id, 'TRADER JOES')

    // The backend now offers the suggestion.
    const suggestions = await api.listSpaceSuggestions()
    expect(
      suggestions.some(
        (s) => s.merchant === 'trader joes' && s.space_id === space.id && s.occurrence_count >= 2,
      ),
    ).toBeTruthy()

    await page.goto('/dashboard/transactions')
    await page.waitForLoadState('networkidle')

    const chip = page.locator('.routing-suggest-chip', { hasText: 'Always route' })
    await expect(chip).toBeVisible()
    await expect(chip).toContainText('trader joes')
    await expect(chip).toContainText('Suggest Space One')
  })

  test('accepting a suggestion creates a rule and applies it', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Suggest Accept Space')
    await seedTwoManualAssigns(api, space.id, 'WHOLE FOODS')

    // A third matching unmapped row that accept's apply-to-matching should move.
    const third = await api.createBankTransaction({
      description: 'WHOLE FOODS',
      amount: '7.00',
      type: 'expense',
      transaction_date: TODAY,
      space_id: null,
    })

    await page.goto('/dashboard/transactions')
    await page.waitForLoadState('networkidle')

    const chip = page.locator('.routing-suggest-chip', { hasText: 'whole foods' })
    await expect(chip).toBeVisible()
    await chip.locator('button.suggest-yes').click()

    // The moved-count toast shows (1 matching unmapped row moved).
    await expect(
      page.locator('.alert-success', { hasText: 'Moved 1' }),
    ).toBeVisible({ timeout: 8000 })

    // A claim rule now exists for the merchant/space.
    const rules = await api.listClaimRules(space.id)
    expect(rules.some((r) => r.merchant_contains === 'whole foods')).toBeTruthy()

    // The third matching row routed into the space.
    const fresh = await api.getBankTransaction(third.id)
    expect(fresh!.space).toBe(space.id)
  })

  test('dismissing a suggestion hides it and it does not reappear', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Suggest Dismiss Space')
    await seedTwoManualAssigns(api, space.id, 'COSTCO')

    await page.goto('/dashboard/transactions')
    await page.waitForLoadState('networkidle')

    const chip = page.locator('.routing-suggest-chip', { hasText: 'costco' })
    await expect(chip).toBeVisible()
    await chip.locator('button.suggest-no').click()
    await expect(chip).toHaveCount(0)

    // Reload → the localStorage dismiss keeps it hidden.
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.routing-suggest-chip', { hasText: 'costco' })).toHaveCount(0)

    // The dismiss is recorded in localStorage under the documented key.
    const stored = await page.evaluate(() =>
      localStorage.getItem('savvo:dismissed_routing_suggestions:v1'),
    )
    expect(stored).toContain('costco')
  })

  test('a suggestion for a merchant already covered by a rule does not appear', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Suggest Covered Space')

    // A claim rule already covers this merchant/space.
    await api.createClaimRule({
      space: space.id,
      name: 'Covered',
      merchant_contains: 'safeway',
    })

    // Two manual assigns of the same merchant — but the rule already covers it.
    await seedTwoManualAssigns(api, space.id, 'SAFEWAY')

    // The backend excludes covered (space, merchant) pairs.
    const suggestions = await api.listSpaceSuggestions()
    expect(
      suggestions.some((s) => s.merchant === 'safeway' && s.space_id === space.id),
    ).toBeFalsy()

    await page.goto('/dashboard/transactions')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.routing-suggest-chip', { hasText: 'safeway' })).toHaveCount(0)
  })
})
