/**
 * Curriculum — the Saving topic plays end-to-end (Phase 23, Stories 23.3–23.5)
 *
 * The Saving topic (Section 3, `saving`) is the FIRST real topic authored on the
 * shipped curriculum engine — it exercises every v1 player (Lesson / Quiz /
 * Mission) AND the multi-step applied flow with cross-step Space binding: create
 * a savings Space → move a real transaction into it → set a routing rule that
 * keeps feeding it, each verified against the user's OWN real rows and all pinned
 * to the ONE Space chosen at the create-Space mission.
 *
 * Two blocks:
 *   • APPLIED HAPPY PATH — the L1→capstone chain drives PASS against real rows,
 *     the L3 Space picker binds the topic, the `for_bound` missions verify the
 *     bound Space, and the checkpoint capstone reveals the Saving crest.
 *   • DATA-LESS HONESTY — a user with zero rows / zero Spaces gets the honest
 *     FAIL on the row-verified missions (never a fabricated pass or number), yet
 *     can still complete every lesson/quiz and earn knowledge-XP up the topic.
 *
 * Pollution-safety (gotcha #26): the Saving content is REAL seeded content now
 * (the runtime seeder authors it), so this file seeds NO global `Step` — every
 * fixture in `helpers/savingFixtures.ts` is PER-USER progress (StepCompletion /
 * XP / spaces / expenses / claim rules), `request.user`-scoped. The persistent QA
 * content DB is never mutated; every test uses a fresh user, so the specs are
 * idempotent across the DB's cross-run persistence.
 *
 * `test.slow()` + 45s waits absorb the single-threaded QA stack's cold-start.
 * URLs come from `process.env.BACKEND_URL/FRONTEND_URL` (via the ApiHelper /
 * baseURL) — never a hard-coded :8000/:5173.
 */
import { test, expect } from '../../fixtures/index'
import { utcToday } from '../../helpers/api'
import { CurriculumMapPage } from '../../pages/CurriculumMapPage'
import {
  unlockSaving,
  completeSavingLevels,
  precompleteSavingStep,
  captureSavingBinding,
  savingLevel,
  L1_PAY_YOURSELF,
  L2_FIND_LEAK,
  L3_A_HOME,
  L4_MOVE_IT,
  L5_AUTOMATIC,
  A_SPACE_LESSON_SLUG,
  AVOIDABLE_LESSON_SLUG,
  MOVING_LESSON_SLUG,
  DECIDE_LESSON_SLUG,
  SAVING_LOOP_QUIZ_SLUG,
} from '../../helpers/savingFixtures'

// Money/currency tripwire (same shape as map.spec): any currency symbol, a
// currency-formatted decimal, or an ISO code. The learn surface shows exactly
// ONE legal money figure — Bar #2 (Net Wealth), Phase 25 — and nothing else
// money; XP / crest / streak stay money-free (behavior-rules: no fake numbers).
const MONEY_PATTERN = /[€$£¥]|\b\d+[.,]\d{2}\b|\bEUR\b|\bUSD\b|\bGBP\b/

test.describe('Curriculum — Saving topic (applied happy path)', () => {
  test('the Saving topic unlocks once its prerequisites are complete', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    const map = new CurriculumMapPage(page)

    // Prereq-locked for a fresh user (saving ← budgeting ← smart-spending).
    await map.goto(45_000)
    await expect(map.topic('saving')).toHaveAttribute('data-topic-status', 'locked')
    expect(await map.nodesInTopic('saving', 'current').count()).toBe(0)

    // Complete both prereq topics → saving flips available + gains a current node.
    await unlockSaving(api)
    await map.goto(45_000)
    await expect(map.topic('saving')).toHaveAttribute('data-topic-status', 'available')
    await expect(map.nodesInTopic('saving', 'current').first()).toBeVisible()
  })

  test('a lesson and quiz in Saving complete and award XP', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    await unlockSaving(api)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    const xpBefore = await map.xpValue()
    expect(xpBefore).toBe(0)

    // L1 `pay-yourself-first` is saving's current node → the host mounts the
    // lesson (order 1), then auto-advances to the quiz (order 2). The v2 deck now
    // carries an interactive card, so playing it must tap ≥1 option to advance
    // (Phase 24 — the applied happy-path still reaches the crest).
    await map.openCurrentNode('saving')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'lesson')
    const interactiveTapped = await map.playLessonDeck()
    expect(interactiveTapped).toBeGreaterThan(0)

    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'quiz', { timeout: 45_000 })
    // `guarantee-the-gap` — three MCQs, correct option index 1 each.
    await map.answerMcqQuiz([1, 1, 1])

    // L1 now ends on the `payday-order` SCENARIO (Story 26.5 backfill) — walk it to
    // a terminal before the level can close.
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'scenario', { timeout: 45_000 })
    await map.playScenarioToEnd()

    // L1 completes → host closes → real XP lands (lesson + quiz + scenario),
    // traceable to the ledger.
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
    await expect.poll(async () => map.xpValue(), { timeout: 45_000 }).toBeGreaterThan(xpBefore)
    const payload = await api.getCurriculumMap()
    expect(payload.bars.knowledge.xp_total).toBeGreaterThan(0)
  })

  test('creating a savings Space binds it and both L3 missions complete the level', async ({
    page,
    loggedInPage,
  }) => {
    test.slow()
    const { api } = loggedInPage
    const space = await api.createSpace('QA Savings Home')
    await unlockSaving(api)
    await completeSavingLevels(api, L1_PAY_YOURSELF, L2_FIND_LEAK)
    // Pre-complete the L3 lesson so only the two missions remain — the host mounts
    // the create-Space mission (order 1), then the self_attest reflection (order 2).
    await precompleteSavingStep(api, L3_A_HOME, A_SPACE_LESSON_SLUG)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    const xpBefore = await map.xpValue()
    expect(xpBefore).toBe(0)

    // The `binds_space` create-Space mission shows the Space picker with the real
    // Space as an option; designate it, then verify.
    await map.openCurrentNode('saving')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'mission')
    await expect(map.spacePicker).toBeVisible()
    await expect(map.pickerRadios.first()).toBeVisible()
    await map.pickerRadios.first().check()
    await map.missionVerify.click()

    // PASS against real rows → the snapshot names the real Space id (tappable to
    // its source rows — no fake numbers).
    await expect(map.verifierSnapshot).toBeVisible({ timeout: 45_000 })
    const figure = map.snapshotFigure.first()
    await expect(figure).toContainText(String(space.id))
    await expect(figure).toHaveAttribute('href', /\/dashboard\/spaces/)

    // Continue → host auto-advances to the self_attest reflection → "Mark done".
    await map.missionContinue.click()
    await expect(map.missionSelfAttest).toBeVisible({ timeout: 45_000 })
    await map.missionVerify.click()

    // Both missions done + lesson pre-completed → L3 completes → host closes.
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
    await expect.poll(async () => map.xpValue(), { timeout: 45_000 }).toBeGreaterThan(xpBefore)

    // API parity — L3 reads completed (both missions counted).
    const payload = await api.getCurriculumMap()
    expect(savingLevel(payload, L3_A_HOME).status).toBe('completed')
  })

  test('the first-deposit mission fails then passes against the bound Space', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    const space = await api.createSpace('QA Deposit Home')
    await unlockSaving(api)
    await completeSavingLevels(api, L1_PAY_YOURSELF, L2_FIND_LEAK, L3_A_HOME)
    // Pin the topic binding to THIS Space (the same path the L3 picker drives).
    await captureSavingBinding(api, space.id)
    // Pre-complete the L4 lesson so the first-deposit mission is the active step.
    await precompleteSavingStep(api, L4_MOVE_IT, MOVING_LESSON_SLUG)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    await map.openCurrentNode('saving')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'mission')
    // A `for_bound` mission: NO Space picker, NO self_attest, a real deep-link CTA.
    await expect(map.spacePicker).toHaveCount(0)
    await expect(map.missionSelfAttest).toHaveCount(0)
    await expect(map.missionDeeplink).toBeVisible()

    // No attribution to the bound Space yet → honest FAIL, no snapshot.
    await map.missionVerify.click()
    await expect(map.missionFailNote).toBeVisible({ timeout: 45_000 })
    await expect(map.verifierSnapshot).toHaveCount(0)

    // Attribute a REAL row into the bound Space, then verify again → PASS naming
    // the SAME Space id.
    await api.createExpense({
      space: space.id,
      description: 'QA first deposit',
      amount: 50,
      expense_date: utcToday(),
    })
    await map.missionVerify.click()
    await expect(map.verifierSnapshot).toBeVisible({ timeout: 45_000 })
    await expect(map.snapshotFigure.first()).toContainText(String(space.id))
  })

  test('completing the L5 rule then the capstone reveals the Saving crest', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    const space = await api.createSpace('QA Crest Home')
    await unlockSaving(api)
    await completeSavingLevels(api, L1_PAY_YOURSELF, L2_FIND_LEAK, L3_A_HOME, L4_MOVE_IT)
    await captureSavingBinding(api, space.id)
    // The capstone verifies all three against the bound Space: it must EXIST, hold
    // a real attributed row, and be fed by a routing rule — set both up for real.
    await api.createExpense({
      space: space.id,
      description: 'QA capstone deposit',
      amount: 75,
      expense_date: utcToday(),
    })
    await api.createClaimRule({ space: space.id, name: 'QA savings rule', merchant_contains: 'payday' })
    // Leave ONLY the L5 rule mission open in L5 (pre-complete its lesson + quiz).
    await precompleteSavingStep(api, L5_AUTOMATIC, DECIDE_LESSON_SLUG)
    await precompleteSavingStep(api, L5_AUTOMATIC, SAVING_LOOP_QUIZ_SLUG)

    const crestBefore = (await api.getCurriculumMap()).bars.knowledge.crest_count

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    // L5 `put-routing-on-autopilot` → PASS (space_exists + claim_rule bound).
    await map.openCurrentNode('saving')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'mission')
    await map.missionVerify.click()
    await expect(map.verifierSnapshot).toBeVisible({ timeout: 45_000 })
    await map.missionContinue.click()
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })

    // Fresh map → the capstone (L6 checkpoint) is now the current node.
    await map.goto(45_000)
    await map.openCurrentNode('saving')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'mission')
    await map.missionVerify.click()
    await expect(map.verifierSnapshot).toBeVisible({ timeout: 45_000 })
    await expect(map.snapshotFigure.first()).toContainText(String(space.id))
    await map.missionContinue.click()

    // The checkpoint crest reveal fires; the real crest count rose by exactly one.
    await expect(map.crestReveal).toBeVisible({ timeout: 45_000 })
    const crestAfter = (await api.getCurriculumMap()).bars.knowledge.crest_count
    expect(crestAfter).toBe(crestBefore + 1)
    // ...and the on-screen Bar #1 chip shows the SAME real number (the map
    // refreshes live behind the host after completion).
    await expect.poll(() => map.crestCountValue(), { timeout: 15_000 }).toBe(crestAfter)
  })
})

test.describe('Curriculum — Saving topic (data-less honesty)', () => {
  test('a data-less user gets the honest FAIL on the leak mission', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    await unlockSaving(api)
    await completeSavingLevels(api, L1_PAY_YOURSELF)
    // Pre-complete the L2 lesson so the leak mission is the active step.
    await precompleteSavingStep(api, L2_FIND_LEAK, AVOIDABLE_LESSON_SLUG)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    const xpBefore = await map.xpValue()
    expect(xpBefore).toBe(0)

    await map.openCurrentNode('saving')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'mission')
    await expect(map.missionSelfAttest).toHaveCount(0)
    // The deep-link CTA to go log real spending stays present.
    await expect(map.missionDeeplink).toBeVisible()

    // No expense rows → honest FAIL: no completion, no snapshot, zero XP.
    await map.missionVerify.click()
    await expect(map.missionFailNote).toBeVisible({ timeout: 45_000 })
    await expect(map.verifierSnapshot).toHaveCount(0)
    await expect(map.stepPlayerHost).toBeVisible()
    expect(await map.xpValue()).toBe(xpBefore)
    expect((await api.getCurriculumMap()).bars.knowledge.xp_total).toBe(0)
  })

  test('a data-less user gets the honest FAIL on the create-Space mission', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    await unlockSaving(api)
    await completeSavingLevels(api, L1_PAY_YOURSELF, L2_FIND_LEAK)
    // The L3 lesson mounts FIRST (order 0 — review-23 M1: teach, then act);
    // pre-complete it so the create-Space MISSION is the step under test.
    // A data-less user CAN always complete a lesson — that's knowledge, not rows.
    await precompleteSavingStep(api, L3_A_HOME, A_SPACE_LESSON_SLUG)
    // No Space created — the picker must offer "create a new Space".

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    await map.openCurrentNode('saving')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'mission')
    // The binds_space create-Space mission: picker present, empty state + create CTA.
    await expect(map.spacePicker).toBeVisible()
    await expect(map.spacePickerEmpty).toBeVisible()
    await expect(map.spacePickerCreate).toBeVisible()

    // Zero Spaces → honest FAIL, no fabricated pass/number.
    await map.missionVerify.click()
    await expect(map.missionFailNote).toBeVisible({ timeout: 45_000 })
    await expect(map.verifierSnapshot).toHaveCount(0)
    await expect(map.stepPlayerHost).toBeVisible()
    expect((await api.getCurriculumMap()).bars.knowledge.xp_total).toBe(0)
  })

  test('knowledge steps stay completable with no financial data', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    await unlockSaving(api)

    // Genuinely data-less: no Spaces, no expenses.
    expect(await api.listSpaces()).toHaveLength(0)
    expect(await api.listExpenses()).toHaveLength(0)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    const xpBefore = await map.xpValue()
    expect(xpBefore).toBe(0)

    // The L1 lesson + quiz complete + award XP even with zero financial rows —
    // learning is never blocked on data.
    await map.openCurrentNode('saving')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'lesson')
    await map.playLessonDeck()
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'quiz', { timeout: 45_000 })
    await map.answerMcqQuiz([1, 1, 1])

    // L1 ends on the `payday-order` SCENARIO (Story 26.5 backfill) — a data-less
    // user still plays it (knowledge, not rows) before the level closes.
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'scenario', { timeout: 45_000 })
    await map.playScenarioToEnd()

    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
    await expect.poll(async () => map.xpValue(), { timeout: 45_000 }).toBeGreaterThan(xpBefore)
    expect((await api.getCurriculumMap()).bars.knowledge.xp_total).toBeGreaterThan(0)
  })

  test('the Saving surface shows only the Bar #2 money figure', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    await unlockSaving(api) // make the whole saving topic visible on the map

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    await expect(map.map).toBeVisible()
    await expect(map.topic('saving')).toHaveAttribute('data-topic-status', 'available')
    // Bar #2 (Net Wealth) is the ONE legal money figure since Phase 25 — subtract
    // its text and assert the rest of the topic surface is money-free.
    await expect(map.barDoing).toHaveAttribute('data-bar-doing', 'live')

    const pageText = await map.learnPage.innerText()
    const barDoingText = await map.barDoing.innerText()
    const outsideBarDoing = pageText.split(barDoingText).join('')
    // XP / crest / streak only — the topic surface never renders money elsewhere.
    expect(outsideBarDoing).not.toMatch(MONEY_PATTERN)
    // Positive control: Bar #2 IS a money figure, so the subtraction above removed
    // something real (a silently-empty Bar #2 would otherwise pass vacuously).
    expect(barDoingText).toMatch(MONEY_PATTERN)
  })
})
