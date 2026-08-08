/**
 * Curriculum — Quiz player (Phase 22, Story 22.5)
 *
 * The ✅ Quiz player grades server-side: the client submits its `{answers}` to
 * `POST /api/steps/<id>/complete/` and only ever learns right/wrong booleans —
 * the answer key AND the per-question `feedback` line are stripped from the
 * manifest and NEVER reach the DOM before a graded fail. A pass completes the
 * step (+XP); a wrong answer keeps the player open with per-question
 * `quiz-result` marks, the explanation for each miss, and a second-look round
 * that re-asks only the missed questions with their answers blanked.
 *
 * Fixtures land in the pollution-safe `smart-spending / name-what-you-buy` level
 * (see `helpers/curriculumFixtures.ts`); `test.slow()` + 45s waits absorb the QA
 * stack's cold-start window.
 */
import { test, expect } from '../../fixtures/index'
import { CurriculumMapPage } from '../../pages/CurriculumMapPage'
import {
  seedPlayerFixtures,
  makeFixtureLevelPlayable,
  FIXTURE_TOPIC,
  FIXTURE_LEVEL,
  QUIZ_ANSWER_INDEX,
  QUIZ_FEEDBACK,
  QUIZ_XP,
} from '../../helpers/curriculumFixtures'

test.describe('Curriculum — quiz player', () => {
  test('a correct quiz submission passes and awards XP', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    const { quiz } = await seedPlayerFixtures(api)
    await makeFixtureLevelPlayable(api, quiz.step_id)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    const xpBefore = await map.xpValue()
    expect(xpBefore).toBe(0)

    await map.expandIslandFor('smart-spending')
    await map.nodesInTopic('smart-spending', 'current').first().click()
    await expect(map.stepPlayerHost).toBeVisible()
    await expect(map.stepPlayer).toBeVisible({ timeout: 45_000 })
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'quiz')
    await expect(page.getByTestId('quiz-question')).toBeVisible()

    // Answer the single MCQ correctly and submit → server grades it a pass.
    await page.getByTestId('quiz-option').nth(QUIZ_ANSWER_INDEX).click()
    await page.getByTestId('quiz-submit').click()

    // Pass → the level's terminal step → the Phase-27 reward screen interposes →
    // absorb it → host closes + XP lands on the map.
    await map.absorbCompletionScreen()
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
    await expect.poll(async () => map.xpValue(), { timeout: 45_000 }).toBe(xpBefore + QUIZ_XP)

    const payload = await api.getCurriculumMap()
    expect(payload.bars.knowledge.xp_total).toBe(QUIZ_XP)
  })

  test('a wrong answer explains the miss, re-asks it, and leaks no answer key', async ({
    page,
    loggedInPage,
  }) => {
    test.slow()
    const { api } = loggedInPage
    const { quiz } = await seedPlayerFixtures(api)
    await makeFixtureLevelPlayable(api, quiz.step_id)

    // Leak-safety at the source: the manifest strips BOTH the `answer` key and
    // the `feedback` line (an explanation of the miss names the right option).
    const manifest = await api.fetchLevel(FIXTURE_TOPIC, FIXTURE_LEVEL)
    const quizStep = manifest.steps.find((s) => s.id === quiz.step_id)
    expect(quizStep).toBeTruthy()
    const content = quizStep!.content as { questions: Array<Record<string, unknown>> }
    expect(content.questions[0]).not.toHaveProperty('answer')
    expect(content.questions[0]).not.toHaveProperty('feedback')

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    await map.expandIslandFor('smart-spending')
    await map.nodesInTopic('smart-spending', 'current').first().click()
    await expect(map.stepPlayerHost).toBeVisible()
    await expect(page.getByTestId('quiz-question')).toBeVisible({ timeout: 45_000 })

    // Before submit the correct answer is nowhere in the DOM — no result marks
    // exist yet (they render only after a graded FAIL, and never carry the key),
    // and the explanation has not been earned.
    await expect(page.getByTestId('quiz-result')).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText(QUIZ_FEEDBACK)

    // Submit a WRONG option → graded fail, no completion, per-question mark.
    const wrongIndex = QUIZ_ANSWER_INDEX === 0 ? 1 : 0
    await page.getByTestId('quiz-option').nth(wrongIndex).click()
    await page.getByTestId('quiz-submit').click()

    const result = page.getByTestId('quiz-result').first()
    await expect(result).toBeVisible({ timeout: 45_000 })
    await expect(result).toHaveAttribute('data-correct', 'false')
    // The miss is EXPLAINED — that is the whole point of failing.
    await expect(map.quizFeedback).toBeVisible()
    await expect(map.quizFeedback).toHaveText(QUIZ_FEEDBACK)
    // Still open (no completion) — the host did not close.
    await expect(map.stepPlayerHost).toBeVisible()

    // Second look: the missed question comes back with its answer BLANKED, so
    // Submit stays disabled until the reader actually re-answers it.
    await page.getByTestId('quiz-retry').click()
    await expect(page.getByTestId('quiz-question')).toBeVisible()
    await expect(page.getByTestId('quiz-submit')).toBeDisabled()
    await page.getByTestId('quiz-option').nth(QUIZ_ANSWER_INDEX).click()
    await page.getByTestId('quiz-submit').click()

    // Retry pass → terminal step → absorb the reward screen → host closes.
    await map.absorbCompletionScreen()
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
    const payload = await api.getCurriculumMap()
    expect(payload.bars.knowledge.xp_total).toBe(QUIZ_XP)
  })
})
