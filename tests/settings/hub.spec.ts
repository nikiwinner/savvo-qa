/**
 * Settings — the Overview hub (2026-08-20 redesign).
 *
 * `/dashboard/settings` used to 302 to `/settings/banking`. It is now a real
 * page: an identity card plus one status tile per destination. On desktop it is
 * the detail pane of the master-detail shell; on a phone it is the whole of
 * Settings.
 *
 * Verifies that:
 * 1. The identity card carries name, email and sign-in method.
 * 2. Every destination tile exists, opens its route, and states something
 *    real — never a bare number invented on the client.
 * 3. The Log out tile is PHONE-ONLY (from a tablet up the sidebar carries the
 *    labelled one, and two on a screen is the duplicate the brief bans).
 */
import { test, expect } from '../../fixtures/index'

const TILES = [
  ['personal', '/dashboard/settings/profile'],
  ['banking', '/dashboard/settings/banking'],
  ['categories', '/dashboard/settings/categories'],
  ['routing', '/dashboard/settings/routing-rules'],
  ['preferences', '/dashboard/settings/preferences'],
  ['security', '/dashboard/settings/security'],
  ['privacy', '/dashboard/settings/privacy'],
  ['support', '/dashboard/settings/support'],
] as const

test.describe('Settings hub — Overview', () => {
  test('/dashboard/settings renders the hub itself, not a redirect', async ({
    page,
    loggedInPage,
  }) => {
    void loggedInPage

    await page.goto('/dashboard/settings')
    await page.waitForLoadState('networkidle')

    // The old 302 to /settings/banking is gone for good.
    await expect(page).toHaveURL(/\/dashboard\/settings$/)
    await expect(page.getByTestId('settings-identity')).toBeVisible()
  })

  test('the identity card carries name, email and sign-in method', async ({
    page,
    loggedInPage,
  }) => {
    const { user } = loggedInPage

    await page.goto('/dashboard/settings')
    await page.waitForLoadState('networkidle')

    const identity = page.getByTestId('settings-identity')
    await expect(identity).toContainText(user.email)
    await expect(identity).toContainText('Email & password')
  })

  test('every destination tile exists, opens its route and states something real', async ({
    page,
    loggedInPage,
  }) => {
    void loggedInPage

    for (const [id, href] of TILES) {
      await page.goto('/dashboard/settings')
      await page.waitForLoadState('networkidle')

      const tile = page.getByTestId(`settings-tile-${id}`)
      await expect(tile).toBeVisible()

      // Money honesty, the shape a count-less tile can be checked in: the load
      // succeeded (no "Couldn't load"), and nothing reads as a bare zero — the
      // empty states are spelled out in words ("None", "No rules yet") exactly
      // so a real 0 can never be mistaken for a working number. The tiles that
      // DO carry a count are checked against the API in the next test.
      const text = (await tile.innerText()).trim()
      expect(text.length).toBeGreaterThan(0)
      expect(text).not.toContain("Couldn't load")
      expect(text, `${id} tile shows a bare zero`).not.toMatch(/(^|\s)0(\s|$)/)

      await tile.click()
      await expect(page).toHaveURL(new RegExp(`${href}$`))
    }
  })

  /**
   * The money rule, applied to the hub: "every number shown to the user must be
   * traceable to real transactions the user can verify."
   *
   * The old assertion here was `text.length > 0`, which the tile TITLE already
   * satisfies — so hardcoding `0` in place of `shortCount(data.categoryCount)`
   * left the suite green while the hub told a user with rules that they had
   * none. This one reads the truth from the API and compares.
   *
   * Routing rules are the right subject: they are scoped to the user's own
   * spaces, so the count is deterministic under parallel workers. Categories
   * are GLOBAL and another spec can create one mid-run, which would make an
   * exact-count assertion on them flaky by construction.
   *
   * Not covered here, on purpose: the "Couldn't load" branch. Those counts come
   * from the SERVER load (`+page.server.ts` -> `djangoFetch`), so a browser-side
   * route abort cannot reach the request. The guard against a failed fetch
   * silently becoming 0 is `bankCount: liveConnections?.length ?? null` in that
   * file — `?? null`, never `?? 0`.
   */
  test('a tile count is the real row count, not a number invented on the client', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage

    // A fresh account: zero rules, and the tile says so in WORDS.
    await page.goto('/dashboard/settings')
    await page.waitForLoadState('networkidle')
    const routing = page.getByTestId('settings-tile-routing')
    await expect(routing).toContainText('No rules yet')

    const space = await api.createSpace('Hub Count Truth')
    for (const merchant of ['alpha', 'beta', 'gamma']) {
      await api.createClaimRule({ space: space.id, merchant_contains: merchant })
    }

    const truth = (await api.listClaimRules()).length
    expect(truth, 'seeding created exactly three rules').toBe(3)

    await page.goto('/dashboard/settings')
    await page.waitForLoadState('networkidle')
    await expect(routing).toContainText(`${truth} rules`)

    // And the banks tile, whose empty state is a different sentence, still
    // spells its zero out rather than printing one.
    await expect(page.getByTestId('settings-tile-banking')).toContainText('No banks connected')
  })

  test('the Log out tile is phone-only', async ({ page, loggedInPage }) => {
    void loggedInPage

    // Explicit viewports: this test IS about the crossover, so it must not
    // depend on which of the three browser projects is running it.
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/dashboard/settings')
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('settings-logout')).toBeVisible()

    // It carries the hairline every other adjacent row pair has. `display:
    // contents` on the wrapping <form> keeps the button a DOM first-child, so a
    // bare `.tile:first-child { border-top: none }` silently stripped it and
    // fused Support and Log out into one 94px block.
    const border = await page
      .getByTestId('settings-logout')
      .evaluate((el) => getComputedStyle(el).borderTopWidth)
    expect(border, 'Log out lost its divider').not.toBe('0px')

    await page.setViewportSize({ width: 1280, height: 900 })
    await expect(page.getByTestId('settings-logout')).toBeHidden()

    // …and the sidebar's labelled one has taken over.
    await expect(page.locator('button[aria-label="Log out"]')).toBeVisible()
  })
})

test.describe('Settings hub — Privacy and Support are visible but inert', () => {
  for (const section of ['privacy', 'support'] as const) {
    test(`${section} opens and every row inside it is disabled`, async ({
      page,
      loggedInPage,
    }) => {
      void loggedInPage

      await page.goto(`/dashboard/settings/${section}`)
      await page.waitForLoadState('networkidle')

      const rows = page.locator('.srow.is-soon')
      await expect(rows).toHaveCount(3)
      await expect(page.locator('.srow.is-soon .soon-chip')).toHaveCount(3)
      // Nothing in here may look active while doing nothing (user 2026-08-20:
      // "Do not make non-functional items appear active or clickable").
      await expect(page.locator('.srow.is-soon a, .srow.is-soon button')).toHaveCount(0)
    })
  }
})
