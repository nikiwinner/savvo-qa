/**
 * Curriculum — step-player host (Phase 21, Story 21.4)
 *
 * Tapping a node opens the EMPTY step-player host shell (the real Lesson/Quiz/
 * Mission players land in Phase 22). The host is docked on desktop, a bottom-sheet
 * on mobile (≤540px), leak-safe (no step content — the map endpoint carries none),
 * and dismissible (`step-host-close` / backdrop / `Esc`). A locked node opens
 * nothing (a Tooltip explains the prerequisite).
 *
 * The mobile-vs-desktop layout assertion branches on the viewport width so all
 * three projects self-select the right expectation: `mobile-safari` (iPhone 13,
 * 390px) → bottom-sheet; `chromium` (1280px) + `tablet` (iPad Pro 11, 834px) →
 * docked side panel (the ≤540px breakpoint, Story 21.4).
 */
import { test, expect } from '../../fixtures/index'
import { CurriculumMapPage } from '../../pages/CurriculumMapPage'

// Step-content leak canaries — full instruction fragments from the seeded mission
// steps. The host shows the LEVEL title + a placeholder — NEVER step content.
const STEP_CONTENT_CANARIES = ['connect your bank', 'Say it out loud', '24-hour pause']

test.describe('Curriculum — step-player host', () => {
  test('tapping a node opens the empty step-player host and it dismisses', async ({ page, loggedInPage: _ }) => {
    const map = new CurriculumMapPage(page)
    await map.goto()

    const node = map.nodesByStatus('current').first()
    await expect(node).toBeVisible()
    await node.click()

    // The host opens with the level title + a placeholder body — never step content.
    await expect(map.stepPlayerHost).toBeVisible()
    await expect(map.stepPlayerHost).not.toBeEmpty()
    const hostText = await map.stepPlayerHost.innerText()
    for (const canary of STEP_CONTENT_CANARIES) {
      expect(hostText).not.toContain(canary)
    }

    // The close button dismisses it.
    await map.stepHostClose.click()
    await expect(map.stepPlayerHost).toBeHidden()

    // Re-open, then Esc dismisses it (focus-trapped + keyboard-dismissible).
    await node.click()
    await expect(map.stepPlayerHost).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(map.stepPlayerHost).toBeHidden()
  })

  test('the host is a bottom-sheet on mobile and docked on desktop', async ({ page, loggedInPage: _ }) => {
    const map = new CurriculumMapPage(page)
    await map.goto()

    await map.nodesByStatus('current').first().click()
    await expect(map.stepPlayerHost).toBeVisible()

    const viewport = page.viewportSize()
    expect(viewport).not.toBeNull()
    const vw = viewport!.width
    const vh = viewport!.height

    const box = await map.stepPlayerHost.boundingBox()
    expect(box).not.toBeNull()
    const b = box!

    // Generous tolerances — assert the DISTINGUISHING geometry of each layout, not
    // exact pixels, so minor padding/margins don't flake the check.
    if (vw <= 540) {
      // Mobile bottom-sheet: spans (near) full width + anchored to the viewport bottom.
      expect(b.width).toBeGreaterThanOrEqual(vw * 0.8)
      expect(b.y + b.height).toBeGreaterThanOrEqual(vh * 0.9)
      // DISTINGUISHING from the desktop docked panel (which would also pass the
      // two checks above on a 390px viewport): the sheet is height:auto capped at
      // 82vh — never full-height — and is left-anchored (left:0), while the
      // docked panel is 100vh tall and right-anchored with a left gap.
      expect(b.height).toBeLessThanOrEqual(vh * 0.85)
      expect(b.x).toBeLessThanOrEqual(1)
    } else {
      // Desktop / tablet docked side panel: (near) full height, narrower than the
      // viewport, anchored to the RIGHT edge.
      expect(b.height).toBeGreaterThanOrEqual(vh * 0.8)
      expect(b.width).toBeLessThanOrEqual(vw * 0.75)
      expect(b.x + b.width).toBeGreaterThanOrEqual(vw * 0.9)
    }
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
