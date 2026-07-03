/**
 * Curriculum — Lesson player + host fill (Phase 22, Story 22.4)
 *
 * The step-player host is no longer empty: tapping a `current` node fetches the
 * leak-safe level manifest and mounts the registry player for the active step.
 * These specs drive the 📖 Lesson player end-to-end (deck → Done → completion),
 * the baseline crest reveal on a completed checkpoint, and the auth guard.
 *
 * Pollution-safety (gotcha #26): lesson fixtures land in the already-step-bearing,
 * unlocked `smart-spending / name-what-you-buy` level (see
 * `helpers/curriculumFixtures.ts`), so the map/progress crest counts stay stable.
 *
 * `test.slow()` + 45s waits absorb the QA stack's cold-start window (single-
 * threaded Django + first-hit Vite compile of `/dashboard/today`).
 */
import { test, expect } from '../../fixtures/index'
import { CurriculumMapPage } from '../../pages/CurriculumMapPage'
import {
  seedPlayerFixtures,
  makeFixtureLevelPlayable,
  LESSON_XP,
} from '../../helpers/curriculumFixtures'

test.describe('Curriculum — lesson player', () => {
  test('a seeded lesson plays through its deck and completes', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage

    // Seed the fixtures, then make the lesson the ONLY incomplete step in an
    // unlocked level → the host mounts the Lesson player for it.
    const { lesson } = await seedPlayerFixtures(api)
    await makeFixtureLevelPlayable(api, lesson.step_id)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    // No XP yet — `seedStepCompletion` writes no ledger rows, so the only XP the
    // map can gain is the lesson's own award.
    const xpBefore = await map.xpValue()
    expect(xpBefore).toBe(0)

    // Tap the fixture level's node (the sole `current` node in smart-spending).
    await map.nodesInTopic('smart-spending', 'current').first().click()
    await expect(map.stepPlayerHost).toBeVisible()

    // The Lesson player is mounted (not the old empty placeholder).
    await expect(map.stepPlayer).toBeVisible({ timeout: 45_000 })
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'lesson')
    await expect(page.getByTestId('lesson-card')).toBeVisible()

    // Advance through the deck (2 cards) and finish.
    await page.getByTestId('lesson-next').click()
    await page.getByTestId('lesson-done').click()

    // Level completes → the host closes and the map refreshes with the new XP.
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
    await expect.poll(async () => map.xpValue(), { timeout: 45_000 }).toBe(xpBefore + LESSON_XP)

    // API parity — the number on screen traces to a real ledger row.
    const payload = await api.getCurriculumMap()
    expect(payload.bars.knowledge.xp_total).toBe(LESSON_XP)
  })

  test('completing a checkpoint level reveals its crest', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    await api.getCurriculumMap() // seed the tree

    // Unlock the earning-money capstone `income-shows-up` (a step-bearing
    // CHECKPOINT) by completing the two step-bearing levels before it.
    await api.seedLevelState({ topic_slug: 'earning-money', level_slug: 'earning-inventory' })
    await api.seedLevelState({ topic_slug: 'earning-money', level_slug: 'plant-one-new-stream' })

    // No crest earned yet (neither unlocked level is a checkpoint).
    const before = await api.getCurriculumMap()
    expect(before.bars.knowledge.crest_count).toBe(0)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    // The capstone is the sole `current` node in earning-money; its mission is a
    // self_attest step → "Mark done" completes the checkpoint level.
    await map.nodesInTopic('earning-money', 'current').first().click()
    await expect(map.stepPlayerHost).toBeVisible()
    await expect(map.stepPlayer).toBeVisible({ timeout: 45_000 })
    await page.getByTestId('mission-verify').click()

    // Baseline crest reveal pops on the newly-completed checkpoint node …
    await expect(map.crestReveal).toBeVisible({ timeout: 45_000 })

    // … and the real crest count rose by exactly one.
    const after = await api.getCurriculumMap()
    expect(after.bars.knowledge.crest_count).toBe(1)
  })
})

test.describe('Curriculum — lesson player (auth guard)', () => {
  test('an unauthenticated user is redirected from the map', async ({ page }) => {
    await page.goto('/dashboard/today')
    await expect(page).toHaveURL('/login')
  })
})
