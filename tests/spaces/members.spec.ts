/**
 * Spaces — Member Management (Phase 01, Stories 1.3 + 1.4)
 *
 * There is no browser UI for assign/unassign — these are API-only actions.
 * Tests use Playwright's request context directly (no browser page).
 *
 * Verifies:
 * - assign_user adds a second user as member
 * - unassign_user removes a member
 * - removing the last member returns 400
 * - a non-member cannot access another user's space
 */
import { test, expect } from '../../fixtures/index'

test.describe('Space member management (API)', () => {
  test('assign_user makes the target user a member of the space', async ({ twoActors }) => {
    const { apiA, apiB } = twoActors

    const space = await apiA.createSpace('Shared Home')

    // Get user B's ID
    const userBInfo = await apiB.me()
    expect(userBInfo).not.toBeNull()
    const userBId = userBInfo!.id

    // User A assigns user B
    await apiA.assignUser(space.id, userBId)

    // User B should now see the space
    const spacesB = await apiB.listSpaces()
    expect(spacesB.map((h) => h.id)).toContain(space.id)
  })

  test('unassign_user removes a member from the space', async ({ twoActors }) => {
    const { apiA, apiB } = twoActors

    const space = await apiA.createSpace('Temp Shared')
    const userBInfo = await apiB.me()
    const userBId = userBInfo!.id

    await apiA.assignUser(space.id, userBId)

    // Verify B is now a member
    const beforeUnassign = await apiB.listSpaces()
    expect(beforeUnassign.map((h) => h.id)).toContain(space.id)

    // User A removes user B
    const unassignRes = await apiA.unassignUser(space.id, userBId)
    expect(unassignRes.status()).toBe(200)

    // User B should no longer see the space
    const afterUnassign = await apiB.listSpaces()
    expect(afterUnassign.map((h) => h.id)).not.toContain(space.id)
  })

  test('removing the last member returns 400 with error message', async ({ twoActors }) => {
    const { apiA } = twoActors

    const space = await apiA.createSpace('Solo Home')
    const userAInfo = await apiA.me()
    const userAId = userAInfo!.id

    // User A tries to remove themselves (the only member)
    const res = await apiA.unassignUser(space.id, userAId)
    expect(res.status()).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/last member/i)
  })

  test('a non-member gets 404 when directly fetching another user\'s space', async ({
    twoActors,
  }) => {
    const { apiA, apiB } = twoActors

    const spaceA = await apiA.createSpace('Private A')

    // User B tries to GET the space by ID — scoped queryset means it doesn't exist for them
    const status = await apiB.getSpaceStatus(spaceA.id)
    expect(status).toBe(404)
  })
})
