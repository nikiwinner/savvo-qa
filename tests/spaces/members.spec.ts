/**
 * Spaces — Member Management (Phase 01, Stories 1.3 + 1.4)
 *
 * There is no browser UI for assign/unassign — these are API-only actions.
 * Tests use Playwright's request context directly (no browser page).
 *
 * Verifies:
 * - assign_user adds a second user as member
 * - a member can leave (remove self) but cannot evict another member (A7)
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

  test('a member can leave but cannot evict another member', async ({ twoActors }) => {
    const { apiA, apiB } = twoActors

    const space = await apiA.createSpace('Temp Shared')
    const userBId = (await apiB.me())!.id

    await apiA.assignUser(space.id, userBId)
    expect((await apiB.listSpaces()).map((h) => h.id)).toContain(space.id)

    // A7: A cannot evict B — only self-removal is allowed.
    const evict = await apiA.unassignUser(space.id, userBId)
    expect(evict.status()).toBe(403)
    expect((await apiB.listSpaces()).map((h) => h.id)).toContain(space.id)

    // But B can leave the space (remove themselves).
    const leave = await apiB.unassignUser(space.id, userBId)
    expect(leave.status()).toBe(200)
    expect((await apiB.listSpaces()).map((h) => h.id)).not.toContain(space.id)
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
