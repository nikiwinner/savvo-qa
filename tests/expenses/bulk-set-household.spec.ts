/**
 * Phase 09 — Story 9.2: Bulk household change for bank transactions.
 *
 * UI: floating .bulk-action-bar exposes a "Move to household..." button that
 * opens a popover listing the user's households + an "Unmap (no household)"
 * option. Picking a target POSTs to /api/bank-transactions/bulk_set_household/.
 *
 * Server-side defenses tested directly via the API helper:
 *   - non-member household_id  → 400
 *   - cross-user transaction id → 400
 */
import { test, expect } from '../../fixtures/index'

const TODAY = new Date().toISOString().split('T')[0]

test.describe('Bulk set household (bank transactions)', () => {
  test('selecting multiple bank txns and choosing a target household moves them', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    const householdA = await api.createHousehold('Move From A')
    const householdB = await api.createHousehold('Move To B')

    // Seed 3 bank txns mapped to A.
    const t1 = await api.createBankTransaction({
      description: 'MOVE TXN ONE',
      amount: '11.00',
      type: 'expense',
      transaction_date: TODAY,
      household_id: householdA.id,
    })
    const t2 = await api.createBankTransaction({
      description: 'MOVE TXN TWO',
      amount: '22.00',
      type: 'expense',
      transaction_date: TODAY,
      household_id: householdA.id,
    })
    const t3 = await api.createBankTransaction({
      description: 'MOVE TXN THREE',
      amount: '33.00',
      type: 'expense',
      transaction_date: TODAY,
      household_id: householdA.id,
    })

    await page.goto(`/dashboard/expenses?household=${householdA.id}`)
    await page.waitForLoadState('networkidle')

    // Select the three seeded rows directly.
    const descriptions = ['MOVE TXN ONE', 'MOVE TXN TWO', 'MOVE TXN THREE']
    for (const desc of descriptions) {
      const row = page.locator('tbody tr.row-bank', { hasText: desc })
      await expect(row).toBeVisible()
      await row.locator('.cell-checkbox input[type="checkbox"]').check()
    }

    // The floating action bar should appear.
    const bar = page.locator('.bulk-action-bar')
    await expect(bar).toBeVisible()
    await expect(bar.locator('.bulk-count')).toContainText('3 selected')

    // Open the "Move to household..." popover.
    const moveButton = bar.getByRole('button', { name: /Move to household/i })
    await expect(moveButton).toBeVisible()
    await moveButton.click()

    const popover = page.locator('.bulk-move-popover')
    await expect(popover).toBeVisible()

    // Pick household B by name.
    const targetOption = popover
      .locator('.bulk-move-option', { hasText: 'Move To B' })
      .first()
    await expect(targetOption).toBeVisible()
    await targetOption.click()

    // Wait for the popover to close (request resolved).
    await expect(popover).not.toBeVisible({ timeout: 8000 })

    // Verify via API: each txn should now be on household B.
    for (const tid of [t1.id, t2.id, t3.id]) {
      const fresh = await api.getBankTransaction(tid)
      expect(fresh, `transaction ${tid} must still be accessible`).not.toBeNull()
      expect(fresh!.household).toBe(householdB.id)
    }
  })

  test('cannot move to a household the user is not a member of', async ({
    twoActors,
  }) => {
    const { apiA, apiB } = twoActors

    // userA's household + bank txn mapped to it.
    const householdA = await apiA.createHousehold('A only home')
    const ownTxn = await apiA.createBankTransaction({
      description: 'OWN TXN NON-MEMBER TARGET',
      amount: '12.34',
      type: 'expense',
      transaction_date: TODAY,
      household_id: householdA.id,
    })

    // userB's household — userA is NOT a member.
    const householdB = await apiB.createHousehold('B only home')

    // userA attempts to move their own txn into B's household.
    const res = await apiA.bulkSetHouseholdRaw([ownTxn.id], householdB.id)
    expect(res.status()).toBe(400)
    const body = await res.text()
    expect(body.toLowerCase()).toContain('household')

    // Verify the txn is still on householdA (no DB change).
    const fresh = await apiA.getBankTransaction(ownTxn.id)
    expect(fresh).not.toBeNull()
    expect(fresh!.household).toBe(householdA.id)
  })

  test('cross-user transaction ids are rejected', async ({ twoActors }) => {
    const { apiA, apiB } = twoActors

    // userA's setup.
    const householdA = await apiA.createHousehold('A move dest')
    const householdA2 = await apiA.createHousehold('A move src')
    const ownTxn = await apiA.createBankTransaction({
      description: 'OWN TXN CROSS USER A',
      amount: '5.00',
      type: 'expense',
      transaction_date: TODAY,
      household_id: householdA2.id,
    })

    // userB's transaction — userA must not be able to touch it.
    const householdB = await apiB.createHousehold('B home')
    const otherTxn = await apiB.createBankTransaction({
      description: 'OTHER USER TXN B',
      amount: '7.00',
      type: 'expense',
      transaction_date: TODAY,
      household_id: householdB.id,
    })

    // userA tries to bulk-move a list that includes the other user's txn id.
    const res = await apiA.bulkSetHouseholdRaw(
      [ownTxn.id, otherTxn.id],
      householdA.id,
    )
    expect(res.status()).toBe(400)

    // Atomic guarantee: userA's own txn must NOT have been moved.
    const freshOwn = await apiA.getBankTransaction(ownTxn.id)
    expect(freshOwn).not.toBeNull()
    expect(freshOwn!.household).toBe(householdA2.id)

    // userB's txn must be unchanged from B's perspective.
    const freshOther = await apiB.getBankTransaction(otherTxn.id)
    expect(freshOther).not.toBeNull()
    expect(freshOther!.household).toBe(householdB.id)
  })
})
