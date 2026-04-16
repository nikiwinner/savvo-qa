import { test as base } from '@playwright/test'
import { ApiHelper, UserRecord, HouseholdRecord, CategoryRecord, uniqueUser } from '../helpers/api'

export { expect } from '@playwright/test'
export type { UserRecord, HouseholdRecord, CategoryRecord }

type AppFixtures = {
  /** A browser page with a freshly-created user already logged in. */
  loggedInPage: {
    user: UserRecord
    api: ApiHelper
  }
  /**
   * Two separate authenticated API actors (no browser page for the second).
   * Useful for data scoping tests.
   */
  twoActors: {
    userA: UserRecord
    apiA: ApiHelper
    userB: UserRecord
    apiB: ApiHelper
  }
}

export const test = base.extend<AppFixtures>({
  loggedInPage: async ({ page, context, playwright }, use) => {
    const reqCtx = await playwright.request.newContext()
    const api = new ApiHelper(reqCtx)
    const user = uniqueUser()

    await api.signup(user)
    await api.login(user.email, user.password)

    // Copy session + CSRF cookies into the browser context
    const cookies = await api.cookies()
    await context.addCookies(cookies)

    await use({ user, api })

    await reqCtx.dispose()
  },

  twoActors: async ({ playwright }, use) => {
    const ctxA = await playwright.request.newContext()
    const ctxB = await playwright.request.newContext()
    const apiA = new ApiHelper(ctxA)
    const apiB = new ApiHelper(ctxB)
    const userA = uniqueUser('alice')
    const userB = uniqueUser('bob')

    await apiA.signup(userA)
    await apiA.login(userA.email, userA.password)

    await apiB.signup(userB)
    await apiB.login(userB.email, userB.password)

    await use({ userA, apiA, userB, apiB })

    await ctxA.dispose()
    await ctxB.dispose()
  },
})
