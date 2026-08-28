/**
 * Curriculum — the Earning money topic plays end-to-end (Phase 29, Stories 29.1/29.2/29.5)
 *
 * Earning money (Section 1, `earning-money`) is the FIRST applied topic authored
 * OUTSIDE the Save & Grow proving slice, on the frozen engine. It hooks the user's
 * real `type='income'` rows — the income side of the ledger — across 5 levels /
 * 12 steps: L1 lesson + quiz + the NEW row-verified `log-your-income` mission; L2
 * lesson + the legacy self_attest inventory mission; L3 lesson + a branching
 * scenario + an order quiz; L4 a labeled growth sandbox + two self_attest
 * commitments; L5 the row-verified `sketch-your-income-mix` capstone. It has NO
 * prereq chain (AVAILABLE to a fresh user), so there is no `unlock*` helper.
 *
 * Guided-v2 missions (Phase 29 Amendment 1): every earning-money mission is a
 * guided flow (intro → optional path chooser → screens → terminal). The two
 * row-verified missions (`log-your-income`, the capstone) end in a `Verify` button
 * that checks real income rows; the three commitments end in an explicit
 * `mission-attest` NAMING the action → a REPORTED pass ("Done. Your word is the receipt",
 * no snapshot). The capstone is a PURE `income_rows_exist{min_count:1}` check now —
 * the old `any_of` self-attest arm is GONE, so a data-less user gets an honest FAIL.
 *
 * Two blocks:
 *   • APPLIED HAPPY PATH — the L1 lesson/quiz award XP; `log-your-income` FAILs
 *     with no income row and PASSes once ≥1 exists; the L3 scenario + L4 sandbox
 *     complete with zero financial rows; `sell-something-idle` offers two authored
 *     paths; the capstone PASSes (row-verified, `self_attested:false`) with income
 *     rows → the topic crest, and FAILS honestly with zero income rows.
 *   • FOLD-IN GUARDS — a completed earn-career chapter shows the "…every level
 *     done." guide copy (I4); the topic surface shows only the traceable Bar #2 money
 *     figure (no-fake-numbers).
 *
 * Pollution-safety (gotcha #26): Earning money is REAL seeded content, so this file
 * seeds NO global `Step` — every fixture in `helpers/earnFixtures.ts` is PER-USER
 * progress (StepCompletion) plus the user's OWN income rows, `request.user`-scoped.
 * Each test uses a fresh `loggedInPage` user, so the specs are idempotent across the
 * DB's cross-run persistence. `test.slow()` + 45s waits absorb the single-threaded
 * QA stack's cold-start; URLs come from `process.env.BACKEND_URL/FRONTEND_URL` (via
 * the ApiHelper / baseURL) — never a hard-coded :8000/:5173.
 */
import { test, expect } from '../../fixtures/index'
import { CurriculumMapPage } from '../../pages/CurriculumMapPage'
import {
  completeEarnCareerSection,
  completeEarningMoneyLevels,
  seedIncomeRows,
  EM_L1_INCOME_IS_A_NUMBER,
  EM_L2_EARNING_INVENTORY,
  EM_L3_ACTIVE_PASSIVE,
  EM_L4_PLANT_ONE_NEW_STREAM,
  EM_PRE_CAPSTONE_LEVELS,
  EM_L1_QUIZ_ANSWERS,
  EM_L1_LESSON_SLUG,
  EM_L1_QUIZ_SLUG,
  EM_L4_SANDBOX_SLUG,
  EM_L4_ONE_SMALL_ASK_SLUG,
} from '../../helpers/earnFixtures'

// Money/currency tripwire (same shape as map.spec / saving.spec / net-wealth.spec):
// any currency symbol, a currency-formatted decimal, or an ISO code. The learn
// surface shows exactly ONE legal money figure — Bar #2 (Net Wealth), Phase 25 —
// and nothing else money; XP / crest / streak stay money-free (no
// fake numbers). The labeled growth sandbox renders money only INSIDE its player
// (never on the map surface this asserts).
const MONEY_PATTERN = /[€$£¥]|\b\d+[.,]\d{2}\b|\bEUR\b|\bUSD\b|\bGBP\b/

test.describe('Curriculum — Earning money topic (applied happy path)', () => {
  test('earning-money is available to a fresh user with no chain to unlock', async ({ page, loggedInPage: _ }) => {
    test.slow()
    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    // Section 1 topic 1, `prerequisite_slugs=[]` → AVAILABLE with no chain to
    // complete first (unlike the prereq-locked Save & Grow topics).
    await expect(map.topic('earning-money')).toHaveAttribute('data-topic-status', /available|in_progress/)

    // A `current` node is present once the chapter is on-stage (L1 income-is-a-number).
    await map.expandIslandFor('earning-money')
    await expect(map.nodesInTopic('earning-money', 'current').first()).toBeVisible()
  })

  test('the L1 lesson and quiz complete and award XP', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    await api.getCurriculumMap() // seed the tree

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    expect((await api.getCurriculumMap()).bars.knowledge.xp_total).toBe(0)

    // L1 income-is-a-number is the fresh current node: lesson `income-is-data`
    // (order 1, an interactive v2 deck) → quiz `spot-the-income` (order 2, all MCQ).
    // The L1 `log-your-income` mission (order 3) is NOT reached here — the level
    // stays OPEN after the quiz, so the map's xp-total behind the host is not
    // refreshed; assert the SERVER truth (Bar #1 ledger), which the lesson + quiz
    // completions have already written.
    await map.openCurrentNode('earning-money')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'lesson')
    await map.playLessonDeck()
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'quiz', { timeout: 45_000 })
    await map.answerMcqQuiz(EM_L1_QUIZ_ANSWERS)

    // XP rose from the real ledger (lesson + all-correct quiz), traceable to Bar #1.
    await expect
      .poll(async () => (await api.getCurriculumMap()).bars.knowledge.xp_total, { timeout: 45_000 })
      .toBeGreaterThan(0)
  })

  test('logging a real income row passes the L1 mission', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    await api.getCurriculumMap() // seed the tree
    // Pre-complete the L1 lesson + quiz (per-step, writes NO XP) so the
    // `log-your-income` MISSION is the active step, then seed ONE real income row
    // so the row-verified check PASSES.
    await api.seedStepCompletion({ level_slug: EM_L1_INCOME_IS_A_NUMBER, step_slug: EM_L1_LESSON_SLUG })
    await api.seedStepCompletion({ level_slug: EM_L1_INCOME_IS_A_NUMBER, step_slug: EM_L1_QUIZ_SLUG })
    await seedIncomeRows(api, 1)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    const xpBefore = await map.xpValue()
    expect(xpBefore).toBe(0)

    await map.openCurrentNode('earning-money')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'mission')
    // Row-verified guided-v2 flow: the first screen is an action carrying the income
    // deep-link; NOT a self_attest label. Walk the two action screens to the Verify
    // terminal (the deep-link is asserted, never tapped — it would navigate away).
    await expect(map.missionScreen).toHaveAttribute('data-screen-kind', 'action')
    await expect(map.missionDeeplink).toBeVisible()
    await expect(map.missionSelfAttest).toHaveCount(0)
    await map.walkMissionFlow()

    // Verify → PASS against the real income row → the fact-named lead + a snapshot
    // naming the income count, tappable to the income-filtered transaction list.
    await map.missionVerify.click()
    await expect(map.missionPassLead).toBeVisible({ timeout: 45_000 })
    await expect(map.verifierSnapshot).toBeVisible()
    await expect(map.missionReportedLead).toHaveCount(0)
    await expect(map.snapshotFigure.first()).toContainText('1')
    await expect(map.snapshotFigure.first()).toHaveAttribute('href', /\/dashboard\/transactions/)

    // Continue → the mission completes → real XP lands (traceable to the ledger).
    await map.missionContinue.click()
    await expect.poll(async () => map.xpValue(), { timeout: 45_000 }).toBeGreaterThan(xpBefore)
  })

  test('a deep-link excursion offers a way back and returns INTO the focused chapter', async ({
    page,
    loggedInPage,
  }) => {
    test.slow()
    const { api } = loggedInPage
    await api.getCurriculumMap() // seed the tree
    await api.seedStepCompletion({ level_slug: EM_L1_INCOME_IS_A_NUMBER, step_slug: EM_L1_LESSON_SLUG })
    await api.seedStepCompletion({ level_slug: EM_L1_INCOME_IS_A_NUMBER, step_slug: EM_L1_QUIZ_SLUG })
    await seedIncomeRows(api, 1)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    await map.openCurrentNode('earning-money')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'mission')
    await expect(map.learnPage).toHaveAttribute('data-mode', 'focus')

    // TAP the deep link — the excursion the pill exists for. (The other mission
    // specs only ASSERT it, because tapping navigates away from the map.)
    await map.missionDeeplink.click()
    await expect(page).toHaveURL(/\/dashboard\/transactions/)
    await expect(map.resumePill).toBeVisible({ timeout: 45_000 })

    // Back to Learn → the step reopens where it was left…
    await map.resumeContinue.click()
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'mission', { timeout: 45_000 })

    // …INSIDE the focused chapter. REGRESSION GUARD: the resume ran inside a
    // reactive pass, so the chapter body opened while the view mode stayed
    // `world` — the island serpentine rendered underneath the open chapter.
    await expect(map.learnPage).toHaveAttribute('data-mode', 'focus')
    await expect(map.map).toHaveAttribute('data-mode', 'focus')
    await expect(map.islandToggle.first()).toBeHidden()
    await expect(map.focusBack).toBeVisible()
    // On Learn the pill stands down — the map reopened the step by itself.
    await expect(map.resumePill).toHaveCount(0)

    // Finishing the resumed step keeps the chapter view and drops the breadcrumb.
    await map.walkMissionFlow()
    await map.missionVerify.click()
    await expect(map.missionPassLead).toBeVisible({ timeout: 45_000 })
    await map.missionContinue.click()
    await map.absorbCompletionScreen()
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
    await expect(map.learnPage).toHaveAttribute('data-mode', 'focus')
    await expect(map.islandToggle.first()).toBeHidden()

    // The excursion is over: no pill anywhere, including back off Learn.
    await page.goto('/dashboard/transactions')
    await expect(map.resumePill).toHaveCount(0)
  })

  test('a data-less L1 mission fails honestly', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    await api.getCurriculumMap() // seed the tree
    // L1 lesson + quiz done → the `log-your-income` mission is active; seed NO income.
    await api.seedStepCompletion({ level_slug: EM_L1_INCOME_IS_A_NUMBER, step_slug: EM_L1_LESSON_SLUG })
    await api.seedStepCompletion({ level_slug: EM_L1_INCOME_IS_A_NUMBER, step_slug: EM_L1_QUIZ_SLUG })

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    const xpBefore = await map.xpValue()
    expect(xpBefore).toBe(0)

    await map.openCurrentNode('earning-money')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'mission')
    await expect(map.missionSelfAttest).toHaveCount(0)
    // The first screen carries the deep-link CTA to go log a real income row.
    await expect(map.missionScreen).toHaveAttribute('data-screen-kind', 'action')
    await expect(map.missionDeeplink).toBeVisible()
    await map.walkMissionFlow()

    // Zero income rows → honest FAIL: no completion, no snapshot, zero XP, host open.
    // No fabricated pass / figure.
    await map.missionVerify.click()
    await expect(map.missionFailNote).toBeVisible({ timeout: 45_000 })
    await expect(map.verifierSnapshot).toHaveCount(0)
    await expect(map.stepPlayerHost).toBeVisible()
    expect(await map.xpValue()).toBe(xpBefore)
    expect((await api.getCurriculumMap()).bars.knowledge.xp_total).toBe(0)

    // After the honest FAIL the mission stays open; the deep-link CTA (on the action
    // screen, NOT the fail terminal) is still reachable by stepping Back through the
    // guided flow — the user can go do it for real, then verify again.
    const back = map.stepPlayerHost.getByRole('button', { name: 'Back' })
    for (let i = 0; i < 3 && !(await map.missionDeeplink.isVisible().catch(() => false)); i++) {
      await back.click()
    }
    await expect(map.missionDeeplink).toBeVisible()
  })

  test('the L3 scenario and sandbox complete with no financial data', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    // L1 + L2 done → L3 active-passive-one-off is current: lesson `three-machines`
    // → scenario `whose-income-survives` → quiz `rank-by-passive`.
    await completeEarningMoneyLevels(api, [EM_L1_INCOME_IS_A_NUMBER, EM_L2_EARNING_INVENTORY])

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    expect((await api.getCurriculumMap()).bars.knowledge.xp_total).toBe(0)

    // Play the L3 lesson → the scenario auto-mounts → walk it to a terminal. Both
    // are knowledge steps: they award XP even with zero financial rows (a data-less
    // user still learns). The L3 order-quiz remains, so the level
    // stays OPEN and the map display is stale — assert the SERVER Bar #1 ledger.
    await map.openCurrentNode('earning-money')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'lesson')
    await map.playLessonDeck()
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'scenario', { timeout: 45_000 })
    await map.playScenarioToEnd()
    await expect
      .poll(async () => (await api.getCurriculumMap()).bars.knowledge.xp_total, { timeout: 45_000 })
      .toBeGreaterThan(0)
    const xpAfterL3Play = (await api.getCurriculumMap()).bars.knowledge.xp_total

    // Close the host (the L3 order-quiz remains but is not needed here), seed-
    // complete L3 (writes NO XP), and reopen so L4 plant-one-new-stream is current:
    // sandbox `income-stream-boost` (order 1) → the two self_attest commitments.
    await map.stepHostClose.click()
    await expect(map.stepPlayerHost).toBeHidden()
    await completeEarningMoneyLevels(api, [EM_L3_ACTIVE_PASSIVE])

    await map.goto(45_000)
    await map.openCurrentNode('earning-money')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'sandbox')
    // The mandatory hypothetical banner renders (labeled, never a real balance).
    await expect(map.sandboxBanner).toBeVisible()
    await map.completeSandbox()

    // The sandbox awarded XP with zero financial rows (server truth — the L4
    // commitments remain, so the host stays open and the display is stale).
    await expect
      .poll(async () => (await api.getCurriculumMap()).bars.knowledge.xp_total, { timeout: 45_000 })
      .toBeGreaterThan(xpAfterL3Play)
  })

  test('the capstone passes and reveals the topic crest with income rows', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    // Complete the four levels before the capstone + seed 2 income rows so the pure
    // `income_rows_exist{min_count:1}` capstone verifies PASS against real rows.
    await completeEarningMoneyLevels(api, EM_PRE_CAPSTONE_LEVELS)
    await seedIncomeRows(api, 2)

    const crestBefore = (await api.getCurriculumMap()).bars.knowledge.crest_count
    expect(crestBefore).toBe(0)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    // The capstone (L5 checkpoint) is the sole current node → a guided-v2 row-verified
    // mission (Verify terminal + snapshot), NOT self_attest. Its flow is ONE action
    // screen (the recap choice was cut 2026-08-08) → walk it to the Verify terminal.
    await map.openCurrentNode('earning-money')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'mission')
    await expect(map.missionSelfAttest).toHaveCount(0)
    await map.walkMissionFlow()

    // Capture the verify response — the capstone is a PURE row check (Amendment 1
    // retired the `any_of` self-attest arm), so a verified pass is never self-attested.
    const verifyResp = page.waitForResponse(
      (r) => r.url().includes('/verify/') && r.request().method() === 'POST',
    )
    await map.missionVerify.click()
    const body = (await (await verifyResp).json()) as { passed: boolean; self_attested: boolean }
    expect(body.passed).toBe(true)
    expect(body.self_attested).toBe(false)

    // The fact-named verified lead + a real snapshot (no reported-pass lead).
    await expect(map.missionPassLead).toBeVisible({ timeout: 45_000 })
    await expect(map.verifierSnapshot).toBeVisible()
    await expect(map.missionReportedLead).toHaveCount(0)
    await map.missionContinue.click()

    // The checkpoint crest reveal fires; the real crest count rose by exactly one.
    await expect(map.crestReveal).toBeVisible({ timeout: 45_000 })
    const crestAfter = (await api.getCurriculumMap()).bars.knowledge.crest_count
    expect(crestAfter).toBe(crestBefore + 1)
  })

  test('the capstone fails honestly with no income rows', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    // Complete the four preceding levels but seed NO income row → the pure
    // `income_rows_exist{min_count:1}` capstone has no real row to verify. Amendment 1
    // removed the auto-passing self-attest arm, so this is an honest FAIL — never a
    // fabricated pass.
    await completeEarningMoneyLevels(api, EM_PRE_CAPSTONE_LEVELS)

    const crestBefore = (await api.getCurriculumMap()).bars.knowledge.crest_count
    expect(crestBefore).toBe(0)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    await map.openCurrentNode('earning-money')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'mission')
    await map.walkMissionFlow()

    // Verify with zero income rows → honest FAIL: no snapshot, no reported pass, host
    // stays open, and NO crest is awarded.
    const verifyResp = page.waitForResponse(
      (r) => r.url().includes('/verify/') && r.request().method() === 'POST',
    )
    await map.missionVerify.click()
    const body = (await (await verifyResp).json()) as { passed: boolean }
    expect(body.passed).toBe(false)

    await expect(map.missionFailNote).toBeVisible({ timeout: 45_000 })
    await expect(map.verifierSnapshot).toHaveCount(0)
    await expect(map.missionReportedLead).toHaveCount(0)
    await expect(map.crestReveal).toHaveCount(0)
    await expect(map.stepPlayerHost).toBeVisible()
    expect((await api.getCurriculumMap()).bars.knowledge.crest_count).toBe(crestBefore)
  })

  test('sell-something-idle offers two paths and reports via the alternative', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    // Reach the L4 `sell-something-idle` mission (order 3): complete L1–L3, then the
    // L4 growth sandbox (order 1) + `one-small-ask` (order 2) so it is the sole
    // incomplete step and the L4 `current` node opens directly onto it.
    await completeEarningMoneyLevels(api, [
      EM_L1_INCOME_IS_A_NUMBER,
      EM_L2_EARNING_INVENTORY,
      EM_L3_ACTIVE_PASSIVE,
    ])
    await api.seedStepCompletion({ level_slug: EM_L4_PLANT_ONE_NEW_STREAM, step_slug: EM_L4_SANDBOX_SLUG })
    await api.seedStepCompletion({ level_slug: EM_L4_PLANT_ONE_NEW_STREAM, step_slug: EM_L4_ONE_SMALL_ASK_SLUG })

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    const xpBefore = await map.xpValue()

    await map.openCurrentNode('earning-money')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'mission')

    // The no-Skip authored ALTERNATIVES: two paths render a chooser (>1 path).
    await expect(map.missionPath).toHaveCount(2)

    // Take the "Nothing to sell" alternative (id `none`) → input → action → attest,
    // reaching the SAME educational goal via a service offer.
    await map.walkMissionFlow('none')
    await expect(map.missionSelfAttest).toBeVisible()
    await expect(map.missionAttest).toBeVisible()
    await map.attestMission()

    // A REPORTED pass — honoured on the user's word, no verifier snapshot.
    await expect(map.missionReportedLead).toBeVisible({ timeout: 45_000 })
    await expect(map.verifierSnapshot).toHaveCount(0)
    await map.missionContinue.click()
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
    await expect.poll(async () => map.xpValue(), { timeout: 45_000 }).toBeGreaterThan(xpBefore)
  })
})

test.describe('Curriculum — Earning money topic (fold-in guards)', () => {
  test('a completed earning-money chapter shows the done guide copy', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    // Complete the WHOLE earn-career section (earning-money's 5 levels + the legacy-
    // mission levels in the other Section-1 topics) so the SECTION crest reads
    // complete — that's what the focused-chapter guide short-circuit keys on (I4).
    await completeEarnCareerSection(api)
    await seedIncomeRows(api, 2)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    // Focus the earn-career chapter (the island holding earning-money) → the guide
    // copy switches to the focused-chapter message.
    await map.expandIslandFor('earning-money')
    await expect(map.guideMessage).toContainText('every level done')
    await expect(map.guideMessage).not.toContainText('up next')
  })

  test('the earning-money surface shows only traceable money figures', async ({ page, loggedInPage: _ }) => {
    test.slow()
    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    await expect(map.map).toBeVisible()
    // earning-money is available to a fresh user (Section 1 topic 1, no prereq).
    await expect(map.topic('earning-money')).toHaveAttribute('data-topic-status', /available|in_progress/)
    await expect(map.barDoing).toHaveAttribute('data-bar-doing', 'live')

    // Bar #2 (Net Wealth) is the ONE legal money figure since Phase 25 — subtract
    // its text and assert the rest of the topic surface is money-free (the labeled
    // growth sandbox renders money only inside its player, never on this surface).
    const pageText = await map.learnPage.innerText()
    const barDoingText = await map.barDoing.innerText()
    const outsideBarDoing = pageText.split(barDoingText).join('')
    expect(outsideBarDoing).not.toMatch(MONEY_PATTERN)
    // Positive control: Bar #2 IS a money figure, so the subtraction above removed
    // something real (a silently-empty Bar #2 would otherwise pass vacuously).
    expect(barDoingText).toMatch(MONEY_PATTERN)
  })
})
