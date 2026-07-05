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
 * threaded Django + first-hit Vite compile of `/dashboard/learn`).
 */
import type { Page } from '@playwright/test'
import { test, expect } from '../../fixtures/index'
import type { ApiHelper } from '../../helpers/api'
import { CurriculumMapPage } from '../../pages/CurriculumMapPage'
import {
  seedPlayerFixtures,
  makeFixtureLevelPlayable,
  LESSON_XP,
  INTERACTIVE_LESSON_XP,
  INTERACTIVE_OPTIONS,
  INTERACTIVE_CORRECT_OPTION,
  INTERACTIVE_WRONG_OPTION,
  INTERACTIVE_FEEDBACK,
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

test.describe('Curriculum — lesson player (interactive cards, Phase 24)', () => {
  // Seed the 4 fixtures, make the v2 interactive lesson the ONLY incomplete step
  // in the unlocked level, open its node, and advance from the leading text card
  // to the interactive `choice` card (deck index 1). Returns the mounted map POM.
  async function openToChoiceCard(page: Page, api: ApiHelper): Promise<CurriculumMapPage> {
    const { interactive } = await seedPlayerFixtures(api)
    await makeFixtureLevelPlayable(api, interactive.step_id)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    await map.nodesInTopic('smart-spending', 'current').first().click()
    await expect(map.stepPlayerHost).toBeVisible()
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'lesson', { timeout: 45_000 })

    // Deck index 0 is a TEXT card — it never gates, so Next is enabled without a
    // tap. Advance to index 1, the interactive `choice` card.
    await expect(map.lessonNext).toBeEnabled()
    await map.lessonNext.click()
    await expect(map.lessonCardChoice).toBeVisible()
    return map
  }

  test('a choice card gives formative feedback and gates advance', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    const map = await openToChoiceCard(page, api)

    // The choice card renders its options; unanswered → Next disabled + no feedback.
    await expect(map.lessonOption).toHaveCount(INTERACTIVE_OPTIONS.length)
    await expect(map.lessonNext).toBeDisabled()
    await expect(map.lessonCardFeedback).toHaveCount(0)

    // Tap the correct option → correct state + the card's feedback + Next unlocks.
    await map.lessonOption.nth(INTERACTIVE_CORRECT_OPTION).click()
    await expect(map.lessonOption.nth(INTERACTIVE_CORRECT_OPTION)).toHaveAttribute('data-state', 'correct')
    await expect(map.lessonCardFeedback).toBeVisible()
    await expect(map.lessonCardFeedback).toContainText(INTERACTIVE_FEEDBACK)
    await expect(map.lessonNext).toBeEnabled()
  })

  test('a wrong tap shows the incorrect state and the correct answer, no fail', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    const map = await openToChoiceCard(page, api)

    // Tap a WRONG option → it shows incorrect, the TRUE answer is still marked
    // correct, and the feedback appears. A lesson has no fail state — a wrong tap
    // is formative, so the deck still advances (Next enabled, no error UI).
    await map.lessonOption.nth(INTERACTIVE_WRONG_OPTION).click()
    await expect(map.lessonOption.nth(INTERACTIVE_WRONG_OPTION)).toHaveAttribute('data-state', 'incorrect')
    await expect(map.lessonOption.nth(INTERACTIVE_CORRECT_OPTION)).toHaveAttribute('data-state', 'correct')
    await expect(map.lessonCardFeedback).toBeVisible()
    await expect(map.missionFailNote).toHaveCount(0)
    await expect(map.lessonNext).toBeEnabled()

    // The deck advances + completes despite the wrong tap (mark-read, no fail).
    await map.lessonNext.click()
    await map.lessonDone.click()
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
  })

  test('an inline check moves no XP', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    const map = await openToChoiceCard(page, api)

    // No XP yet — the pre-completions write no ledger rows.
    expect((await api.getCurriculumMap()).bars.knowledge.xp_total).toBe(0)

    // Tapping the inline check writes NOTHING to the XP ledger (formative only).
    await map.lessonOption.nth(INTERACTIVE_CORRECT_OPTION).click()
    await expect(map.lessonCardFeedback).toBeVisible()
    expect((await api.getCurriculumMap()).bars.knowledge.xp_total).toBe(0)

    // Finish the deck → ONLY the single step-complete award lands (never per tap).
    await map.lessonNext.click()
    await map.lessonDone.click()
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
    await expect
      .poll(async () => (await api.getCurriculumMap()).bars.knowledge.xp_total, { timeout: 45_000 })
      .toBe(INTERACTIVE_LESSON_XP)
  })

  test('a text-only lesson still plays through unchanged', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage

    // The original all-text fixture lesson (no `kind` on any card) — regression
    // guard that Phase-24 changes leave a Phase-22 deck byte-identical.
    const { lesson } = await seedPlayerFixtures(api)
    await makeFixtureLevelPlayable(api, lesson.step_id)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    const xpBefore = await map.xpValue()
    expect(xpBefore).toBe(0)

    await map.nodesInTopic('smart-spending', 'current').first().click()
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'lesson', { timeout: 45_000 })

    // An all-text deck carries NO interactive option, and playing it taps none.
    await expect(map.lessonOption).toHaveCount(0)
    const interactiveTapped = await map.playLessonDeck()
    expect(interactiveTapped).toBe(0)

    // Level completes → host closes and the real lesson XP lands (unchanged).
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
    await expect.poll(async () => map.xpValue(), { timeout: 45_000 }).toBe(xpBefore + LESSON_XP)
  })
})

test.describe('Curriculum — lesson player (auth guard)', () => {
  test('an unauthenticated user is redirected from the map', async ({ page }) => {
    await page.goto('/dashboard/learn')
    await expect(page).toHaveURL('/login')
  })
})
