/**
 * Curriculum — Lesson player + host fill (Phase 22, Story 22.4)
 *
 * The step-player host is no longer empty: tapping a `current` node fetches the
 * leak-safe level manifest and mounts the registry player for the active step.
 * These specs drive the 📖 Lesson player end-to-end (deck → Done → completion),
 * the crest that the REQUIRED work earns — Phase 32: a mission gates nothing, so
 * the earning-money crest is already on the topic head before its capstone mission
 * is ever opened — and the auth guard.
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
import { seedIncomeRows, EARNING_MONEY_TOPIC, EM_L5_INCOME_SHOWS_UP } from '../../helpers/earnFixtures'
import { completeRequiredSteps, levelOf, topicOf } from '../../helpers/unlockFixtures'

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
    await map.expandIslandFor('smart-spending')
    await map.nodesInTopic('smart-spending', 'current').first().click()
    await expect(map.stepPlayerHost).toBeVisible()

    // The Lesson player is mounted (not the old empty placeholder).
    await expect(map.stepPlayer).toBeVisible({ timeout: 45_000 })
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'lesson')
    await expect(page.getByTestId('lesson-card')).toBeVisible()

    // Advance through the deck (2 cards) and finish.
    await page.getByTestId('lesson-next').click()
    await page.getByTestId('lesson-done').click()

    // Level completes → Phase-27 reward screen interposes → absorb it → the host
    // closes and the map refreshes with the new XP.
    await map.absorbCompletionScreen()
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
    await expect.poll(async () => map.xpValue(), { timeout: 45_000 }).toBe(xpBefore + LESSON_XP)

    // API parity — the number on screen traces to a real ledger row.
    const payload = await api.getCurriculumMap()
    expect(payload.bars.knowledge.xp_total).toBe(LESSON_XP)
  })

  test('the crest is earned by the required work, and the capstone mission adds none', async ({
    page,
    loggedInPage,
  }) => {
    test.slow()
    const { api } = loggedInPage
    await api.getCurriculumMap() // seed the tree

    // Phase 32: earning-money crests on its REQUIRED work — the lessons, quizzes,
    // scenario and sandbox of L1–L4. Complete exactly those and NOT one mission,
    // then seed ≥2 income rows so the L5 capstone's pure `income_rows_exist` check
    // verifies PASS against real data when it is played later on.
    const written = await completeRequiredSteps(api, EARNING_MONEY_TOPIC)
    expect(written).toBeGreaterThan(0)
    await seedIncomeRows(api, 2)

    // The crest is ALREADY earned, with every mission in the topic still open —
    // the L5 capstone among them: a side quest that is never `current` and holds
    // nothing back.
    const before = await api.getCurriculumMap()
    expect(topicOf(before, EARNING_MONEY_TOPIC).status).toBe('completed')
    expect(before.bars.knowledge.crest_count).toBe(1)
    const capstoneBefore = levelOf(before, EARNING_MONEY_TOPIC, EM_L5_INCOME_SHOWS_UP)
    expect(capstoneBefore.status).toBe('optional')
    expect(capstoneBefore.required_step_count).toBe(0)
    expect(capstoneBefore.steps_completed).toBe(0)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    const xpBefore = await map.xpValue()

    // The map says the same thing: the crest chip sits on the TOPIC HEAD (Phase 32
    // moved it off the checkpoint node) and it is old news — the reveal fires only
    // when a topic NEWLY completes, and this one crested before the page loaded.
    await map.expandIslandFor(EARNING_MONEY_TOPIC)
    await expect(map.topic(EARNING_MONEY_TOPIC)).toHaveAttribute('data-topic-status', 'completed')
    await expect(map.topic(EARNING_MONEY_TOPIC).getByTestId('topic-crest-badge')).toBeVisible()
    await expect(map.crestReveal).toHaveCount(0)
    expect(await map.crestCountValue()).toBe(1)
    await expect(map.levelNode(EARNING_MONEY_TOPIC, EM_L5_INCOME_SHOWS_UP)).toHaveAttribute(
      'data-side-quest',
      'true',
    )

    // Play the capstone anyway — it is a guided-v2 ROW-VERIFIED mission (Verify
    // terminal + snapshot), NOT self_attest: walk the action screen, Verify PASSES
    // against the seeded rows, and Continue closes the host.
    await map.openLevelNode(EARNING_MONEY_TOPIC, EM_L5_INCOME_SHOWS_UP)
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'mission')
    await map.walkMissionFlow()
    await map.missionVerify.click()
    await expect(map.verifierSnapshot).toBeVisible({ timeout: 45_000 })
    await map.missionContinue.click()
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })

    // It wrote its completion and paid real XP …
    await expect.poll(async () => map.xpValue(), { timeout: 45_000 }).toBeGreaterThan(xpBefore)
    const after = await api.getCurriculumMap()
    const capstoneAfter = levelOf(after, EARNING_MONEY_TOPIC, EM_L5_INCOME_SHOWS_UP)
    expect(capstoneAfter.status).toBe('completed')
    expect(capstoneAfter.steps_completed).toBe(capstoneAfter.step_count)
    expect(after.bars.knowledge.xp_total).toBeGreaterThan(before.bars.knowledge.xp_total)

    // … and it moved NO crest: the mission was never what earned it. The chip that
    // was there before is still there, and still not a reveal.
    expect(after.bars.knowledge.crest_count).toBe(before.bars.knowledge.crest_count)
    expect(await map.crestCountValue()).toBe(1)
    await expect(map.crestReveal).toHaveCount(0)
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
    await map.expandIslandFor('smart-spending')
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

    // Still no fail state — but since Phase 31 the miss is not left behind either:
    // Done opens the review round, and the deck completes only once it is cleared.
    await map.lessonNext.click()
    await map.lessonDone.click()
    await expect(map.lessonReviewNext).toBeVisible({ timeout: 45_000 })
    await map.lessonOption.nth(INTERACTIVE_CORRECT_OPTION).click()
    await map.lessonReviewNext.click()
    await map.absorbCompletionScreen()
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
    await map.absorbCompletionScreen()
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

    await map.expandIslandFor('smart-spending')
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

test.describe('Curriculum — lesson deck review round (Phase 31)', () => {
  test('a missed tap-card is replayed before the lesson can be marked read', async ({
    page,
    loggedInPage,
  }) => {
    test.slow()
    const { api } = loggedInPage
    const { interactive } = await seedPlayerFixtures(api)
    await makeFixtureLevelPlayable(api, interactive.step_id)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    const xpBefore = await map.xpValue()

    await map.expandIslandFor('smart-spending')
    await map.nodesInTopic('smart-spending', 'current').first().click()
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'lesson', { timeout: 45_000 })

    // Walk to the tap card and MISS it. The verdict is client-side and instant —
    // the card names the right option and explains it, exactly as before.
    // Bounded, and each step WAITS for the next card: `count()` does not auto-wait,
    // so an unbounded loop reading a pre-render DOM walks straight past the card.
    for (let i = 0; i < 10 && (await map.lessonOption.count()) === 0; i++) {
      await map.lessonNext.click()
      await expect(map.lessonOption.or(map.lessonNext).or(map.lessonDone).first()).toBeVisible({
        timeout: 45_000,
      })
    }
    await expect(map.lessonOption.first()).toBeVisible({ timeout: 45_000 })
    await map.lessonOption.nth(INTERACTIVE_WRONG_OPTION).click()
    await expect(map.lessonCardFeedback).toBeVisible({ timeout: 45_000 })

    // Reach the end of the deck and press Done — which opens the REVIEW ROUND
    // instead of completing, because the queue is not empty.
    for (let i = 0; i < 10 && (await map.lessonNext.count()) > 0; i++) {
      await map.lessonNext.click()
      await expect(map.lessonNext.or(map.lessonDone).first()).toBeVisible({ timeout: 45_000 })
    }
    await expect(map.lessonDone).toBeVisible({ timeout: 45_000 })
    await map.lessonDone.click()

    await expect(map.lessonReviewNext).toBeVisible({ timeout: 45_000 })
    // The missed card is back, BLANK, and the deck's own navigation is gone —
    // the queue is walking it now, not the reader.
    await expect(map.lessonCardFeedback).toHaveCount(0)
    await expect(map.lessonReviewNext).toBeDisabled()
    await expect(map.stepPlayerHost).toBeVisible()
    await expect(map.stepCompletion).toHaveCount(0)
    expect(await map.xpValue()).toBe(xpBefore)

    // Answer it correctly → the queue empties → the lesson is marked read.
    await map.lessonOption.nth(INTERACTIVE_CORRECT_OPTION).click()
    await expect(map.lessonReviewNext).toBeEnabled()
    await map.lessonReviewNext.click()

    await map.absorbCompletionScreen()
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
    await expect
      .poll(async () => map.xpValue(), { timeout: 45_000 })
      .toBe(xpBefore + INTERACTIVE_LESSON_XP)
  })
})

test.describe('Curriculum — lesson player (auth guard)', () => {
  test('an unauthenticated user is redirected from the map', async ({ page }) => {
    await page.goto('/dashboard/learn')
    await expect(page).toHaveURL('/login')
  })
})
