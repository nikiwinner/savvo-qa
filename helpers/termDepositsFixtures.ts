/**
 * Phase 26 — Term-deposits-topic E2E fixtures (pollution-safe seeding).
 *
 * The Term deposits topic (Section 3, `term-deposits`) is REAL seeded content (the
 * runtime `seed_curriculum` authors L1–L5: lessons/quizzes + two labeled sandboxes
 * + two branching scenarios, capped by the `park-this-money-boss` SCENARIO
 * checkpoint — a scenario capstone crests exactly like a quiz/mission capstone).
 * Like the Interest fixtures this seeds NO global `Step` — everything is PER-USER
 * progress (`StepCompletion`), `request.user`-scoped, so the persistent QA content
 * DB (gotcha #26) is never mutated.
 *
 * Term deposits is prereq-locked behind Interest (term-deposits ← interest ←
 * saving ← …). A topic reads `completed` only when its OWN prereqs are completed
 * too, so making `term-deposits` AVAILABLE requires COMPLETING the Saving chain
 * AND Interest — `unlockTermDeposits` does exactly that via `seed/level-state`.
 */
import type { ApiHelper } from './api'
import { INTEREST_TOPIC, SAVING_CHAIN, completeTopicsFully } from './interestFixtures'

export const TERM_DEPOSITS_TOPIC = 'term-deposits'

// The 5 Term-deposits level slugs (order 1→5; L5 is the checkpoint capstone).
export const T_L1_WHAT_IT_IS = 'what-a-term-deposit-is'
export const T_L2_LIQUIDITY = 'the-liquidity-tradeoff'
export const T_L3_LADDERING = 'laddering'
export const T_L4_RIGHT_TOOL = 'right-tool-right-money'
export const T_L5_BOSS = 'park-this-money-boss'

/** Complete the Saving chain + Interest so `term-deposits` unlocks to `available`. */
export async function unlockTermDeposits(api: ApiHelper): Promise<void> {
  await completeTopicsFully(api, [...SAVING_CHAIN, INTEREST_TOPIC])
}

/** Seed-complete the given Term-deposits levels (all their steps; writes NO XP). */
export async function completeTermDepositLevels(api: ApiHelper, ...levelSlugs: string[]): Promise<void> {
  for (const slug of levelSlugs) {
    await api.seedLevelState({ topic_slug: TERM_DEPOSITS_TOPIC, level_slug: slug })
  }
}
