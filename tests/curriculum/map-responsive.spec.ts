/**
 * Curriculum — the world map fits its frame at every screen size
 *
 * The world map places its 9 chapter-islands from CSS alone: a lane offset
 * (`--lane-offset`) and a row pitch (`--row-pitch`), both resolved from the
 * constants `CurriculumMap.svelte` emits; the compact layout re-derives the
 * pitch from `--island-size`. Three things can silently break in that
 * arrangement, and each has already broken once:
 *
 * 1. CLIPPING. `.map-frame` is `overflow: hidden`, so a section box that misses
 *    the frame is not a horizontal scroll anybody can see — it is a chapter card
 *    with its right edge sliced off (reported on a 390px phone: the frame ended
 *    at x=374 while the active section ran to x=390). The
 *    `no-horizontal-overflow` sweep cannot catch this: the frame swallows the
 *    overflow before it ever reaches the page. Hence a containment assertion.
 * 2. DRIFT. The road is one stretched SVG (`preserveAspectRatio="none"`), so it
 *    threads the islands only while its box width matches the lane offset the
 *    islands use. An `<svg>` is a REPLACED element — set `left` + `right` on it
 *    and the pair is over-constrained, the intrinsic 900px width wins and the
 *    road quietly detaches from the islands. Hence a threading assertion.
 * 3. LAYOUT CHOICE. Phones AND tablets get the compact layout whatever their
 *    pixel count — the condition is `pointer: coarse`, not a width. On an iPad
 *    (834px portrait, 1194px landscape) the width alone would say "desktop".
 *
 * Every assertion is read from the LIVE box model, so it holds in all three
 * browser projects at their own viewports.
 */
import { test, expect } from '../../fixtures/index'
import { CurriculumMapPage } from '../../pages/CurriculumMapPage'

/** LANE_STEP / WORLD_W in `CurriculumMap.svelte` — the lane's share of the stage. */
const LANE_FRACTION = 240 / 900

interface WorldGeometry {
  coarsePointer: boolean
  frame: { left: number; right: number; top: number }
  rail: { left: number; top: number; bottom: number } | null
  boxes: { left: number; right: number }[]
  centres: number[]
  road: { left: number; width: number }
  card: { left: number; right: number; width: number } | null
  activeIsland: number | null
}

async function readWorldOnce(page: import('@playwright/test').Page): Promise<WorldGeometry> {
  return page.evaluate(() => {
    const rect = (sel: string): DOMRect | null => document.querySelector(sel)?.getBoundingClientRect() ?? null
    const frame = rect('.map-frame')
    const road = rect('.world-road')
    if (!frame || !road) throw new Error('world map is not rendered')
    const sections = [...document.querySelectorAll('[data-testid="map-section"]')]
    const rail = rect('.rail')
    const card = rect('[data-testid="chapter-card"]')
    return {
      coarsePointer: window.matchMedia('(pointer: coarse)').matches,
      frame: { left: frame.left, right: frame.right, top: frame.top },
      rail: rail ? { left: rail.left, top: rail.top, bottom: rail.bottom } : null,
      boxes: sections.map((s) => {
        const b = s.getBoundingClientRect()
        return { left: b.left, right: b.right }
      }),
      centres: sections.map((s) => {
        const b = s.querySelector('.island-stage')!.getBoundingClientRect()
        return b.left + b.width / 2
      }),
      road: { left: road.left, width: road.width },
      card: card ? { left: card.left, right: card.right, width: card.width } : null,
      activeIsland: (() => {
        const stage = document.querySelector('.map-section.is-active .island-stage')
        return stage ? stage.getBoundingClientRect().width : null
      })(),
    }
  })
}

/**
 * Read the geometry once it has SETTLED — two consecutive identical reads. A
 * viewport change lands in the page before the shell has finished re-laying out
 * around it, and a single read can catch the half-swapped state (sidebar still
 * at its desktop width under phone padding), which is a race in the test rather
 * than anything a user can see. Same technique as `step-host.spec.ts`.
 */
async function readWorld(page: import('@playwright/test').Page): Promise<WorldGeometry> {
  let previous = JSON.stringify(await readWorldOnce(page))
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(100)
    const current = await readWorldOnce(page)
    const serialised = JSON.stringify(current)
    if (serialised === previous) return current
    previous = serialised
  }
  return readWorldOnce(page)
}

test.describe('Curriculum — world map geometry', () => {
  test('no island box and no chapter card is clipped by the frame', async ({ page, loggedInPage: _ }) => {
    const map = new CurriculumMapPage(page)
    await map.goto()
    await expect(map.chapterCard).toBeVisible()

    // The project's own viewport plus a deliberately cramped one. 900px is where
    // the desktop layout used to slice the LEFT island off by 46px, so the guard
    // has to cover a narrowed window and not just a phone.
    const viewports = [null, { width: 900, height: 900 }, { width: 360, height: 780 }] as const
    for (const vp of viewports) {
      if (vp) {
        await page.setViewportSize(vp)
        await expect(map.chapterCard).toBeVisible()
      }
      const w = await readWorld(page)
      const label = vp ? `${vp.width}px` : 'project viewport'

      expect(w.boxes.length, `${label}: islands rendered`).toBeGreaterThan(1)
      for (const [i, box] of w.boxes.entries()) {
        expect(box.left, `${label}: island ${i} left edge inside the frame`).toBeGreaterThanOrEqual(w.frame.left)
        expect(box.right, `${label}: island ${i} right edge inside the frame`).toBeLessThanOrEqual(w.frame.right)
      }
      expect(w.card, `${label}: the active chapter card is on-stage`).not.toBeNull()
      expect(w.card!.left, `${label}: chapter card left edge inside the frame`).toBeGreaterThanOrEqual(w.frame.left)
      expect(w.card!.right, `${label}: chapter card right edge inside the frame`).toBeLessThanOrEqual(w.frame.right)
    }
  })

  test('the road still threads the island centres after the lane is squeezed', async ({
    page,
    loggedInPage: _,
  }) => {
    const map = new CurriculumMapPage(page)
    await map.goto()
    await expect(map.chapterCard).toBeVisible()

    for (const vp of [null, { width: 360, height: 780 }] as const) {
      if (vp) {
        await page.setViewportSize(vp)
        await expect(map.chapterCard).toBeVisible()
      }
      const w = await readWorld(page)
      const label = vp ? `${vp.width}px` : 'project viewport'

      // Islands alternate right / left down the snake, and the road's viewBox is
      // stretched across its own box — so each island's centre must land on the
      // lane point of the row it sits in.
      for (const [i, centre] of w.centres.entries()) {
        const dir = i % 2 === 0 ? 1 : -1
        const lanePoint = w.road.left + (0.5 + dir * LANE_FRACTION) * w.road.width
        expect(Math.abs(centre - lanePoint), `${label}: island ${i} sits on the road`).toBeLessThanOrEqual(2)
      }
    }
  })

  test('the chapter card is sized from the island, not stretched to its column', async ({
    page,
    loggedInPage: _,
  }) => {
    const map = new CurriculumMapPage(page)
    await map.goto()
    await expect(map.chapterCard).toBeVisible()

    // Wide enough that `--island-size` is at its 330px cap in BOTH layouts, so
    // every project measures the same island and the card's ratio is the ratio
    // the user chose (0.62) rather than the content floor that governs on a
    // narrow window.
    await page.setViewportSize({ width: 1600, height: 1000 })
    await expect(map.chapterCard).toBeVisible()
    const w = await readWorld(page)

    expect(w.activeIsland, 'the active island is on stage').not.toBeNull()
    expect(w.card, 'the chapter card is on stage').not.toBeNull()
    const ratio = w.card!.width / w.activeIsland!

    // The card used to be `width: 100%` of the section box — a ratio of 1. The
    // upper bound is what stops that regression; the lower bound stops the card
    // collapsing onto its content and losing the plate it needs to read as a
    // card.
    expect(ratio, `card ${Math.round(w.card!.width)}px vs island ${Math.round(w.activeIsland!)}px`).toBeLessThanOrEqual(0.7)
    expect(ratio, `card ${Math.round(w.card!.width)}px vs island ${Math.round(w.activeIsland!)}px`).toBeGreaterThanOrEqual(0.5)
  })

  test('a coarse pointer gets the compact layout, a fine one keeps the rail beside the map', async ({
    page,
    loggedInPage: _,
  }) => {
    const map = new CurriculumMapPage(page)
    await map.goto()
    await expect(map.chapterCard).toBeVisible()

    const w = await readWorld(page)
    expect(w.rail, 'the rail is rendered').not.toBeNull()

    if (w.coarsePointer) {
      // Phone or tablet, at ANY width: the rail unstacks above the map.
      expect(w.rail!.bottom, 'compact layout stacks the rail above the map').toBeLessThanOrEqual(w.frame.top + 1)
    } else {
      // Mouse-driven and wide enough: the rail keeps its own column beside the map.
      expect(w.rail!.left, 'desktop keeps the rail beside the map').toBeGreaterThanOrEqual(w.frame.right)
    }
  })
})
