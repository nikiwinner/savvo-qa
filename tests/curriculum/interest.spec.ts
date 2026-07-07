/**
 * Curriculum — the Interest topic plays end-to-end (Phase 26, Story 26.3/26.6)
 *
 * Interest (Section 3, `interest`) is the section's first knowledge top-up on the
 * frozen engine — it exercises the two NEW players (🧮 Sandbox + 🎭 Scenario)
 * alongside the v1 Lesson/Quiz, capped by the `interest-boss` QUIZ checkpoint that
 * reveals the topic crest. It is honestly KNOWLEDGE-ONLY (no applied mission, no
 * real-money figure); XP feeds Bar #1 only.
 *
 * Pollution-safety (gotcha #26): Interest is REAL seeded content, so this file
 * seeds NO global `Step` — every fixture in `helpers/interestFixtures.ts` is
 * PER-USER progress (`StepCompletion`), `request.user`-scoped. Each test uses a
 * fresh `loggedInPage` user, so the specs are idempotent across the DB's cross-run
 * persistence. `test.slow()` + 45s waits absorb the single-threaded QA stack's
 * cold-start; URLs come from `process.env.BACKEND_URL/FRONTEND_URL` (via the
 * ApiHelper / baseURL) — never a hard-coded :8000/:5173.
 */
import { test, expect } from '../../fixtures/index'
import { CurriculumMapPage } from '../../pages/CurriculumMapPage'
import {
  unlockInterest,
  completeInterestLevels,
  I_L1_MONEY_EARNS,
  I_L2_READING_RATE,
  I_L3_COMPOUNDING,
  I_L4_BOTH_WAYS,
  I_L5_TIME,
  I_L2_QUIZ_ANSWERS,
  I_BOSS_ANSWERS,
} from '../../helpers/interestFixtures'

test.describe('Curriculum — Interest topic', () => {
  test('the Interest topic unlocks once Saving is complete', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    const map = new CurriculumMapPage(page)

    // Prereq-locked for a fresh user (interest ← saving ← budgeting ← smart-spending).
    await map.goto(45_000)
    await expect(map.topic('interest')).toHaveAttribute('data-topic-status', 'locked')
    expect(await map.nodesInTopic('interest', 'current').count()).toBe(0)

    // Complete the whole Saving chain → interest flips available + gains a current node.
    await unlockInterest(api)
    await map.goto(45_000)
    await expect(map.topic('interest')).toHaveAttribute('data-topic-status', 'available')
    // The topic sits in a collapsed island (Phase 27 accordion) — expand it to
    // confirm the freshly-unlocked current node renders.
    await map.expandIslandFor('interest')
    await expect(map.nodesInTopic('interest', 'current').first()).toBeVisible()
  })

  test('a lesson, a sandbox and a scenario in Interest complete and award XP', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    await unlockInterest(api)
    // L1 done → L2 `reading-a-rate` is the current node.
    await completeInterestLevels(api, I_L1_MONEY_EARNS)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    const xp0 = await map.xpValue()
    expect(xp0).toBe(0)

    // L2: lesson `nominal-vs-effective` → `rate-decoder` SANDBOX (banner shown) →
    // quiz `per-month-vs-per-year`. The whole level closes and XP lands.
    await map.openCurrentNode('interest')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'lesson')
    await map.playLessonDeck()
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'sandbox', { timeout: 45_000 })
    await expect(map.sandboxBanner).toBeVisible()
    await map.completeSandbox()
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'quiz', { timeout: 45_000 })
    await map.answerMcqQuiz(I_L2_QUIZ_ANSWERS)
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
    await expect.poll(async () => map.xpValue(), { timeout: 45_000 }).toBeGreaterThan(xp0)

    // L3 `the-compounding-curve` is now current: lesson `simple-vs-compound` →
    // `compound-calculator` SANDBOX → `front-load-vs-drip` SCENARIO → XP rises again.
    await map.goto(45_000)
    const xp1 = await map.xpValue()
    await map.openCurrentNode('interest')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'lesson')
    await map.playLessonDeck()
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'sandbox', { timeout: 45_000 })
    await expect(map.sandboxBanner).toBeVisible()
    await map.completeSandbox()
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'scenario', { timeout: 45_000 })
    await map.playScenarioToEnd()
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
    await expect.poll(async () => map.xpValue(), { timeout: 45_000 }).toBeGreaterThan(xp1)

    // API parity — the on-screen XP traces to real ledger rows (Bar #1 only).
    expect((await api.getCurriculumMap()).bars.knowledge.xp_total).toBeGreaterThan(xp1)
  })

  test('the Interest quiz-boss capstone reveals a crest', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    await unlockInterest(api)
    // Everything up to the capstone done → the L6 `interest-boss` checkpoint is current.
    await completeInterestLevels(api, I_L1_MONEY_EARNS, I_L2_READING_RATE, I_L3_COMPOUNDING, I_L4_BOTH_WAYS, I_L5_TIME)

    const crestBefore = (await api.getCurriculumMap()).bars.knowledge.crest_count

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    // The quiz-boss is the sole current node → answer the mixed mastery set all
    // correct → PASS completes the checkpoint level.
    await map.openCurrentNode('interest')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'quiz')
    await map.answerMcqQuiz(I_BOSS_ANSWERS)

    // The checkpoint crest reveal fires; the real crest count rose by exactly one.
    await expect(map.crestReveal).toBeVisible({ timeout: 45_000 })
    const crestAfter = (await api.getCurriculumMap()).bars.knowledge.crest_count
    expect(crestAfter).toBe(crestBefore + 1)
    // …and the on-screen Bar #1 chip shows the SAME real number (live refresh).
    await expect.poll(() => map.crestCountValue(), { timeout: 15_000 }).toBe(crestAfter)
  })
})
