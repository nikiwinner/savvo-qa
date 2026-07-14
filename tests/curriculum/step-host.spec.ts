/**
 * Curriculum — step-player host (Phase 21 shell, Phase 22 fill)
 *
 * Phase 22 fills the host: tapping a `current` node now fetches the leak-safe
 * level manifest and mounts a real player (`step-player`) for the active step —
 * no longer the empty "opens next" placeholder. Story 22.8 re-skinned the shell
 * into a centered fixed-frame modal (SpaceSplitModal chrome), dismissible
 * (`step-host-close` / backdrop / `Esc`). A locked node still opens nothing, and
 * a non-playable (`coming_soon`) node still shows a leak-safe placeholder with
 * NO step content.
 *
 * The modal-geometry assertion (Story 22.8; enlarged to a stage in Story 27.3)
 * branches on the viewport width so all three projects self-select the right
 * expectation: `mobile-safari` (iPhone 13, 390px) → near-fullscreen (fixed 10px
 * inset); `chromium` (1280px) + `tablet` (iPad Pro 11, 834px) → a centered fixed
 * `min(1040, 0.9·vw)` × `min(800, 0.85·vh)` stage frame. The old docked /
 * bottom-sheet contract is retired.
 *
 * The geometry test emulates `prefers-reduced-motion: reduce` so the dialog-pop
 * settles instantly (no scale/translate in flight), then reads the frame via
 * web-first `boundingBox` stability polling — there are no fixed timeout sleeps
 * (folded feedback B21).
 */
import type { Locator } from '@playwright/test'
import { test, expect } from '../../fixtures/index'
import { CurriculumMapPage } from '../../pages/CurriculumMapPage'
import { seedPlayerFixtures, makeFixtureLevelPlayable } from '../../helpers/curriculumFixtures'

// Read a locator's boundingBox once it has SETTLED — two consecutive reads that
// agree (to the rounded pixel) with a non-zero width. Under emulated reduced
// motion the dialog-pop is instant, so this returns on the first stable frame
// with no fixed sleep (web-first replacement for the old blind timeout).
async function readSettledBox(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  let prev = ''
  await expect
    .poll(async () => {
      const bb = await locator.boundingBox()
      if (!bb || bb.width <= 0) return false
      const key = `${Math.round(bb.x)},${Math.round(bb.y)},${Math.round(bb.width)},${Math.round(bb.height)}`
      const settled = key === prev
      prev = key
      return settled
    })
    .toBe(true)
  const bb = await locator.boundingBox()
  expect(bb).not.toBeNull()
  return bb!
}

// Step-content leak canaries — full instruction fragments from the seeded mission
// steps. A NON-PLAYABLE (`coming_soon`) node's host shows the LEVEL title + a
// placeholder — NEVER step content (playable nodes now render their own content).
const STEP_CONTENT_CANARIES = ['connect your bank', 'Say it out loud', '24-hour pause']

test.describe('Curriculum — step-player host', () => {
  test('tapping a current node opens the player host and it dismisses', async ({ page, loggedInPage: _ }) => {
    test.slow()
    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    // The current node's path lives inside focus mode — zoom into the chapter that
    // holds the first current node to bring it on-stage, then tap it.
    const node = await map.revealFirstNodeByStatus('current')
    await expect(node).toBeVisible()
    await node.click()

    // The host opens WITH a mounted step-player (Phase 22 — no longer empty).
    await expect(map.stepPlayerHost).toBeVisible()
    await expect(map.stepPlayer).toBeVisible({ timeout: 45_000 })

    // The close button dismisses it.
    await map.stepHostClose.click()
    await expect(map.stepPlayerHost).toBeHidden()

    // Re-open, then Esc dismisses it (focus-trapped + keyboard-dismissible).
    await node.click()
    await expect(map.stepPlayerHost).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(map.stepPlayerHost).toBeHidden()

    // Leak-safety now lives on the NON-playable nodes: a `coming_soon` node opens
    // a placeholder with the level title only — never any step content. It may
    // live in a collapsed island (Phase 27 accordion) — expand its island first.
    const comingSoon = await map.revealFirstNodeByStatus('coming_soon')
    await expect(comingSoon).toBeVisible()
    await comingSoon.click()
    await expect(map.stepPlayerHost).toBeVisible()
    await expect(map.stepPlayer).toHaveCount(0)
    const hostText = await map.stepPlayerHost.innerText()
    for (const canary of STEP_CONTENT_CANARIES) {
      expect(hostText).not.toContain(canary)
    }
    await map.stepHostClose.click()
    await expect(map.stepPlayerHost).toBeHidden()
  })

  test('the host opens as a stable centered modal (near-fullscreen on mobile)', async ({
    page,
    loggedInPage,
  }) => {
    test.slow()
    const { api } = loggedInPage

    // Measure the stage frame under emulated reduced motion so the dialog-pop is
    // instant (no scale/translate mid-flight) — the frame is at its final size on
    // first paint, and `readSettledBox` confirms it with a web-first stability
    // poll instead of a blind sleep (B21).
    await page.emulateMedia({ reducedMotion: 'reduce' })

    // Seed the fixtures + make the lesson the ONLY incomplete step in
    // smart-spending / name-what-you-buy, so that topic exposes a `current` node
    // that mounts the Lesson player. The real self_attest `earning-inventory`
    // mission stays a fresh user's `current` node in earning-money — a SECOND
    // node whose content length differs sharply (deck vs prose checklist).
    const { lesson } = await seedPlayerFixtures(api)
    await makeFixtureLevelPlayable(api, lesson.step_id)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    const viewport = page.viewportSize()
    expect(viewport).not.toBeNull()
    const vw = viewport!.width
    const vh = viewport!.height
    const TOL = 2
    // Dimension checks get a touch more slack: sub-pixel device rounding + the
    // "≈ min(1040, 0.9·vw) (± a couple px)" spec wording.
    const DIM_TOL = 3

    // --- Step A: the Lesson (short deck) — measure the frame ------------------
    // smart-spending sits in a collapsed island for a fresh user — expand it first.
    await map.expandIslandFor('smart-spending')
    await map.nodesInTopic('smart-spending', 'current').first().click()
    await expect(map.stepPlayerHost).toBeVisible()
    await expect(map.stepPlayer).toBeVisible({ timeout: 45_000 })
    const a = await readSettledBox(map.stepPlayerHost)

    if (vw <= 540) {
      // Mobile ≤540px: near-fullscreen — the dialog fills the viewport minus a
      // FIXED 10px inset on all sides (no bottom-sheet, no bottom-anchoring).
      expect(Math.abs(a.x - 10)).toBeLessThanOrEqual(TOL)
      expect(Math.abs(a.y - 10)).toBeLessThanOrEqual(TOL)
      expect(Math.abs(a.width - (vw - 20))).toBeLessThanOrEqual(DIM_TOL)
      expect(Math.abs(a.height - (vh - 20))).toBeLessThanOrEqual(DIM_TOL)
    } else {
      // Desktop / tablet: a CENTERED stage frame — width min(1040, 0.9·vw),
      // height min(800, 0.85·vh) — with a clear gap to the right edge (dock gone).
      const expectedW = Math.min(1040, Math.round(0.9 * vw))
      const expectedH = Math.min(800, Math.round(0.85 * vh))
      expect(Math.abs(a.width - expectedW)).toBeLessThanOrEqual(DIM_TOL)
      expect(Math.abs(a.height - expectedH)).toBeLessThanOrEqual(DIM_TOL)
      // Horizontally centered …
      expect(Math.abs(a.x - (vw - a.width) / 2)).toBeLessThanOrEqual(TOL)
      // … and NOT flush to the right edge (would be true of the retired dock).
      expect(a.x + a.width).toBeLessThanOrEqual(vw - 20)
    }

    // --- Frame stability: a DIFFERENT step (the earning-inventory mission, with
    // a very different content length) yields the SAME dialog box -------------
    await map.stepHostClose.click()
    await expect(map.stepPlayerHost).toBeHidden()

    await map.expandIslandFor('earning-money')
    await map.nodesInTopic('earning-money', 'current').first().click()
    await expect(map.stepPlayerHost).toBeVisible()
    await expect(map.stepPlayer).toBeVisible({ timeout: 45_000 })
    const b = await readSettledBox(map.stepPlayerHost)

    // Byte-identical frame regardless of the step's content length.
    expect(Math.abs(a.x - b.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(1)
    expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(1)
    expect(Math.abs(a.height - b.height)).toBeLessThanOrEqual(1)
  })

  test('a locked node does not open the host', async ({ page, loggedInPage: _ }) => {
    const map = new CurriculumMapPage(page)
    await map.goto()

    // A locked step-bearing node inside the smart-spending topic — expand its
    // (collapsed) island so the node is rendered/visible before the click.
    await map.expandIslandFor('smart-spending')
    const locked = map.nodesInTopic('smart-spending', 'locked').first()
    await expect(locked).toBeVisible()

    // A locked node is non-interactive (a Tooltip explains the prerequisite) —
    // force past actionability checks to prove the host still never opens.
    await locked.click({ force: true })
    await expect(map.stepPlayerHost).toBeHidden()
  })
})
