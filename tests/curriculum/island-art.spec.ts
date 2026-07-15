/**
 * Curriculum — island ART on the world map (Phase 28)
 *
 * Phase 28 replaced the placeholder CSS spheres with nine hand-drawn floating
 * islands. Each ships as a BODY bitmap plus one sprite per floating rock, cut out
 * of the same drawing by the asset pipeline (`frontend/scripts/process-islands.py`)
 * so every rock can drift on its own — baked into one bitmap they could only ever
 * move together.
 *
 * What these specs defend (things a CSS refactor can silently break, and that no
 * unit test can see):
 *  - every island bitmap actually DECODES in the browser (a 404 or a corrupt PNG
 *    renders as an invisible box, not as an error — `naturalWidth` is the only
 *    honest witness);
 *  - the rocks are really cut out and really placed on their island;
 *  - exactly ONE chapter card, on the ACTIVE chapter (nine of them buried the art
 *    — that regression is the reason this file exists);
 *  - unexplored and locked chapters are dimmed and the active one is not, i.e.
 *    colour on this map means the user's own footprint.
 *
 * `test.slow()` + 45s waits absorb the single-threaded QA stack's cold start.
 */
import { test, expect } from '../../fixtures/index'
import { CurriculumMapPage } from '../../pages/CurriculumMapPage'

test.describe('Curriculum — island art', () => {
  test('every chapter renders its island bitmap and its floating rocks', async ({
    page,
    loggedInPage,
  }) => {
    test.slow()
    const { api } = loggedInPage
    const payload = await api.getCurriculumMap()

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    // One island per chapter — the art is not optional chrome, it IS the map.
    await expect(map.islandArt).toHaveCount(payload.sections.length)

    // Only the first three islands load eagerly; the rest are `loading="lazy"` and
    // stay undecoded until they scroll into view (that is the point — the whole
    // world is ~900 KB of PNG). So walk the map the way a user does, then assert.
    const count = await map.islandArt.count()
    for (let i = 0; i < count; i++) {
      await map.islandArt.nth(i).scrollIntoViewIfNeeded()
    }
    // A missing / corrupt PNG still lays out a box and still reports `complete`.
    // `naturalWidth > 0` is what separates "decoded" from "silently blank".
    await expect
      .poll(
        async () =>
          map.islandArt.evaluateAll((imgs) =>
            imgs
              .map((el) => el as HTMLImageElement)
              .filter((img) => !(img.complete && img.naturalWidth > 0))
              .map((img) => img.getAttribute('src')),
          ),
        { message: 'island art that never decoded', timeout: 30_000 },
      )
      .toEqual([])

    // Nine DISTINCT islands. The user explicitly rejected repeated stand-ins, so
    // guard against a regression that ships the same bitmap nine times.
    const srcs = await map.islandArt.evaluateAll((imgs) =>
      imgs.map((el) => (el as HTMLImageElement).getAttribute('src')),
    )
    expect(new Set(srcs).size, `island art is not all distinct: ${srcs.join(', ')}`).toBe(srcs.length)

    // The rocks exist AND sit on their island. A rock that escaped its stage (a
    // percentage that became a pixel, say) would still be "present" — so assert
    // containment, not just a count. Test the rock's CENTRE, not its edges: rocks
    // are animated (drift + rise + spin), so an edge check flakes on whatever
    // frame the assertion lands on, while the centre stays deep inside its island
    // through the whole cycle — and a genuinely escaped rock is off by the island's
    // width, not by a few px of drift.
    const rocks = await map.islandRock.count()
    expect(rocks).toBeGreaterThan(payload.sections.length) // ≥1 rock per island, in practice ~5

    const escaped = await page.evaluate(() => {
      const out: string[] = []
      for (const section of document.querySelectorAll('[data-testid="map-section"]')) {
        const art = section.querySelector('[data-testid="island-art"]')
        if (!art) continue
        const box = art.getBoundingClientRect()
        for (const rock of section.querySelectorAll('[data-testid="island-rock"]')) {
          const r = rock.getBoundingClientRect()
          const cx = r.left + r.width / 2
          const cy = r.top + r.height / 2
          const inside = cx >= box.left && cx <= box.right && cy >= box.top && cy <= box.bottom
          if (!inside) out.push(`${section.getAttribute('data-section-slug')}: ${rock.getAttribute('src')}`)
        }
      }
      return out
    })
    expect(escaped, `rocks placed outside their island: ${escaped.join(', ')}`).toEqual([])
  })

  test('exactly one chapter card, and it rides the active chapter', async ({
    page,
    loggedInPage,
  }) => {
    test.slow()
    const { api } = loggedInPage
    const payload = await api.getCurriculumMap()

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    // The card, its crest and its "next up" line all live INSIDE the card, so all
    // three are singular. Nine cards is the regression this asserts against.
    await expect(map.chapterCard).toHaveCount(1)
    await expect(map.sectionCrests).toHaveCount(1)
    await expect(map.islandState).toHaveCount(1)

    // ...on the chapter the user is actually on.
    const activeSlug = await page
      .locator('[data-testid="map-section"][data-island-state="continue"]')
      .getAttribute('data-section-slug')
    expect(activeSlug).toBeTruthy()
    await expect(map.mapSection(activeSlug!).getByTestId('chapter-card')).toBeVisible()

    // Every OTHER chapter still says what it is — quietly.
    await expect(map.chapterNameplate).toHaveCount(payload.sections.length - 1)
  })

  test('unexplored and locked chapters are dimmed; the active one is lit', async ({
    page,
    loggedInPage,
  }) => {
    test.slow()
    await loggedInPage.api.getCurriculumMap()

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    const filterFor = (state: string) =>
      page
        .locator(`[data-testid="map-section"][data-island-state="${state}"] .island-float`)
        .first()
        .evaluate((el) => getComputedStyle(el).filter)

    // Colour = your footprint. Where you are is lit; where you have not been is not.
    expect(await filterFor('continue')).toBe('none')

    const start = await filterFor('start')
    expect(start).toContain('grayscale')
    expect(start).toContain('brightness')

    // Locked is dimmer still — assert the ORDER, not the numbers, so a taste tweak
    // to the exact values doesn't fail the suite but an inverted tier does.
    const brightness = (f: string) => Number(f.match(/brightness\(([\d.]+)\)/)?.[1] ?? NaN)
    const locked = await filterFor('locked')
    expect(brightness(locked)).toBeLessThan(brightness(start))
    expect(brightness(start)).toBeLessThan(1)
  })

  test('reduced motion stills every animated layer of the world', async ({ page, loggedInPage }) => {
    test.slow()
    await loggedInPage.api.getCurriculumMap()

    // Emulate BEFORE navigation so the very first paint is already still.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    // Every layer named in the reduced-motion CSS block (island bob, the 49 rocks,
    // fog, clouds, stars) must resolve to `animation: none`. A vestibular-safety
    // requirement (DoD 28.5.3), and the kind of thing a later CSS edit silently
    // breaks — so assert it rather than trust the stylesheet.
    const selectors = ['.island-float', '.island-rock', '.fog-bank', '.cloud', '.star']
    for (const sel of selectors) {
      const el = page.locator(sel).first()
      await el.waitFor({ state: 'attached', timeout: 15_000 })
      const animation = await el.evaluate((node) => getComputedStyle(node).animationName)
      expect(animation, `${sel} still animates under reduced motion`).toBe('none')
    }

    // Hover must not lift the island either (transform stays put).
    const island = map.islandToggle.first()
    const before = await island.locator('.island-float').evaluate((el) => getComputedStyle(el).transform)
    await island.hover()
    const after = await island.locator('.island-float').evaluate((el) => getComputedStyle(el).transform)
    expect(after, 'island lifts on hover under reduced motion').toBe(before)
  })
})
