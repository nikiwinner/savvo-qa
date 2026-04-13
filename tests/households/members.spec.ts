/**
 * Households — Member Management (Phase 01, Stories 1.3 + 1.4)
 *
 * There is no browser UI for assign/unassign — these are API-only actions.
 * Tests use Playwright's request context directly (no browser page).
 *
 * Verifies:
 * - assign_user adds a second user as member
 * - unassign_user removes a member
 * - removing the last member returns 400
 * - a non-member cannot access another user's household
 */
import { test, expect } from '../../fixtures/index'

test.describe('Household member management (API)', () => {
  test('assign_user makes the target user a member of the household', async ({ twoActors }) => {
    const { apiA, apiB } = twoActors

    const household = await apiA.createHousehold('Shared Home')

    // Get user B's ID
    const userBInfo = await apiB.me()
    expect(userBInfo).not.toBeNull()
    const userBId = userBInfo!.id

    // User A assigns user B
    await apiA.assignUser(household.id, userBId)

    // User B should now see the household
    const householdsB = await apiB.listHouseholds()
    expect(householdsB.map((h) => h.id)).toContain(household.id)
  })

  test('unassign_user removes a member from the household', async ({ twoActors }) => {
    const { apiA, apiB } = twoActors

    const household = await apiA.createHousehold('Temp Shared')
    const userBInfo = await apiB.me()
    const userBId = userBInfo!.id

    await apiA.assignUser(household.id, userBId)

    // Verify B is now a member
    const beforeUnassign = await apiB.listHouseholds()
    expect(beforeUnassign.map((h) => h.id)).toContain(household.id)

    // User A removes user B
    const unassignRes = await apiA.unassignUser(household.id, userBId)
    expect(unassignRes.status()).toBe(200)

    // User B should no longer see the household
    const afterUnassign = await apiB.listHouseholds()
    expect(afterUnassign.map((h) => h.id)).not.toContain(household.id)
  })

  test('removing the last member returns 400 with error message', async ({ twoActors }) => {
    const { apiA } = twoActors

    const household = await apiA.createHousehold('Solo Home')
    const userAInfo = await apiA.me()
    const userAId = userAInfo!.id

    // User A tries to remove themselves (the only member)
    const res = await apiA.unassignUser(household.id, userAId)
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/last member/i)
  })

  test('a non-member gets 404 when directly fetching another user\'s household', async ({
    twoActors,
  }) => {
    const { apiA, apiB } = twoActors

    const householdA = await apiA.createHousehold('Private A')

    // User B tries to GET the household by ID — scoped queryset means it doesn't exist for them
    const status = await apiB.getHouseholdStatus(householdA.id)
    expect(status).toBe(404)
  })
})
