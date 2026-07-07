/**
 * Curriculum — Sandbox player mechanics (Phase 26, Story 26.2/26.6)
 *
 * The 🧮 Sandbox is a labeled-hypothetical calculator: it ALWAYS renders the
 * mandatory `sandbox-banner` ("hypothetical — not your real balance") first, draws
 * the named calculator as inline-SVG (`sandbox-calculator`) over FIXED example
 * amounts, re-renders as inputs move, and mark-completes on "Done" (empty body,
 * like a lesson) → `StepCompletion` + XP. There is no real money anywhere on the
 * surface — every figure is a labeled hypothetical (no `seed_from_real`).
 *
 * Pollution-safety (gotcha #26): the sandbox fixture lands in the already-step-
 * bearing, unlocked `smart-spending / name-what-you-buy` level (see
 * `helpers/curriculumFixtures.ts`) — seeded as the 5th fixture in the SAME
 * `seedPlayerFixtures` set every player spec seeds, so the level still
 * "completes on the last step" race-free and the map/progress crest counts stay
 * stable. `test.slow()` + 45s waits absorb the QA stack's cold-start window.
 */
import { test, expect } from '../../fixtures/index'
import { CurriculumMapPage } from '../../pages/CurriculumMapPage'
import { seedPlayerFixtures, makeFixtureLevelPlayable, SANDBOX_XP } from '../../helpers/curriculumFixtures'

// Money/currency tripwire (same shape as map.spec): any currency symbol, a
// currency-formatted 2-decimal figure, or an ISO code. The sandbox draws only
// rounded whole amounts + one-decimal rates and carries no currency symbol, so a
// labeled hypothetical is never mistaken for a real, traceable money figure.
const MONEY_PATTERN = /[€$£¥]|\b\d+[.,]\d{2}\b|\bEUR\b|\bUSD\b|\bGBP\b/

test.describe('Curriculum — sandbox player', () => {
  test('a sandbox always shows the hypothetical banner', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    const { sandbox } = await seedPlayerFixtures(api)
    await makeFixtureLevelPlayable(api, sandbox.step_id)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    await map.nodesInTopic('smart-spending', 'current').first().click()
    await expect(map.stepPlayerHost).toBeVisible()
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'sandbox', { timeout: 45_000 })

    // The mandatory banner is present the moment the player mounts (before any
    // interaction) and labels the calculator a hypothetical.
    await expect(map.sandboxBanner).toBeVisible()
    await expect(map.sandboxBanner).toContainText('not your real balance')

    // …and it stays visible after moving an input (the banner is not a dismissible
    // one-shot — it guards every render).
    const slider = map.stepPlayer.locator('input[type="range"]').first()
    await slider.focus()
    await slider.press('ArrowRight')
    await slider.press('ArrowRight')
    await expect(map.sandboxBanner).toBeVisible()
  })

  test('a sandbox renders its calculator and completes', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    const { sandbox } = await seedPlayerFixtures(api)
    await makeFixtureLevelPlayable(api, sandbox.step_id)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    const xpBefore = await map.xpValue()
    expect(xpBefore).toBe(0)

    await map.nodesInTopic('smart-spending', 'current').first().click()
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'sandbox', { timeout: 45_000 })

    // The inline-SVG calculator renders with figures on it.
    await expect(map.sandboxCalculator).toBeVisible()
    await expect(map.sandboxCalculator.locator('svg')).toBeVisible()
    await expect(map.sandboxCalculator).toContainText(/\d/)

    // Adjusting an input re-renders the calculator (the drawn figures change).
    const before = await map.sandboxCalculator.innerText()
    const slider = map.stepPlayer.locator('input[type="range"]').first()
    await slider.focus()
    for (let i = 0; i < 4; i++) await slider.press('ArrowRight')
    await expect
      .poll(async () => (await map.sandboxCalculator.innerText()) !== before, { timeout: 15_000 })
      .toBe(true)

    // "Done" mark-completes it → the level closes and the real XP lands.
    await map.sandboxDone.click()
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
    await expect.poll(async () => map.xpValue(), { timeout: 45_000 }).toBe(xpBefore + SANDBOX_XP)

    // API parity — the number on screen traces to a real ledger row.
    const payload = await api.getCurriculumMap()
    expect(payload.bars.knowledge.xp_total).toBe(SANDBOX_XP)
  })

  test('reduced-motion disables the sandbox animation', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    // Ask for reduced motion BEFORE the map renders — the player scales its SVG
    // reveal duration by `motionScale()` (0 → instant, no animation), yet the
    // final values still render immediately and the step stays completable.
    await page.emulateMedia({ reducedMotion: 'reduce' })

    const { sandbox } = await seedPlayerFixtures(api)
    await makeFixtureLevelPlayable(api, sandbox.step_id)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    const xpBefore = await map.xpValue()
    expect(xpBefore).toBe(0)

    await map.nodesInTopic('smart-spending', 'current').first().click()
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'sandbox', { timeout: 45_000 })

    // Final values are rendered right away (no waiting on an animation).
    await expect(map.sandboxBanner).toBeVisible()
    await expect(map.sandboxCalculator).toBeVisible()
    await expect(map.sandboxCalculator).toContainText(/\d/)

    // …and it still completes + awards XP under reduced motion.
    await map.sandboxDone.click()
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
    await expect.poll(async () => map.xpValue(), { timeout: 45_000 }).toBe(xpBefore + SANDBOX_XP)
  })

  test('the sandbox surface shows zero traceable money figures', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    const { sandbox } = await seedPlayerFixtures(api)
    await makeFixtureLevelPlayable(api, sandbox.step_id)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    await map.nodesInTopic('smart-spending', 'current').first().click()
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'sandbox', { timeout: 45_000 })
    await expect(map.sandboxCalculator).toBeVisible()

    // The sandbox surface carries numbers (positive control) …
    const surface = await map.stepPlayer.innerText()
    expect(surface).toMatch(/\d/)
    // … but NONE of them is a traceable/real money figure: no currency symbol, no
    // ISO code, no `\d+[.,]\d{2}` balance. Every figure is inside the labeled
    // hypothetical (behavior-rules: no fake numbers — a calculator is never a
    // real balance).
    expect(surface).not.toMatch(MONEY_PATTERN)
  })
})
