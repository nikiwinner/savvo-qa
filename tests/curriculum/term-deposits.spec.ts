/**
 * Curriculum — the Term deposits topic plays end-to-end (Phase 26, Story 26.4/26.6)
 *
 * Term deposits (Section 3, `term-deposits`) is the section's second knowledge
 * top-up — it leans hardest on the two NEW players (the lock-up + ladder 🧮
 * Sandboxes and the branching 🎭 Scenarios), capped by the `park-this-money-boss`
 * SCENARIO checkpoint. A scenario capstone crests exactly like a quiz/mission
 * capstone — the crest derives from the completed checkpoint level, not the step
 * kind. It is honestly KNOWLEDGE-ONLY; XP feeds Bar #1 only.
 *
 * Pollution-safety (gotcha #26): Term deposits is REAL seeded content, so this
 * file seeds NO global `Step` — every fixture in `helpers/termDepositsFixtures.ts`
 * is PER-USER progress (`StepCompletion`), `request.user`-scoped. Each test uses a
 * fresh `loggedInPage` user; `test.slow()` + 45s waits absorb the QA stack's
 * cold-start; URLs come from `process.env.BACKEND_URL/FRONTEND_URL`.
 */
import { test, expect } from '../../fixtures/index'
import { CurriculumMapPage } from '../../pages/CurriculumMapPage'
import {
  unlockTermDeposits,
  completeTermDepositLevels,
  T_L1_WHAT_IT_IS,
  T_L2_LIQUIDITY,
  T_L3_LADDERING,
  T_L4_RIGHT_TOOL,
} from '../../helpers/termDepositsFixtures'

test.describe('Curriculum — Term deposits topic', () => {
  test('the Term deposits topic unlocks once Interest is complete', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    const map = new CurriculumMapPage(page)

    // Prereq-locked for a fresh user (term-deposits ← interest ← saving ← …).
    await map.goto(45_000)
    await expect(map.topic('term-deposits')).toHaveAttribute('data-topic-status', 'locked')
    expect(await map.nodesInTopic('term-deposits', 'current').count()).toBe(0)

    // Complete the Saving chain + Interest → term-deposits flips available + gains a current node.
    await unlockTermDeposits(api)
    await map.goto(45_000)
    await expect(map.topic('term-deposits')).toHaveAttribute('data-topic-status', 'available')
    await expect(map.nodesInTopic('term-deposits', 'current').first()).toBeVisible()
  })

  test('the lock-up sandbox and a scenario complete and award XP', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    await unlockTermDeposits(api)
    // L1 done → L2 `the-liquidity-tradeoff` is the current node.
    await completeTermDepositLevels(api, T_L1_WHAT_IT_IS)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    const xp0 = await map.xpValue()
    expect(xp0).toBe(0)

    // L2: lesson `why-locked-pays-more` → `lockup-comparator` SANDBOX (banner shown)
    // → `car-repair-month-4` SCENARIO → the level closes and XP lands.
    await map.openCurrentNode('term-deposits')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'lesson')
    await map.playLessonDeck()
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'sandbox', { timeout: 45_000 })
    await expect(map.sandboxBanner).toBeVisible()
    await map.completeSandbox()
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'scenario', { timeout: 45_000 })
    await map.playScenarioToEnd()
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
    await expect.poll(async () => map.xpValue(), { timeout: 45_000 }).toBeGreaterThan(xp0)

    // API parity — the on-screen XP traces to real ledger rows (Bar #1 only).
    expect((await api.getCurriculumMap()).bars.knowledge.xp_total).toBeGreaterThan(0)
  })

  test('the scenario-boss capstone reveals a crest', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    await unlockTermDeposits(api)
    // Everything up to the capstone done → the L5 `park-this-money-boss` checkpoint is current.
    await completeTermDepositLevels(api, T_L1_WHAT_IT_IS, T_L2_LIQUIDITY, T_L3_LADDERING, T_L4_RIGHT_TOOL)

    const crestBefore = (await api.getCurriculumMap()).bars.knowledge.crest_count

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    // The scenario-boss is the sole current node → walk the multi-decision "park
    // this money" sim to its terminal → Done mark-completes the checkpoint level.
    await map.openCurrentNode('term-deposits')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'scenario')
    await map.playScenarioToEnd()

    // A scenario capstone crests like any checkpoint — the reveal fires and the
    // real crest count rose by exactly one.
    await expect(map.crestReveal).toBeVisible({ timeout: 45_000 })
    const crestAfter = (await api.getCurriculumMap()).bars.knowledge.crest_count
    expect(crestAfter).toBe(crestBefore + 1)
    // …and the on-screen Bar #1 chip shows the SAME real number (live refresh).
    await expect.poll(() => map.crestCountValue(), { timeout: 15_000 }).toBe(crestAfter)
  })
})
