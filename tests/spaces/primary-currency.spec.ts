/**
 * Spaces — Primary currency picker (Phase 10, Story 10.4)
 *
 * Covers the per-space primary-currency chip-grid picker that lives on
 * /dashboard/spaces. Backend was shipped in Story 10.1.
 */
import { test, expect } from '../../fixtures/index'
import { ApiHelper, uniqueUser } from '../../helpers/api'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8001'

test.describe('Space primary currency picker', () => {
  test('setting primary currency persists across reload', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const space = await api.createSpace('Currency Picker House')

    await page.goto('/dashboard/spaces')
    await page.waitForLoadState('networkidle')

    const card = page.locator(`.space-card[data-space-id="${space.id}"]`)
    await expect(card).toBeVisible()

    // Default is EUR (backfilled by the Story 10.1 migration; default for new rows).
    const currentBadge = card.locator('[data-current-currency]')
    await expect(currentBadge).toHaveText('EUR')

    // Pick USD via the chip grid; wait for the PATCH to land before reload.
    const usdChip = card.locator('[data-currency-code="USD"]')
    await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.url().includes(`/api/spaces/${space.id}/`) &&
          resp.request().method() === 'PATCH' &&
          resp.ok(),
      ),
      usdChip.click(),
    ])

    // Optimistic UI flipped immediately.
    await expect(currentBadge).toHaveText('USD')
    await expect(usdChip).toHaveAttribute('aria-checked', 'true')

    // Reload — value should still be USD because the PATCH persisted.
    await page.reload()
    await page.waitForLoadState('networkidle')

    const reloadedCard = page.locator(`.space-card[data-space-id="${space.id}"]`)
    await expect(reloadedCard.locator('[data-current-currency]')).toHaveText('USD')
    await expect(reloadedCard.locator('[data-currency-code="USD"]')).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  test('non-member cannot patch primary currency (404)', async ({ playwright }) => {
    // Owner creates a space.
    const ctxOwner = await playwright.request.newContext()
    const apiOwner = new ApiHelper(ctxOwner)
    const owner = uniqueUser('owner')
    await apiOwner.signup(owner)
    await apiOwner.login(owner.email, owner.password)
    const space = await apiOwner.createSpace('Owner-Only House')

    // A second user, not a member of the space, attempts the PATCH.
    const ctxOutsider = await playwright.request.newContext()
    const apiOutsider = new ApiHelper(ctxOutsider)
    const outsider = uniqueUser('outsider')
    await apiOutsider.signup(outsider)
    await apiOutsider.login(outsider.email, outsider.password)

    // Pull the outsider's CSRF token directly off the helper (private accessor
    // not exposed; we mirror its lookup against storageState).
    const state = await ctxOutsider.storageState()
    const csrf = state.cookies.find((c) => c.name === 'csrftoken')?.value ?? ''

    const res = await ctxOutsider.patch(
      `${BACKEND_URL}/api/spaces/${space.id}/`,
      {
        data: { primary_currency: 'USD' },
        headers: { 'X-CSRFToken': csrf },
      },
    )

    expect(res.status()).toBe(404)

    // And the owner's record is untouched (still default EUR).
    const list = await apiOwner.listSpaces()
    const hh = list.find((h) => h.id === space.id) as { id: number; name: string; primary_currency?: string } | undefined
    expect(hh?.primary_currency).toBe('EUR')

    await ctxOwner.dispose()
    await ctxOutsider.dispose()
  })
})
