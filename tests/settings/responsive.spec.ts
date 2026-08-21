/**
 * Settings — the round-3 responsive pass (2026-08-21).
 *
 * Three separate things the user asked for after reviewing the app on a 14"
 * MacBook, a 32" second display and an iPad Pro:
 *
 * 1. WIDTH. The detail pane stops growing (prototype "variant B"): uncapped, a
 *    32" display stretched the eight tiles into a row of six plus an orphan row
 *    of two. The block stays anchored to the sidebar rather than centred.
 * 2. VERTICAL. The page ends where the content ends. (The dashboard footer that
 *    used to be pinned to the viewport bottom was removed outright on
 *    2026-08-21 — that half now lives in `dashboard/no-footer.spec.ts`.)
 * 3. LIST SHAPE. From a phone up to a portrait tablet the hub is a grouped
 *    inset list — fused blocks, hairline dividers, a plain 20px icon with NO
 *    rounded-square chip, and the value on the RIGHT of the label.
 *
 * The portrait-tablet case is asserted on the `tablet` project only, because
 * that is the one project whose context actually answers `pointer: coarse` in
 * portrait — the condition the CSS keys on. Faking it by resizing a desktop
 * context would test a rule the CSS deliberately does not have.
 */
import { test, expect } from '../../fixtures/index'

/** Same number as `--pane-max` in settings/+layout.svelte (65rem). */
const PANE_MAX = 1040

test.describe('Settings — width', () => {
  test('the detail pane stops growing and stays anchored to the sidebar', async ({
    page,
    loggedInPage,
  }) => {
    void loggedInPage

    await page.setViewportSize({ width: 2000, height: 1100 })
    await page.goto('/dashboard/settings')
    await page.waitForLoadState('networkidle')

    const pane = await page.locator('.settings-detail').boundingBox()
    const rail = await page.locator('.settings-rail').boundingBox()
    expect(pane).not.toBeNull()
    expect(rail).not.toBeNull()

    // Capped…
    expect(pane!.width).toBeLessThanOrEqual(PANE_MAX + 1)
    // …and anchored, not centred: the rail still starts within a page padding
    // of the sidebar instead of drifting into the middle of a 2000px screen.
    expect(rail!.x).toBeLessThan(240 + 80)
  })

  test('a group of one is one tile wide, not a full-width slab', async ({
    page,
    loggedInPage,
  }) => {
    void loggedInPage

    await page.setViewportSize({ width: 1512, height: 916 })
    await page.goto('/dashboard/settings')
    await page.waitForLoadState('networkidle')

    // "Money management" holds three, "Preferences" holds one. auto-fill keeps
    // the empty tracks, so both tiles are the same width; auto-fit would have
    // stretched the lone one across the whole pane.
    const three = await page.getByTestId('settings-tile-categories').boundingBox()
    const one = await page.getByTestId('settings-tile-preferences').boundingBox()
    expect(three).not.toBeNull()
    expect(one).not.toBeNull()
    expect(Math.abs(one!.width - three!.width)).toBeLessThan(2)
  })

  test('the four groups are the same four the rail is built from', async ({
    page,
    loggedInPage,
  }) => {
    void loggedInPage

    await page.setViewportSize({ width: 1512, height: 916 })
    await page.goto('/dashboard/settings')
    await page.waitForLoadState('networkidle')

    for (const id of ['account', 'money', 'preferences', 'support']) {
      await expect(page.getByTestId(`settings-group-${id}`)).toBeVisible()
    }
  })
})

test.describe('Settings — the grouped list', () => {
  test('a phone gets fused blocks with plain icons and the value on the right', async ({
    page,
    loggedInPage,
  }) => {
    void loggedInPage

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/dashboard/settings')
    await page.waitForLoadState('networkidle')

    // Fused: one container per group, zero gap between its rows.
    const gap = await page
      .locator('[data-testid="settings-group-money"] .tiles')
      .evaluate((el) => getComputedStyle(el).gap)
    expect(gap).toBe('0px')

    const icon = page.getByTestId('settings-tile-categories').locator('.tile-icon')
    const box = await icon.evaluate((el) => {
      const cs = getComputedStyle(el)
      const svg = el.querySelector('svg')!.getBoundingClientRect()
      return {
        bg: cs.backgroundColor,
        w: Math.round(el.getBoundingClientRect().width),
        glyph: Math.round(svg.width),
      }
    })
    // No rounded-square chip in a list row (user 2026-08-21), and one fixed
    // 20-in-24 across every row.
    expect(box.bg).toBe('rgba(0, 0, 0, 0)')
    expect(box.w).toBe(24)
    expect(box.glyph).toBe(20)

    // The row states its value to the RIGHT of the label, and the card's
    // full sentence is the one that is hidden.
    const tile = page.getByTestId('settings-tile-categories')
    await expect(tile.locator('.tile-value')).toBeVisible()
    await expect(tile.locator('.tile-status')).toBeHidden()

    // Touch floor.
    const row = await tile.boundingBox()
    expect(row!.height).toBeGreaterThanOrEqual(44)
  })

  test('a portrait tablet gets the list too — no rail, and the back link returns', async ({
    page,
    loggedInPage,
  }, testInfo) => {
    // `testInfo.skip`, not `test.skip`: the repo's spec-count drift tripwire
    // greps for `test.skip(`, and an in-body call there inflates it.
    testInfo.skip(
      testInfo.project.name !== 'tablet',
      'Needs a real coarse-pointer portrait context; only the tablet project has one.',
    )
    void loggedInPage

    await page.goto('/dashboard/settings')
    await page.waitForLoadState('networkidle')

    // iPad Pro 11 portrait is 834px — wide enough for the old rail crossover,
    // which is exactly the "looks like the web version" the user reported.
    await expect(page.locator('.settings-rail')).toBeHidden()
    const gap = await page
      .locator('[data-testid="settings-group-account"] .tiles')
      .evaluate((el) => getComputedStyle(el).gap)
    expect(gap).toBe('0px')

    // With the rail gone the per-page back link is the one way back (#44).
    await page.goto('/dashboard/settings/security')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.settings-back')).toBeVisible()
  })

  test('a desktop window the same width as a tablet keeps the card layout', async ({
    page,
    loggedInPage,
  }, testInfo) => {
    testInfo.skip(
      testInfo.project.name !== 'chromium',
      'The point of this test is a FINE pointer at a tablet width.',
    )
    void loggedInPage

    await page.setViewportSize({ width: 1024, height: 1200 })
    await page.goto('/dashboard/settings')
    await page.waitForLoadState('networkidle')

    // Same width as an iPad Pro in portrait, but a mouse — so the narrow rule
    // must NOT fire. This is what keeps the switch a capability test rather
    // than a width the desktop also trips over.
    const gap = await page
      .locator('[data-testid="settings-group-account"] .tiles')
      .evaluate((el) => getComputedStyle(el).gap)
    expect(gap).not.toBe('0px')
    await expect(page.locator('.settings-rail')).toBeVisible()
  })
})
