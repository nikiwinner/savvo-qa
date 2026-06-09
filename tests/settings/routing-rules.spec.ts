/**
 * Phase 16 — Story 16.4: routing-rules management page + apply-to-existing.
 *
 * /dashboard/settings/routing-rules lists SpaceClaimRules grouped by space with
 * readable condition chips, a create/edit form, delete-with-confirm, and an
 * "Apply to existing" action backed by POST /api/claim-rules/<id>/apply/.
 *
 * UI surfaces (from the live page):
 *   - groups:         section.space-group with `.space-group-title`
 *   - rule card:      .rule-card, condition chips `.cond-chip`
 *   - create button:  .btn-create "New rule"
 *   - modal:          .dialog[aria-labelledby="routing-rule-title"]
 *                     select#rr-space, input#rr-merchant-contains, .btn-confirm
 *   - edit:           button[aria-label="Edit rule"]
 *   - delete:         button[aria-label="Delete rule"] → ConfirmDialog
 *   - apply:          .btn-apply "Apply to existing" → toast "Moved N transactions."
 */
import { test, expect } from '../../fixtures/index'

const TODAY = new Date().toISOString().split('T')[0]

test.describe('Routing-rules page (Phase 16, Story 16.4)', () => {
  test('the routing-rules page lists rules grouped by space', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const spaceA = await api.createSpace('RR Group Alpha')
    const spaceB = await api.createSpace('RR Group Beta')
    await api.createClaimRule({ space: spaceA.id, name: 'Lidl Alpha', merchant_contains: 'lidl' })
    await api.createClaimRule({ space: spaceB.id, name: 'Aldi Beta', merchant_contains: 'aldi' })

    await page.goto('/dashboard/settings/routing-rules')
    await page.waitForLoadState('networkidle')

    // Two grouped sections, one per space.
    await expect(page.locator('.space-group-title', { hasText: 'RR Group Alpha' })).toBeVisible()
    await expect(page.locator('.space-group-title', { hasText: 'RR Group Beta' })).toBeVisible()

    // Readable condition chips.
    await expect(page.locator('.cond-chip', { hasText: "merchant contains 'lidl'" })).toBeVisible()
    await expect(page.locator('.cond-chip', { hasText: "merchant contains 'aldi'" })).toBeVisible()
  })

  test('creating a routing rule adds it to the list', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('RR Create Space')

    await page.goto('/dashboard/settings/routing-rules')
    await page.waitForLoadState('networkidle')

    await page.locator('.btn-create', { hasText: 'New rule' }).first().click()
    const modal = page.locator('.dialog[aria-labelledby="routing-rule-title"]')
    await expect(modal).toBeVisible()

    await modal.locator('select#rr-space').selectOption({ label: 'RR Create Space' })
    await modal.locator('input#rr-merchant-contains').fill('spotify')
    await modal.locator('button.btn-confirm', { hasText: 'Create rule' }).click()
    await expect(modal).toHaveCount(0, { timeout: 8000 })

    // It appears in the list.
    await expect(
      page.locator('.cond-chip', { hasText: "merchant contains 'spotify'" }),
    ).toBeVisible()

    // And persisted server-side.
    const rules = await api.listClaimRules(space.id)
    expect(rules.some((r) => r.merchant_contains === 'spotify')).toBeTruthy()
  })

  test('editing a routing rule persists the change', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('RR Edit Space')
    const rule = await api.createClaimRule({
      space: space.id,
      name: 'Editable',
      merchant_contains: 'oldmerchant',
    })

    await page.goto('/dashboard/settings/routing-rules')
    await page.waitForLoadState('networkidle')

    await page.locator('button[aria-label="Edit rule"]').first().click()
    const modal = page.locator('.dialog[aria-labelledby="routing-rule-title"]')
    await expect(modal).toBeVisible()
    await modal.locator('input#rr-merchant-contains').fill('newmerchant')
    await modal.locator('button.btn-confirm', { hasText: 'Save changes' }).click()
    await expect(modal).toHaveCount(0, { timeout: 8000 })

    // After a reload the change is still there.
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(
      page.locator('.cond-chip', { hasText: "merchant contains 'newmerchant'" }),
    ).toBeVisible()

    const fresh = (await api.listClaimRules(space.id)).find((r) => r.id === rule.id)
    expect(fresh!.merchant_contains).toBe('newmerchant')
  })

  test('editing a rule that has an amount condition does not crash', async ({ page, loggedInPage }) => {
    // Regression: amount inputs are `type="number"` → Svelte binds a NUMBER, so a
    // bare `formAmountMin.trim()` blew up ("trim is not a function") whenever the
    // edited rule already had an amount set. The plain merchant-only edit test
    // above never exercised this path. Guard it explicitly.
    const { api } = loggedInPage
    const space = await api.createSpace('RR Amount Edit Space')
    const rule = await api.createClaimRule({
      space: space.id,
      name: 'Amount rule',
      merchant_contains: 'amzn',
      amount_min: '10.00',
      amount_max: '50.00',
    })

    await page.goto('/dashboard/settings/routing-rules')
    await page.waitForLoadState('networkidle')

    // The amount chip renders the seeded range.
    await expect(page.locator('.cond-chip', { hasText: 'amount' })).toBeVisible()

    // Open the edit modal (this is where the crash used to happen on mount),
    // change the merchant, and save — saving runs amountStr() over the numbers.
    await page.locator('button[aria-label="Edit rule"]').first().click()
    const modal = page.locator('.dialog[aria-labelledby="routing-rule-title"]')
    await expect(modal).toBeVisible()
    // The amount fields are pre-filled from the rule values. DRF serializes the
    // DecimalField as "10.00" and the page binds that string straight into the
    // input — the browser does not strip trailing zeros, so expect "10.00".
    await expect(modal.locator('input#rr-amount-min')).toHaveValue('10.00')
    await modal.locator('input#rr-merchant-contains').fill('amazon')
    await modal.locator('button.btn-confirm', { hasText: 'Save changes' }).click()
    await expect(modal).toHaveCount(0, { timeout: 8000 })

    // The change persisted and the amount survived the round-trip.
    const fresh = (await api.listClaimRules(space.id)).find((r) => r.id === rule.id)
    expect(fresh!.merchant_contains).toBe('amazon')
    expect(fresh!.amount_min).toBe('10.00')
    expect(fresh!.amount_max).toBe('50.00')
  })

  test('deleting a routing rule removes it (with confirm)', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('RR Delete Space')
    const rule = await api.createClaimRule({
      space: space.id,
      name: 'Deletable',
      merchant_contains: 'deleteme',
    })

    await page.goto('/dashboard/settings/routing-rules')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.cond-chip', { hasText: "merchant contains 'deleteme'" })).toBeVisible()

    await page.locator('button[aria-label="Delete rule"]').first().click()

    // The shared ConfirmDialog appears; confirm the delete.
    const confirm = page.locator('[role="dialog"]', { hasText: 'Delete routing rule?' })
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: 'Delete' }).click()

    await expect(
      page.locator('.cond-chip', { hasText: "merchant contains 'deleteme'" }),
    ).toHaveCount(0, { timeout: 8000 })

    const rules = await api.listClaimRules(space.id)
    expect(rules.map((r) => r.id)).not.toContain(rule.id)
  })

  test('apply-to-existing reports the matched count', async ({ page, loggedInPage }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('RR Apply Space')
    await api.createClaimRule({
      space: space.id,
      name: 'Apply rule',
      merchant_contains: 'applyme',
    })

    // 3 matching unmapped rows the rule should re-route on apply.
    const seeded = await Promise.all(
      ['APPLYME ONE', 'APPLYME TWO', 'APPLYME THREE'].map((desc) =>
        api.createBankTransaction({
          description: desc,
          amount: '5.00',
          type: 'expense',
          transaction_date: TODAY,
          space_id: null,
        }),
      ),
    )

    await page.goto('/dashboard/settings/routing-rules')
    await page.waitForLoadState('networkidle')

    await page.locator('.btn-apply', { hasText: 'Apply to existing' }).first().click()

    // Toast reports the moved count.
    await expect(page.locator('.alert-success')).toContainText('Moved 3 transactions', {
      timeout: 8000,
    })

    // The rows actually moved into the space.
    for (const t of seeded) {
      const fresh = await api.getBankTransaction(t.id)
      expect(fresh!.space, `txn "${t.description}" should be routed`).toBe(space.id)
    }
  })

  test('a non-member cannot apply another user\'s rule', async ({ twoActors }) => {
    const { apiA, apiB } = twoActors
    const spaceB = await apiB.createSpace('B private apply space')
    const ruleB = await apiB.createClaimRule({ space: spaceB.id, merchant_contains: 'bbbb' })

    // userA attempts to apply userB's rule → membership-scoped 404.
    const res = await apiA.applyClaimRuleRaw(ruleB.id)
    expect(res.status()).toBe(404)
  })
})
