/**
 * Curriculum — the Net wealth topic plays end-to-end (Phase 25, Stories 25.4–25.6)
 *
 * Net wealth (Section 3, `net-wealth`) is the section's payoff and the product's
 * Bar #2 anchor — the first honest, real-data "how you're actually DOING" number.
 * Every mission is plain `account_balances_known` (non-binding): PASS iff the user
 * has ≥1 active account AND every one carries a non-null balance. A fresh user's
 * sole auto-provisioned cash account has a NULL balance, so the missions stay
 * honestly OPEN until a real balance is entered (via the guarded cash-balance
 * PATCH on `/dashboard/settings/banking`).
 *
 * Two blocks:
 *   • APPLIED HAPPY PATH — L1 lesson→quiz award XP; the L2 log-accounts mission
 *     FAILs with a null cash balance → enter a real balance → verify PASS +
 *     snapshot + XP; the capstone PASSes → the Save & Grow section crest + Bar #1
 *     crest count rises; Bar #2 (`data-bar-doing="live"`) shows the entered
 *     (FX-folded) figure + "Score coming soon", tappable to the per-account
 *     breakdown listing the real cash account.
 *   • DATA-LESS HONESTY — a user with no known balance gets the honest FAIL on the
 *     applied missions (deep-link CTA, no completion, zero XP), yet learns every
 *     lesson/quiz; Bar #2 shows "0.00" + a completeness hint, never a fake 0/100.
 *
 * Pollution-safety (gotcha #26): Net wealth is REAL seeded content, so this file
 * seeds NO global `Step` — every fixture in `helpers/netWealthFixtures.ts` is
 * PER-USER progress (StepCompletion / cash-balance), `request.user`-scoped. Each
 * test uses a fresh `loggedInPage` user, so the specs are idempotent across the
 * DB's cross-run persistence. URLs come from `process.env.BACKEND_URL/FRONTEND_URL`
 * (via the ApiHelper / baseURL) — never a hard-coded :8000/:5173.
 */
import { test, expect } from '../../fixtures/index'
import { CurriculumMapPage } from '../../pages/CurriculumMapPage'
import {
  unlockNetWealth,
  completeNetWealthLevels,
  precompleteNetWealthStep,
  setCashBalance,
  netWealthLevel,
  netWealthStepId,
  L1_QUIZ_ANSWERS,
  L1_WHAT_NET_WEALTH,
  L2_FIND_EVERY_ACCOUNT,
  L3_ASSET_VS_LIABILITY,
  L4_BUILD_YOUR_NUMBER,
  L5_WATCH_IT_GROW,
  L6_COMPLETE,
  FORGOTTEN_ACCOUNT_LESSON,
  YOUR_REAL_TOTAL_LESSON,
  SEE_NET_WEALTH_MISSION,
  CLOSE_A_GAP_MISSION,
} from '../../helpers/netWealthFixtures'

// Money/currency tripwire (same shape as map.spec): any currency symbol, a
// currency-formatted decimal, or an ISO code. The learn surface shows exactly
// ONE legal money figure — Bar #2 (Net Wealth), Phase 25 — and nothing else
// money; XP / crest / streak stay money-free (behavior-rules: no fake numbers).
const MONEY_PATTERN = /[€$£¥]|\b\d+[.,]\d{2}\b|\bEUR\b|\bUSD\b|\bGBP\b/

test.describe('Curriculum — Net wealth topic (applied happy path)', () => {
  test('the Net wealth topic unlocks once its prerequisites are complete', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    const map = new CurriculumMapPage(page)

    // Prereq-locked for a fresh user (net-wealth ← saving ← budgeting ← smart-spending).
    await map.goto(45_000)
    await expect(map.topic('net-wealth')).toHaveAttribute('data-topic-status', 'locked')
    expect(await map.nodesInTopic('net-wealth', 'current').count()).toBe(0)

    // Complete all three prereq topics → net-wealth flips available + gains a current node.
    await unlockNetWealth(api)
    await map.goto(45_000)
    await expect(map.topic('net-wealth')).toHaveAttribute('data-topic-status', 'available')
    // The topic sits in a collapsed island (Phase 27 accordion) — expand it to
    // confirm the freshly-unlocked current node renders.
    await map.expandIslandFor('net-wealth')
    await expect(map.nodesInTopic('net-wealth', 'current').first()).toBeVisible()
  })

  test('a lesson and quiz in Net wealth complete and award XP', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    await unlockNetWealth(api)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    const xpBefore = await map.xpValue()
    expect(xpBefore).toBe(0)

    // L1 `what-net-wealth-is` is the current node → the host mounts the lesson
    // (order 1), then auto-advances to the quiz (order 2). The v2 deck carries
    // interactive cards, so playing it taps ≥1 option to advance.
    await map.openCurrentNode('net-wealth')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'lesson')
    const interactiveTapped = await map.playLessonDeck()
    expect(interactiveTapped).toBeGreaterThan(0)

    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'quiz', { timeout: 45_000 })
    // `net-of-assets-debts` — three questions; correct indices [2, 0, 1].
    await map.answerMcqQuiz(L1_QUIZ_ANSWERS)

    // L1 completes → host closes → real XP lands (lesson + quiz), traceable to the ledger.
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
    await expect.poll(async () => map.xpValue(), { timeout: 45_000 }).toBeGreaterThan(xpBefore)
    const payload = await api.getCurriculumMap()
    expect(payload.bars.knowledge.xp_total).toBeGreaterThan(0)
  })

  test('entering a cash balance passes the log-accounts mission', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    await unlockNetWealth(api)
    await completeNetWealthLevels(api, L1_WHAT_NET_WEALTH)
    // Pre-complete the L2 lesson so the log-accounts MISSION is the active step.
    await precompleteNetWealthStep(api, L2_FIND_EVERY_ACCOUNT, FORGOTTEN_ACCOUNT_LESSON)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    const xpBefore = await map.xpValue()
    expect(xpBefore).toBe(0)

    // A plain (non-binding) mission: NO Space picker, NO self_attest, a real
    // deep-link CTA to the cash-balance entry surface.
    await map.openCurrentNode('net-wealth')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'mission')
    await expect(map.spacePicker).toHaveCount(0)
    await expect(map.missionSelfAttest).toHaveCount(0)
    await expect(map.missionDeeplink).toBeVisible()

    // Fresh cash account has a NULL balance → honest FAIL: no completion, no
    // snapshot, zero XP.
    await map.missionVerify.click()
    await expect(map.missionFailNote).toBeVisible({ timeout: 45_000 })
    await expect(map.verifierSnapshot).toHaveCount(0)
    expect(await map.xpValue()).toBe(xpBefore)

    // Enter a REAL balance on the auto-provisioned cash account (the exact PATCH
    // the Banking-settings control drives), then verify again → PASS naming the
    // real account counts (1/1), tappable to the banking surface (no fake numbers).
    await setCashBalance(api, '1500.00', 'EUR')
    await map.missionVerify.click()
    await expect(map.verifierSnapshot).toBeVisible({ timeout: 45_000 })
    await expect(map.snapshotFigure.first()).toContainText('1/1')
    await expect(map.snapshotFigure.first()).toHaveAttribute('href', /\/dashboard\/settings\/banking/)

    // Continue → the mission completes → real XP lands.
    await map.missionContinue.click()
    await expect.poll(async () => map.xpValue(), { timeout: 45_000 }).toBeGreaterThan(xpBefore)
  })

  test('the capstone reveals the Save & Grow section crest', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    await unlockNetWealth(api)
    // Everything up to the capstone done; the L6 checkpoint is the current node.
    await completeNetWealthLevels(
      api,
      L1_WHAT_NET_WEALTH,
      L2_FIND_EVERY_ACCOUNT,
      L3_ASSET_VS_LIABILITY,
      L4_BUILD_YOUR_NUMBER,
      L5_WATCH_IT_GROW,
    )
    // The capstone verifies `account_balances_known` — enter a real cash balance
    // so every account is known (no null gaps).
    await setCashBalance(api, '2750.00', 'EUR')

    const crestBefore = (await api.getCurriculumMap()).bars.knowledge.crest_count

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    // The capstone (L6 checkpoint) is the current node → verify → PASS.
    await map.openCurrentNode('net-wealth')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'mission')
    await map.missionVerify.click()
    await expect(map.verifierSnapshot).toBeVisible({ timeout: 45_000 })
    await expect(map.snapshotFigure.first()).toContainText('1/1')
    await map.missionContinue.click()

    // The checkpoint crest reveal fires; the real crest count rose by exactly one.
    await expect(map.crestReveal).toBeVisible({ timeout: 45_000 })
    const crestAfter = (await api.getCurriculumMap()).bars.knowledge.crest_count
    expect(crestAfter).toBe(crestBefore + 1)
    // …and the on-screen Bar #1 chip shows the SAME real number (live refresh).
    await expect.poll(() => map.crestCountValue(), { timeout: 15_000 }).toBe(crestAfter)

    // API parity — the capstone level reads completed.
    const payload = await api.getCurriculumMap()
    expect(netWealthLevel(payload, L6_COMPLETE).status).toBe('completed')
  })

  test('Bar #2 shows the real Net Wealth figure once a balance is entered', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    await unlockNetWealth(api)

    // Enter a real cash balance — Bar #2 (Net Wealth) folds it into the user's
    // currency (default EUR here → 1:1, no FX seed needed).
    await setCashBalance(api, '3200.50', 'EUR')

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    // Bar #2 is LIVE with the entered figure + "Score coming soon"; with one
    // known account there is no completeness gap, so the hint is absent.
    await expect(map.barDoing).toHaveAttribute('data-bar-doing', 'live')
    await expect(map.netWealthFigure).toContainText('3,200.50')
    await expect(map.netWealthScoreNote).toContainText('Score coming soon')
    await expect(map.netWealthCompletenessHint).toHaveCount(0)

    // API parity — the on-screen figure equals user_net_wealth's total (no XP fed).
    const payload = await api.getCurriculumMap()
    expect(payload.bars.doing?.net_wealth.total).toBe('3200.50')
    expect(payload.bars.doing?.net_wealth.accounts_known).toBe(1)
    expect(payload.bars.doing?.score).toBeNull()

    // Tapping the figure opens the per-account breakdown — every row is one real
    // BankAccount (no-fake-numbers: the total IS the visible sum of the rows).
    await map.openNetWealthBreakdown()
    await expect(map.netWealthTotal).toContainText('3,200.50')
    await expect(map.netWealthAccountRows).toHaveCount(1)
    await expect(map.netWealthAccountRows.first()).toContainText('3,200.50')
    await expect(map.netWealthCompleteness).toContainText('1 / 1')
  })
})

test.describe('Curriculum — Net wealth topic (data-less honesty)', () => {
  test('a data-less user gets the honest FAIL on the log-accounts mission', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    await unlockNetWealth(api)
    await completeNetWealthLevels(api, L1_WHAT_NET_WEALTH)
    // Pre-complete the L2 lesson so the log-accounts mission is the active step.
    await precompleteNetWealthStep(api, L2_FIND_EVERY_ACCOUNT, FORGOTTEN_ACCOUNT_LESSON)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    const xpBefore = await map.xpValue()
    expect(xpBefore).toBe(0)

    await map.openCurrentNode('net-wealth')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'mission')
    await expect(map.missionSelfAttest).toHaveCount(0)
    // The deep-link CTA to go enter a real balance stays present.
    await expect(map.missionDeeplink).toBeVisible()

    // No known balance (auto-provisioned cash account is null) → honest FAIL: no
    // completion, no snapshot, zero XP, host stays open. No fabricated pass/number.
    await map.missionVerify.click()
    await expect(map.missionFailNote).toBeVisible({ timeout: 45_000 })
    await expect(map.verifierSnapshot).toHaveCount(0)
    await expect(map.stepPlayerHost).toBeVisible()
    expect(await map.xpValue()).toBe(xpBefore)
    expect((await api.getCurriculumMap()).bars.knowledge.xp_total).toBe(0)
  })

  test('a data-less user gets the honest FAIL on the build-your-number missions', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    await unlockNetWealth(api)
    await completeNetWealthLevels(api, L1_WHAT_NET_WEALTH, L2_FIND_EVERY_ACCOUNT, L3_ASSET_VS_LIABILITY)
    // Pre-complete the L4 lesson so the `see-your-net-wealth` mission is active.
    await precompleteNetWealthStep(api, L4_BUILD_YOUR_NUMBER, YOUR_REAL_TOTAL_LESSON)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    // Second data-less mission (L4 `see-your-net-wealth`) → honest FAIL, zero XP.
    await map.openCurrentNode('net-wealth')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'mission')
    await expect(map.missionDeeplink).toBeVisible()
    await map.missionVerify.click()
    await expect(map.missionFailNote).toBeVisible({ timeout: 45_000 })
    await expect(map.verifierSnapshot).toHaveCount(0)
    expect((await api.getCurriculumMap()).bars.knowledge.xp_total).toBe(0)

    // API-level parity: the sibling L4 mission FAILs identically with no known
    // balance (the honest FAIL is stable across both build-your-number missions).
    const closeGapStepId = await netWealthStepId(api, L4_BUILD_YOUR_NUMBER, CLOSE_A_GAP_MISSION)
    const seeStepId = await netWealthStepId(api, L4_BUILD_YOUR_NUMBER, SEE_NET_WEALTH_MISSION)
    for (const stepId of [seeStepId, closeGapStepId]) {
      const res = await api.verifyStep(stepId)
      expect(res.passed).toBe(false)
      expect(res.completed).toBe(false)
      expect(res.xp_awarded).toBeNull()
    }
  })

  test('Bar #2 shows 0.00 with a completeness hint, never a fake score', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    await unlockNetWealth(api)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    // A data-less user (sole cash account, null balance) → Bar #2 is LIVE with the
    // honest "0.00" and a completeness hint (0/1), NEVER a fake 0/100 or a score.
    await expect(map.barDoing).toHaveAttribute('data-bar-doing', 'live')
    await expect(map.netWealthFigure).toContainText('0.00')
    await expect(map.netWealthCompletenessHint).toContainText('0/1')
    await expect(map.netWealthScoreNote).toContainText('Score coming soon')

    // The word "score" appears only as "coming soon" — no fabricated N/100 anywhere.
    const barText = await map.barDoing.innerText()
    expect(barText).not.toMatch(/\/\s*100\b/)

    // API parity — the honest empty payload: total 0.00, 0 known, score null.
    const payload = await api.getCurriculumMap()
    expect(payload.bars.doing?.net_wealth.total).toBe('0.00')
    expect(payload.bars.doing?.net_wealth.accounts_known).toBe(0)
    expect(payload.bars.doing?.net_wealth.accounts_total).toBe(1)
    expect(payload.bars.doing?.score).toBeNull()
  })

  test('knowledge steps stay completable with no financial data', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    await unlockNetWealth(api)

    // Genuinely data-less: no known balances (the cash account is null), no rows.
    expect((await api.getNetWealth()).accounts_known).toBe(0)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    const xpBefore = await map.xpValue()
    expect(xpBefore).toBe(0)

    // The L1 lesson + quiz complete + award XP even with zero financial data —
    // learning is never blocked (behavior-rules: a data-less user still learns).
    await map.openCurrentNode('net-wealth')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'lesson')
    await map.playLessonDeck()
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'quiz', { timeout: 45_000 })
    await map.answerMcqQuiz(L1_QUIZ_ANSWERS)

    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
    await expect.poll(async () => map.xpValue(), { timeout: 45_000 }).toBeGreaterThan(xpBefore)
    expect((await api.getCurriculumMap()).bars.knowledge.xp_total).toBeGreaterThan(0)
  })

  test('the only money figure on the Net wealth surface is the traceable Bar #2', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    await unlockNetWealth(api)
    // Enter a real balance so Bar #2 carries a non-zero figure — it must still be
    // the ONLY money figure, and it must tap through to real per-account rows.
    await setCashBalance(api, '900.00', 'EUR')

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    await expect(map.map).toBeVisible()
    await expect(map.barDoing).toHaveAttribute('data-bar-doing', 'live')

    // Money/currency tripwire (same shape as map.spec): the ONE legal money figure
    // is Bar #2; subtract its text and assert the rest of the surface is money-free.
    const pageText = await map.learnPage.innerText()
    const barDoingText = await map.barDoing.innerText()
    const outsideBarDoing = pageText.split(barDoingText).join('')
    expect(outsideBarDoing).not.toMatch(MONEY_PATTERN)
    // Positive control: Bar #2 IS a money figure, so the subtraction above removed
    // something real (a silently-empty Bar #2 would otherwise pass vacuously).
    expect(barDoingText).toMatch(MONEY_PATTERN)

    // …and Bar #2 taps through to the real per-account breakdown (no untraceable
    // aggregate — the total is the visible sum of the account rows).
    await map.openNetWealthBreakdown()
    await expect(map.netWealthAccountRows).toHaveCount(1)
    await expect(map.netWealthTotal).toContainText('900.00')
  })
})
