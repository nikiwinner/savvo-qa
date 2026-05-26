/**
 * Spaces — Data Scoping (Phase 01, Stories 1.1 + 1.2)
 *
 * Verifies that:
 * 1. A newly created space is immediately visible (auto-assign on create, Story 1.2).
 * 2. A user sees only their own spaces — not those of other users (Story 1.1).
 */
import { test, expect } from '../../fixtures/index'
import { SpacesPage } from '../../pages/SpacesPage'
import { ApiHelper, uniqueUser } from '../../helpers/api'

test.describe('Space data scoping', () => {
  test('newly created space is immediately visible in the list (auto-assign)', async ({
    page,
    loggedInPage: _,
  }) => {
    const spaces = new SpacesPage(page)
    await spaces.goto()

    // Before creation: empty
    await expect(spaces.emptyState).toBeVisible()

    await spaces.createSpace('My First Home')

    // After creation: appears immediately — auto-assign worked
    await expect(spaces.card('My First Home')).toBeVisible()
    await expect(spaces.emptyState).not.toBeVisible()
  })

  test("user B's space list does not contain user A's spaces", async ({
    page,
    context,
    loggedInPage,
    playwright,
  }) => {
    // User A (loggedInPage) creates a space
    const { api: apiA } = loggedInPage
    await apiA.createSpace('User A Private Space')

    // Create user B separately and log in as user B in the browser
    const ctxB = await playwright.request.newContext()
    const apiB = new ApiHelper(ctxB)
    const userB = uniqueUser('bob')
    await apiB.signup(userB)
    await apiB.login(userB.email, userB.password)

    // Replace browser cookies with user B's session
    const cookiesB = await apiB.cookies()
    await context.clearCookies()
    await context.addCookies(cookiesB)

    // Navigate as user B
    const spaces = new SpacesPage(page)
    await spaces.goto()

    // User B should see empty state — no space cards at all
    await expect(spaces.emptyState).toBeVisible()
    await expect(page.locator('.space-card')).toHaveCount(0)

    await ctxB.dispose()
  })

  test("user A does not see user B's space via GET /api/spaces/", async ({
    twoActors,
  }) => {
    const { apiA, apiB } = twoActors

    // User B creates a space
    const spaceB = await apiB.createSpace('Bob Space')

    // User A fetches the space list — should not contain Bob's space
    const spacesA = await apiA.listSpaces()
    const ids = spacesA.map((h) => h.id)

    expect(ids).not.toContain(spaceB.id)
  })

  test('each user only sees their own spaces after both create one', async ({ twoActors }) => {
    const { apiA, apiB } = twoActors

    const spaceA = await apiA.createSpace('Alice Home')
    const spaceB = await apiB.createSpace('Bob Home')

    const listA = await apiA.listSpaces()
    const listB = await apiB.listSpaces()

    expect(listA.map((h) => h.id)).toContain(spaceA.id)
    expect(listA.map((h) => h.id)).not.toContain(spaceB.id)

    expect(listB.map((h) => h.id)).toContain(spaceB.id)
    expect(listB.map((h) => h.id)).not.toContain(spaceA.id)
  })
})
