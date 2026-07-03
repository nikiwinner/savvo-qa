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
 * The modal-geometry assertion (Story 22.8) branches on the viewport width so all
 * three projects self-select the right expectation: `mobile-safari` (iPhone 13,
 * 390px) → near-fullscreen (fixed 10px inset); `chromium` (1280px) + `tablet`
 * (iPad Pro 11, 834px) → a centered fixed 680×640 frame. The old docked /
 * bottom-sheet contract is retired.
 */
import { test, expect } from '../../fixtures/index'
import { CurriculumMapPage } from '../../pages/CurriculumMapPage'
import { seedPlayerFixtures, makeFixtureLevelPlayable } from '../../helpers/curriculumFixtures'

// Step-content leak canaries — full instruction fragments from the seeded mission
// steps. A NON-PLAYABLE (`coming_soon`) node's host shows the LEVEL title + a
// placeholder — NEVER step content (playable nodes now render their own content).
const STEP_CONTENT_CANARIES = ['connect your bank', 'Say it out loud', '24-hour pause']

test.describe('Curriculum — step-player host', () => {
  test('tapping a current node opens the player host and it dismisses', async ({ page, loggedInPage: _ }) => {
    test.slow()
    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    const node = map.nodesByStatus('current').first()
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
    // a placeholder with the level title only — never any step content.
    const comingSoon = map.nodesByStatus('coming_soon').first()
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
    // "≈ 680 (± a couple px)" spec wording.
    const DIM_TOL = 3

    // --- Step A: the Lesson (short deck) — measure the frame ------------------
    await map.nodesInTopic('smart-spending', 'current').first().click()
    await expect(map.stepPlayerHost).toBeVisible()
    await expect(map.stepPlayer).toBeVisible({ timeout: 45_000 })
    await page.waitForTimeout(400) // let the dialog-pop + card transitions settle
    const boxA = await map.stepPlayerHost.boundingBox()
    expect(boxA).not.toBeNull()
    const a = boxA!

    if (vw <= 540) {
      // Mobile ≤540px: near-fullscreen — the dialog fills the viewport minus a
      // FIXED 10px inset on all sides (no bottom-sheet, no bottom-anchoring).
      expect(Math.abs(a.x - 10)).toBeLessThanOrEqual(TOL)
      expect(Math.abs(a.y - 10)).toBeLessThanOrEqual(TOL)
      expect(Math.abs(a.width - (vw - 20))).toBeLessThanOrEqual(DIM_TOL)
      expect(Math.abs(a.height - (vh - 20))).toBeLessThanOrEqual(DIM_TOL)
    } else {
      // Desktop / tablet: a CENTERED fixed frame — width min(680, vw-40), height
      // min(640, vh-80) — with a clear gap to the right edge (the dock is gone).
      const expectedW = Math.min(680, vw - 40)
      const expectedH = Math.min(640, vh - 80)
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

    await map.nodesInTopic('earning-money', 'current').first().click()
    await expect(map.stepPlayerHost).toBeVisible()
    await expect(map.stepPlayer).toBeVisible({ timeout: 45_000 })
    await page.waitForTimeout(400) // settle before comparing the frame to A
    const boxB = await map.stepPlayerHost.boundingBox()
    expect(boxB).not.toBeNull()
    const b = boxB!

    // Byte-identical frame regardless of the step's content length.
    expect(Math.abs(a.x - b.x)).toBeLessThanOrEqual(1)
    expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(1)
    expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(1)
    expect(Math.abs(a.height - b.height)).toBeLessThanOrEqual(1)
  })

  test('a locked node does not open the host', async ({ page, loggedInPage: _ }) => {
    const map = new CurriculumMapPage(page)
    await map.goto()

    // A locked step-bearing node inside the (visible, unlocked) smart-spending topic.
    const locked = map.nodesInTopic('smart-spending', 'locked').first()
    await expect(locked).toBeVisible()

    // A locked node is non-interactive (a Tooltip explains the prerequisite) —
    // force past actionability checks to prove the host still never opens.
    await locked.click({ force: true })
    await expect(map.stepPlayerHost).toBeHidden()
  })
})
