/**
 * Curriculum — Quiz player: the practice loop (Phase 31)
 *
 * Two mechanics share one card language, chosen by `content.mode`:
 *
 *   practice (the default, every in-level quiz) — a tap IS the submission. The
 *     verdict paints at once, a miss marks the right option and prints its
 *     explanation, and the question joins the step's review queue. The queue
 *     replays until nothing is missed; only then does the step complete.
 *
 *   assessment (the topic-end boss, until phase 32) — the all-or-nothing batch
 *     submit, and `POST /api/steps/<id>/check/` REFUSES it, keeping one step on
 *     one mechanic. (Not a confidentiality boundary: a failing `complete/`
 *     already returns per-question results.)
 *
 * Leak-safety is asserted at the source in both modes: the manifest carries no
 * `answer` and no `feedback`.
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
  unlockFixtureLevel,
  FIXTURE_TOPIC,
  FIXTURE_LEVEL,
  PRACTICE_Q0_ANSWER,
  PRACTICE_Q1_ANSWER,
  PRACTICE_Q0_PROMPT,
  PRACTICE_Q1_PROMPT,
  PRACTICE_Q0_FEEDBACK,
  PRACTICE_QUIZ_XP,
  BOSS_ANSWER_INDEX,
  BOSS_QUIZ_XP,
  ORDER_OPTIONS,
  ORDER_ANSWER,
  ORDER_FEEDBACK,
} from '../../helpers/curriculumFixtures'

const WRONG_FOR_Q0 = PRACTICE_Q0_ANSWER === 0 ? 1 : 0

test.describe('Curriculum — quiz player (practice)', () => {
  test('the manifest carries no answer key and no explanation, in either mode', async ({
    loggedInPage,
  }) => {
    test.slow()
    const { api } = loggedInPage
    const { practiceQuiz, bossQuiz } = await seedPlayerFixtures(api)
    await unlockFixtureLevel(api)
    const manifest = await api.fetchLevel(FIXTURE_TOPIC, FIXTURE_LEVEL)

    for (const id of [practiceQuiz.step_id, bossQuiz.step_id]) {
      const step = manifest.steps.find((s) => s.id === id)
      expect(step, `step ${id} missing from the manifest`).toBeTruthy()
      const content = step!.content as { questions: Array<Record<string, unknown>> }
      expect(content.questions.length).toBeGreaterThan(0)
      for (const question of content.questions) {
        expect(question).not.toHaveProperty('answer')
        expect(question).not.toHaveProperty('feedback')
      }
    }
  })

  test('a correct answer is checked on the tap and completes the step', async ({
    page,
    loggedInPage,
  }) => {
    test.slow()
    const { api } = loggedInPage
    const { practiceQuiz } = await seedPlayerFixtures(api)
    await makeFixtureLevelPlayable(api, practiceQuiz.step_id)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    const xpBefore = await map.xpValue()

    await map.expandIslandFor(FIXTURE_TOPIC)
    await map.nodesInTopic(FIXTURE_TOPIC, 'current').first().click()
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'quiz', { timeout: 45_000 })

    // Nothing is revealed before the reader attempts it: no advance control, and
    // the explanation has not been earned.
    await expect(map.quizAdvance).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText(PRACTICE_Q0_FEEDBACK)

    // Q0 right → the tap alone grades it.
    await map.quizOption.nth(PRACTICE_Q0_ANSWER).click()
    await expect(map.quizOption.nth(PRACTICE_Q0_ANSWER)).toHaveAttribute('data-state', 'correct', {
      timeout: 45_000,
    })
    await expect(map.quizFeedback).toHaveCount(0)
    await map.quizAdvance.click()

    // Q1 right → the round ends clean → the step completes and XP lands.
    await expect(map.quizQuestion).toContainText(PRACTICE_Q1_PROMPT)
    await map.quizOption.nth(PRACTICE_Q1_ANSWER).click()
    await expect(map.quizAdvance).toBeVisible({ timeout: 45_000 })
    await map.quizAdvance.click()

    await map.absorbCompletionScreen()
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
    await expect.poll(async () => map.xpValue(), { timeout: 45_000 }).toBe(xpBefore + PRACTICE_QUIZ_XP)
  })

  test('a miss names the right option, explains it, and replays only that question', async ({
    page,
    loggedInPage,
  }) => {
    test.slow()
    const { api } = loggedInPage
    const { practiceQuiz } = await seedPlayerFixtures(api)
    await makeFixtureLevelPlayable(api, practiceQuiz.step_id)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    await map.expandIslandFor(FIXTURE_TOPIC)
    await map.nodesInTopic(FIXTURE_TOPIC, 'current').first().click()
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'quiz', { timeout: 45_000 })

    // MISS Q0 — the picked option is marked wrong, the right one is named, and
    // the authored line explains why.
    await map.quizOption.nth(WRONG_FOR_Q0).click()
    await expect(map.quizOption.nth(WRONG_FOR_Q0)).toHaveAttribute('data-state', 'incorrect', {
      timeout: 45_000,
    })
    await expect(map.quizOption.nth(PRACTICE_Q0_ANSWER)).toHaveAttribute('data-state', 'correct')
    await expect(map.quizFeedback).toHaveText(PRACTICE_Q0_FEEDBACK)
    // A checked question is inert — tapping another option cannot change the verdict.
    await expect(map.quizOption.nth(PRACTICE_Q0_ANSWER)).toBeDisabled()

    // Q1 right → the round ends with exactly ONE miss outstanding.
    await map.quizAdvance.click()
    await expect(map.quizQuestion).toContainText(PRACTICE_Q1_PROMPT)
    await map.quizOption.nth(PRACTICE_Q1_ANSWER).click()
    await map.quizAdvance.click()

    // The REPLAY: only Q0 comes back, blanked, and the step is not complete.
    await expect(map.quizQuestion).toContainText(PRACTICE_Q0_PROMPT)
    await expect(map.quizAdvance).toHaveCount(0)
    const replayStates = await map.quizOption.evaluateAll((els) =>
      els.map((el) => (el as HTMLElement).dataset.state)
    )
    expect(replayStates.length).toBeGreaterThan(1)
    for (const state of replayStates) expect(state).toBe('idle')
    await expect(map.stepPlayerHost).toBeVisible()
    await expect(map.stepCompletion).toHaveCount(0)

    // Miss it AGAIN → it comes back again. No cap on rounds.
    await map.quizOption.nth(WRONG_FOR_Q0).click()
    await expect(map.quizFeedback).toBeVisible({ timeout: 45_000 })
    await map.quizAdvance.click()
    await expect(map.quizQuestion).toContainText(PRACTICE_Q0_PROMPT)
    await expect(map.quizAdvance).toHaveCount(0)

    // Answer it right → the queue empties → the step completes.
    await map.quizOption.nth(PRACTICE_Q0_ANSWER).click()
    await map.quizAdvance.click()
    await map.absorbCompletionScreen()
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
  })

  test('abandoning a review round writes nothing', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    const { practiceQuiz } = await seedPlayerFixtures(api)
    await makeFixtureLevelPlayable(api, practiceQuiz.step_id)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    const xpBefore = await map.xpValue()

    await map.expandIslandFor(FIXTURE_TOPIC)
    await map.nodesInTopic(FIXTURE_TOPIC, 'current').first().click()
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'quiz', { timeout: 45_000 })
    // Get INTO the replay round — that is the state the limitation is about.
    await map.quizOption.nth(WRONG_FOR_Q0).click()
    await expect(map.quizFeedback).toBeVisible({ timeout: 45_000 })
    await map.quizAdvance.click()
    await map.quizOption.nth(PRACTICE_Q1_ANSWER).click()
    await expect(map.quizAdvance).toBeVisible({ timeout: 45_000 })
    await map.quizAdvance.click()
    await expect(map.quizQuestion).toContainText(PRACTICE_Q0_PROMPT)

    // Close mid-replay: the queue is memory-only, so nothing was written.
    await map.stepHostClose.click()
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })

    const manifest = await api.fetchLevel(FIXTURE_TOPIC, FIXTURE_LEVEL)
    const step = manifest.steps.find((s) => s.id === practiceQuiz.step_id)
    expect(step!.completed).toBe(false)
    expect(await map.xpValue()).toBe(xpBefore)
  })
})

test.describe('Curriculum — quiz player (order questions)', () => {
  test('an order miss spells the sequence out, then the replay accepts the right one', async ({
    page,
    loggedInPage,
  }) => {
    test.slow()
    const { api } = loggedInPage
    const { orderQuiz } = await seedPlayerFixtures(api)
    await makeFixtureLevelPlayable(api, orderQuiz.step_id)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    const xpBefore = await map.xpValue()

    await map.expandIslandFor(FIXTURE_TOPIC)
    await map.nodesInTopic(FIXTURE_TOPIC, 'current').first().click()
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'quiz', { timeout: 45_000 })

    // An order question is ARRANGED, not tapped, so it carries its own commit
    // control — and nothing is graded until it is pressed.
    await expect(map.quizCheck).toBeVisible({ timeout: 45_000 })
    await expect(map.quizAdvance).toHaveCount(0)

    // Commit the presented order. The authored answer is NOT the identity
    // permutation, so this is a miss — and a miss has no single option to mark,
    // which is why the sequence is spelled out instead.
    await map.quizCheck.click()
    await expect(map.quizCorrectOrder).toBeVisible({ timeout: 45_000 })
    const expectedOrder = ORDER_ANSWER.map((i) => ORDER_OPTIONS[i]).join(' → ')
    await expect(map.quizCorrectOrder).toContainText(expectedOrder)
    await expect(map.quizFeedback).toHaveText(ORDER_FEEDBACK)
    // The arrangement is frozen once checked.
    await expect(page.getByRole('button', { name: 'Move down' }).first()).toBeDisabled()

    // The replay re-asks it, unfrozen and uncommitted.
    await map.quizAdvance.click()
    await expect(map.quizCheck).toBeVisible({ timeout: 45_000 })
    await expect(map.quizCorrectOrder).toHaveCount(0)

    // [Rent, Coffee, Gift] → move Rent down twice → [Coffee, Gift, Rent] = the key.
    await page.getByRole('button', { name: 'Move down' }).first().click()
    await page.getByRole('button', { name: 'Move down' }).nth(1).click()
    await map.quizCheck.click()

    await expect(map.quizAdvance).toBeVisible({ timeout: 45_000 })
    await expect(map.quizCorrectOrder).toHaveCount(0)
    await map.quizAdvance.click()
    await map.absorbCompletionScreen()
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
    await expect.poll(async () => map.xpValue(), { timeout: 45_000 }).toBeGreaterThan(xpBefore)
  })
})

test.describe('Curriculum — quiz player (assessment)', () => {
  test('the boss quiz refuses a per-question check', async ({ loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    const { practiceQuiz, bossQuiz } = await seedPlayerFixtures(api)
    await makeFixtureLevelPlayable(api, bossQuiz.step_id)

    // The practice quiz answers; the assessment quiz refuses — that refusal is
    // what keeps one step on one mechanic.
    const boss = await api.checkStepQuestion(bossQuiz.step_id, 0, BOSS_ANSWER_INDEX)
    expect(boss.status).toBe(400)
    expect(String(boss.body.detail)).toContain('complete/')

    const practice = await api.checkStepQuestion(practiceQuiz.step_id, 0, PRACTICE_Q0_ANSWER)
    expect(practice.status).toBe(200)
    expect(practice.body.correct).toBe(true)
  })

  test('the boss quiz still grades as one batch', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    const { bossQuiz } = await seedPlayerFixtures(api)
    await makeFixtureLevelPlayable(api, bossQuiz.step_id)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    const xpBefore = await map.xpValue()

    await map.expandIslandFor(FIXTURE_TOPIC)
    await map.nodesInTopic(FIXTURE_TOPIC, 'current').first().click()
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'quiz', { timeout: 45_000 })

    // Batch mode: Submit is the mechanic. Assert the POSITIVE first — `quizSubmit`
    // renders only when `!isPractice`, so it is the assertion that actually fails
    // if the mode regressed. The two negatives below would both pass at t=0 under
    // either mode (the check request is still in flight), so on their own they
    // prove nothing.
    await map.quizOption.nth(BOSS_ANSWER_INDEX).click()
    await expect(map.quizSubmit).toBeVisible({ timeout: 45_000 })
    await expect(map.quizAdvance).toHaveCount(0)
    await expect(map.quizOption.nth(BOSS_ANSWER_INDEX)).toHaveAttribute('data-state', 'idle')
    await map.quizSubmit.click()

    await map.absorbCompletionScreen()
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
    await expect.poll(async () => map.xpValue(), { timeout: 45_000 }).toBe(xpBefore + BOSS_QUIZ_XP)
  })

  test('a failed batch submit still shows the review screen and its second look', async ({
    page,
    loggedInPage,
  }) => {
    test.slow()
    const { api } = loggedInPage
    const { bossQuiz } = await seedPlayerFixtures(api)
    await makeFixtureLevelPlayable(api, bossQuiz.step_id)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    await map.expandIslandFor(FIXTURE_TOPIC)
    await map.nodesInTopic(FIXTURE_TOPIC, 'current').first().click()
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'quiz', { timeout: 45_000 })

    // The batch-fail branch is LIVE code until phase 32 re-bases the boss quiz as
    // a section quiz, so it needs a test — the practice rewrite never reaches it.
    const wrong = BOSS_ANSWER_INDEX === 0 ? 1 : 0
    await map.quizOption.nth(wrong).click()
    await map.quizSubmit.click()

    const result = map.quizResult.first()
    await expect(result).toBeVisible({ timeout: 45_000 })
    await expect(result).toHaveAttribute('data-correct', 'false')
    await expect(map.quizFeedback).toBeVisible()
    await expect(map.stepPlayerHost).toBeVisible()
    await expect(map.stepCompletion).toHaveCount(0)

    // Second look: the missed question comes back with its answer blanked.
    await map.quizRetry.click()
    await expect(map.quizQuestion).toBeVisible()
    await expect(map.quizSubmit).toBeDisabled()
    await map.quizOption.nth(BOSS_ANSWER_INDEX).click()
    await map.quizSubmit.click()

    await map.absorbCompletionScreen()
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
  })
})
