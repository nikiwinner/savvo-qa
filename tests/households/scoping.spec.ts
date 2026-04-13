/**
 * Households — Data Scoping (Phase 01, Stories 1.1 + 1.2)
 *
 * Verifies that:
 * 1. A newly created household is immediately visible (auto-assign on create, Story 1.2).
 * 2. A user sees only their own households — not those of other users (Story 1.1).
 */
import { test, expect } from '../../fixtures/index'
import { HouseholdsPage } from '../../pages/HouseholdsPage'
import { ApiHelper, uniqueUser } from '../../helpers/api'

test.describe('Household data scoping', () => {
  test('newly created household is immediately visible in the list (auto-assign)', async ({
    page,
    loggedInPage: _,
  }) => {
    const households = new HouseholdsPage(page)
    await households.goto()

    // Before creation: empty
    await expect(households.emptyState).toBeVisible()

    await households.createHousehold('My First Home')

    // After creation: appears immediately — auto-assign worked
    await expect(households.card('My First Home')).toBeVisible()
    await expect(households.emptyState).not.toBeVisible()
  })

  test("user B's household list does not contain user A's households", async ({
    page,
    context,
    loggedInPage,
    playwright,
  }) => {
    // User A (loggedInPage) creates a household
    const { api: apiA } = loggedInPage
    await apiA.createHousehold('User A Private Household')

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
    const households = new HouseholdsPage(page)
    await households.goto()

    // User B should see empty state — no household cards at all
    await expect(households.emptyState).toBeVisible()
    await expect(page.locator('.household-card')).toHaveCount(0)

    await ctxB.dispose()
  })

  test("user A does not see user B's household via GET /api/households/", async ({
    twoActors,
  }) => {
    const { apiA, apiB } = twoActors

    // User B creates a household
    const householdB = await apiB.createHousehold('Bob Household')

    // User A fetches the household list — should not contain Bob's household
    const householdsA = await apiA.listHouseholds()
    const ids = householdsA.map((h) => h.id)

    expect(ids).not.toContain(householdB.id)
  })

  test('each user only sees their own households after both create one', async ({ twoActors }) => {
    const { apiA, apiB } = twoActors

    const householdA = await apiA.createHousehold('Alice Home')
    const householdB = await apiB.createHousehold('Bob Home')

    const listA = await apiA.listHouseholds()
    const listB = await apiB.listHouseholds()

    expect(listA.map((h) => h.id)).toContain(householdA.id)
    expect(listA.map((h) => h.id)).not.toContain(householdB.id)

    expect(listB.map((h) => h.id)).toContain(householdB.id)
    expect(listB.map((h) => h.id)).not.toContain(householdA.id)
  })
})
