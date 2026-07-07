/**
 * Curriculum — Auri reactions + completion / reward screen (Phase 27, Story 27.4)
 *
 * Phase 27 gave the players a mini-Auri that reacts to each interaction (correct →
 * celebrate, wrong / fail → support, NEVER shame) and interposed a completion /
 * reward screen (`step-completion`) inside the host when a lesson / quiz /
 * scenario / sandbox step (or a self-attest mission) finishes a level: Auri
 * celebrating + a real "+N XP" figure (ONLY a positive `xp_awarded` from the
 * response — a replay shows "Reviewed", never a fake number) + a Continue that
 * closes the host. A row-verified mission keeps its own enriched snapshot phase
 * (covered in `mission-player.spec.ts`) and never shows this screen.
 *
 * Pollution-safety (gotcha #26): the lesson/quiz fixtures land in the already-step-
 * bearing, unlocked `smart-spending / name-what-you-buy` level (see
 * `helpers/curriculumFixtures.ts`); the replay + reshuffle specs drive the REAL
 * seeded Start-here L1 (per-user progress only). `test.slow()` + 45s waits absorb
 * the QA stack's cold-start; URLs come from `process.env.BACKEND_URL/FRONTEND_URL`.
 */
import { test, expect } from '../../fixtures/index'
import { CurriculumMapPage } from '../../pages/CurriculumMapPage'
import {
  seedPlayerFixtures,
  makeFixtureLevelPlayable,
  LESSON_XP,
  INTERACTIVE_CORRECT_OPTION,
  INTERACTIVE_WRONG_OPTION,
  QUIZ_ANSWER_INDEX,
} from '../../helpers/curriculumFixtures'
import {
  precompleteStartHereStep,
  L1_HOW_THIS_WORKS,
  HOW_LESSON_SLUG,
  MAP_QUIZ_ANSWERS,
} from '../../helpers/startHereFixtures'

// The reaction copy is warm and supportive — it must NEVER shame a wrong answer.
const SHAME_PATTERN = /\b(wrong|stupid|idiot|dumb|failure|failed|loser|useless|terrible|pathetic)\b/i

test.describe('Curriculum — completion + reward screen', () => {
  test('completing a lesson shows the completion screen with real +XP', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    const { lesson } = await seedPlayerFixtures(api)
    await makeFixtureLevelPlayable(api, lesson.step_id)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    const xpBefore = await map.xpValue()
    expect(xpBefore).toBe(0)

    await map.openCurrentNode('smart-spending')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'lesson')

    // Capture the terminal completion response so the SCREEN's "+N XP" can be
    // checked against the REAL award (no-fake-numbers). Leave the reward screen up
    // (don't absorb) so it can be asserted.
    const respPromise = page.waitForResponse(
      (r) => r.url().includes('/complete/') && r.request().method() === 'POST',
    )
    await map.playLessonDeck({ absorbCompletion: false })
    const body = (await (await respPromise).json()) as { xp_awarded: number | null }
    expect(body.xp_awarded).toBe(LESSON_XP)

    // The reward screen shows Auri celebrating + "+N XP" equal to the response.
    await expect(map.stepCompletion).toBeVisible({ timeout: 45_000 })
    await expect(map.completionAuri).toBeVisible()
    await expect(map.completionXp).toContainText(`${body.xp_awarded}`)

    // Continue closes the host; Bar #1 XP rose by exactly that amount.
    await map.completionContinue.click()
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
    await expect.poll(async () => map.xpValue(), { timeout: 45_000 }).toBe(xpBefore + (body.xp_awarded ?? 0))
  })

  test('a lesson tap makes Auri celebrate on correct and stay supportive on wrong', async ({
    page,
    loggedInPage,
  }) => {
    test.slow()
    const { api } = loggedInPage
    const { interactive } = await seedPlayerFixtures(api)
    await makeFixtureLevelPlayable(api, interactive.step_id)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    // --- Correct tap → Auri celebrates (formative, no completion) ---
    await map.openCurrentNode('smart-spending')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'lesson')
    await map.lessonNext.click() // text card (index 0) → choice card (index 1)
    await expect(map.lessonCardChoice).toBeVisible()
    await map.lessonOption.nth(INTERACTIVE_CORRECT_OPTION).click()
    await expect(map.playerAuri.locator('img.auri-img')).toHaveAttribute('src', /auri_03_celebrate/)
    expect((await map.playerReaction.innerText()).trim().length).toBeGreaterThan(0)

    // Close WITHOUT completing (an inline check is formative — the step stays a
    // fresh `current` node), then re-open for the wrong-tap branch.
    await page.keyboard.press('Escape')
    await expect(map.stepPlayerHost).toBeHidden()

    // --- Wrong tap → Auri stays supportive, never shaming ---
    await map.nodesInTopic('smart-spending', 'current').first().click()
    await expect(map.stepPlayer).toBeVisible({ timeout: 45_000 })
    await map.lessonNext.click()
    await expect(map.lessonCardChoice).toBeVisible()
    await map.lessonOption.nth(INTERACTIVE_WRONG_OPTION).click()
    await expect(map.playerAuri.locator('img.auri-img')).toHaveAttribute('src', /auri_06_support/)
    const reaction = (await map.playerReaction.innerText()).trim()
    expect(reaction.length).toBeGreaterThan(0)
    expect(reaction).not.toMatch(SHAME_PATTERN)
  })

  test('a quiz fail shows the support Auri, not shame', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    const { quiz } = await seedPlayerFixtures(api)
    await makeFixtureLevelPlayable(api, quiz.step_id)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    await map.openCurrentNode('smart-spending')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'quiz')

    // Submit a WRONG answer → the fail review renders the supportive Auri.
    const wrong = QUIZ_ANSWER_INDEX === 0 ? 1 : 0
    await map.quizOption.nth(wrong).click()
    await map.quizSubmit.click()
    await expect(map.quizResult.first()).toBeVisible({ timeout: 45_000 })
    await expect(map.playerAuri.locator('img.auri-img')).toHaveAttribute('src', /auri_06_support/)

    // The support copy is never shaming; the host stayed open (a fail = no reward).
    const reaction = (await map.playerReaction.innerText()).trim()
    expect(reaction.length).toBeGreaterThan(0)
    expect(reaction).not.toMatch(SHAME_PATTERN)
    await expect(map.stepCompletion).toHaveCount(0)
    await expect(map.stepPlayerHost).toBeVisible()
  })

  test('replaying a completed level shows no fake XP', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    await api.getCurriculumMap() // seed the tree

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    expect(await map.xpValue()).toBe(0)

    // Complete Start-here L1 (lesson → quiz) via the UI → earns real XP.
    await map.openCurrentNode('start-here')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'lesson')
    await map.playLessonDeck()
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'quiz', { timeout: 45_000 })
    await map.answerMcqQuiz(MAP_QUIZ_ANSWERS)
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
    await expect.poll(async () => map.xpValue(), { timeout: 45_000 }).toBeGreaterThan(0)
    const xpAfterFirst = await map.xpValue()

    // Re-open the now-COMPLETED L1 node — the host remounts its first step (the
    // lesson, already done). Replaying it is a REVIEW: xp_awarded is null, so the
    // reward screen says "Reviewed" and shows NO "+XP" figure (no fake number).
    await map.nodesInTopic('start-here', 'completed').first().click()
    await expect(map.stepPlayerHost).toBeVisible()
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'lesson', { timeout: 45_000 })
    await map.playLessonDeck({ absorbCompletion: false })

    await expect(map.stepCompletion).toBeVisible({ timeout: 45_000 })
    await expect(map.stepCompletion).toContainText('Reviewed')
    await expect(map.completionXp).toHaveCount(0)
    await map.completionContinue.click()
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })

    // Bar #1 XP is UNCHANGED by the replay (no double award).
    expect(await map.xpValue()).toBe(xpAfterFirst)
  })

  test('quiz options never reshuffle on selection', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    await api.getCurriculumMap() // seed the tree
    // Pre-complete the L1 lesson so the multi-question `map-basics` QUIZ is active.
    await precompleteStartHereStep(api, L1_HOW_THIS_WORKS, HOW_LESSON_SLUG)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    await map.openCurrentNode('start-here')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'quiz')

    // Record Q1's option order + select one, then navigate Next → Back. The order
    // and the selection must be byte-identical (QuizPlayer renders questions
    // verbatim and stores answers by index — no reshuffle; the stub-item guard).
    const q1Before = await map.quizOption.allInnerTexts()
    expect(q1Before.length).toBeGreaterThan(1)
    const chosen = 1
    await map.quizOption.nth(chosen).click()
    await expect(map.quizOption.nth(chosen)).toHaveAttribute('aria-checked', 'true')

    await map.quizNext.click() // → Q2
    await expect(map.quizQuestion).toBeVisible()
    await map.quizBack.click() // ← Q1
    await expect(map.quizQuestion).toBeVisible()

    const q1After = await map.quizOption.allInnerTexts()
    expect(q1After).toEqual(q1Before)
    await expect(map.quizOption.nth(chosen)).toHaveAttribute('aria-checked', 'true')
  })
})
