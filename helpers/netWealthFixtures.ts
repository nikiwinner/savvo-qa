/**
 * Phase 25 — Net-wealth-topic E2E fixtures (pollution-safe seeding).
 *
 * The Net wealth topic (Section 3, `net-wealth`) is REAL seeded content (the
 * runtime `seed_curriculum` authors L1–L6: 4 lessons, 3 quizzes, 4 missions),
 * so — like the Saving fixtures — this file seeds NO global `Step`. Everything
 * is PER-USER progress only (`StepCompletion` / cash-balance / spaces), all
 * `request.user`-scoped, so the persistent QA content DB (gotcha #26) is never
 * mutated and the crest counts stay stable across parallel runs.
 *
 * Net wealth is prereq-locked (net-wealth ← saving ← budgeting ← smart-spending),
 * so a spec first calls `unlockNetWealth` (completes all three prereq topics'
 * step-bearing levels via the DEBUG `seed/level-state`, which bypasses locks) and
 * then seed-completes whichever Net Wealth levels precede the one under test.
 *
 * Every Net Wealth mission is plain `account_balances_known` (non-binding): it
 * PASSes iff the user has ≥1 active account AND every one carries a non-null
 * `balance_amount`. A fresh user's sole auto-provisioned cash account has a NULL
 * balance → the honest FAIL until a balance is entered (via `setCashBalance`).
 */
import type { ApiHelper, CurriculumMapPayload, MapLevel } from './api'
import { findTopic } from './interestFixtures'

export const NET_WEALTH_TOPIC = 'net-wealth'

// The 6 Net wealth level slugs (order 1→6; L6 is the checkpoint capstone).
export const L1_WHAT_NET_WEALTH = 'what-net-wealth-is'
export const L2_FIND_EVERY_ACCOUNT = 'find-every-account'
export const L3_ASSET_VS_LIABILITY = 'asset-vs-liability'
export const L4_BUILD_YOUR_NUMBER = 'build-your-number'
export const L5_WATCH_IT_GROW = 'watch-it-grow'
export const L6_COMPLETE = 'real-net-wealth-complete'

// Net wealth step slugs referenced by the specs.
export const OWN_MINUS_OWE_LESSON = 'own-minus-owe' // L1 · lesson
export const NET_OF_ASSETS_QUIZ = 'net-of-assets-debts' // L1 · quiz (MCQ answers [2,0,1])
export const FORGOTTEN_ACCOUNT_LESSON = 'the-forgotten-account' // L2 · lesson
export const LOG_ACCOUNTS_MISSION = 'log-your-accounts' // L2 · mission · account_balances_known
export const COMPLETENESS_QUIZ = 'completeness-check' // L2 · quiz
export const YOUR_REAL_TOTAL_LESSON = 'your-real-total' // L4 · lesson
export const SEE_NET_WEALTH_MISSION = 'see-your-net-wealth' // L4 · mission · account_balances_known
export const CLOSE_A_GAP_MISSION = 'close-a-gap' // L4 · mission · account_balances_known
export const NET_WEALTH_COMPLETE_MISSION = 'net-wealth-complete' // L6 · capstone · account_balances_known

// The correct L1 quiz answer indices, in order (net-of-assets-debts):
//   Q1 "$12k own − $4k owe = ?" → "$8,000" (index 2)
//   Q2 "own MINUS owe" → True (index 0)
//   Q3 "who has higher net wealth?" → "owes nothing" (index 1)
export const L1_QUIZ_ANSWERS = [2, 0, 1]

/** Topics that gate `net-wealth` (net-wealth ← saving ← budgeting ← smart-spending). */
const PREREQ_TOPICS = ['smart-spending', 'budgeting', 'saving']

/** The `net-wealth` topic level, by slug, out of a fresh map payload. */
export function netWealthLevel(payload: CurriculumMapPayload, levelSlug: string): MapLevel {
  const level = findTopic(payload, NET_WEALTH_TOPIC).levels.find((l) => l.slug === levelSlug)
  if (!level) throw new Error(`net-wealth level '${levelSlug}' not present`)
  return level
}

/**
 * Complete every step-bearing level of net-wealth's prereq chain so `net-wealth`
 * unlocks to `available`. `seed/level-state` bypasses the map's topic-lock (it is
 * a DEBUG seed), so the three prereq topics can be completed even though they are
 * themselves locked for a fresh user — all three then read `completed` and
 * `net-wealth` becomes available with a `current` node.
 */
export async function unlockNetWealth(api: ApiHelper): Promise<void> {
  const map = await api.getCurriculumMap() // lazy-seeds the tree on an empty DB
  for (const topicSlug of PREREQ_TOPICS) {
    for (const level of findTopic(map, topicSlug).levels) {
      if (level.step_count > 0) {
        await api.seedLevelState({ topic_slug: topicSlug, level_slug: level.slug })
      }
    }
  }
}

/** Seed-complete the given Net wealth levels (all their steps; writes NO XP). */
export async function completeNetWealthLevels(api: ApiHelper, ...levelSlugs: string[]): Promise<void> {
  for (const slug of levelSlugs) {
    await api.seedLevelState({ topic_slug: NET_WEALTH_TOPIC, level_slug: slug })
  }
}

/** Resolve a Net wealth step's id by (level, slug) via the leak-safe manifest. */
export async function netWealthStepId(api: ApiHelper, levelSlug: string, stepSlug: string): Promise<number> {
  const manifest = await api.fetchLevel(NET_WEALTH_TOPIC, levelSlug)
  const step = manifest.steps.find((s) => s.slug === stepSlug)
  if (!step) throw new Error(`step '${stepSlug}' not found in net-wealth/${levelSlug}`)
  return step.id
}

/**
 * Pre-complete a single Net wealth step (StepCompletion only — NO XP), so a
 * level's OTHER steps become the only incomplete ones and the host mounts exactly
 * the step under test.
 */
export async function precompleteNetWealthStep(
  api: ApiHelper,
  levelSlug: string,
  stepSlug: string,
): Promise<void> {
  await api.seedStepCompletion({ step_id: await netWealthStepId(api, levelSlug, stepSlug) })
}

/**
 * Enter a real balance on the user's sole auto-provisioned cash account (the
 * exact PATCH the Banking-settings cash-balance control drives). After this the
 * user has ≥1 account with a non-null balance → `account_balances_known` PASSes
 * and Net Wealth reads the entered figure.
 */
export async function setCashBalance(
  api: ApiHelper,
  amount: string,
  currency = 'EUR',
): Promise<number> {
  const cash = await api.cashAccount()
  await api.updateCashBalance(cash.id, amount, currency)
  return cash.id
}
