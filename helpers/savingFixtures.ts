/**
 * Phase 23 — Saving-topic E2E fixtures (pollution-safe seeding).
 *
 * The Saving topic (Section 3, `saving`) is REAL seeded content now (the
 * `seed_curriculum` runtime seeder authors L1–L6 — 5 lessons, 4 quizzes, 6
 * missions), so — unlike the Phase-22 player specs — these fixtures seed NO
 * global `Step` (no `seedStep`). Everything here is PER-USER progress only
 * (`StepCompletion` / `XPLedgerEntry` / spaces / expenses / claim rules), all
 * `request.user`-scoped, so the persistent QA content DB (gotcha #26) is never
 * mutated and the map/progress crest counts stay stable across parallel runs.
 *
 * The Saving topic is prereq-locked (saving ← budgeting ← smart-spending), so a
 * spec first calls `unlockSaving` (completes both prereq topics' step-bearing
 * levels via the DEBUG `seed/level-state`, which bypasses locks) and then
 * seed-completes whichever Saving levels precede the one under test.
 */
import type { ApiHelper, CurriculumMapPayload, MapLevel } from './api'
import { findTopic } from './interestFixtures'

export const SAVING_TOPIC = 'saving'

// The 6 Saving level slugs (order 1→6; L6 is the checkpoint capstone).
export const L1_PAY_YOURSELF = 'pay-yourself-first'
export const L2_FIND_LEAK = 'find-your-leak'
export const L3_A_HOME = 'a-home-for-savings'
export const L4_MOVE_IT = 'move-it-on-purpose'
export const L5_AUTOMATIC = 'make-it-automatic'
export const L6_FIRST_MONEY = 'first-money-saved'

// Saving step slugs referenced by the specs.
export const GIVE_HOME_SLUG = 'give-your-money-a-home' // L3 · mission · space_exists (binds_space)
export const MATCH_LIFE_SLUG = 'spaces-that-match-life' // L3 · mission · self_attest
export const A_SPACE_LESSON_SLUG = 'a-space-beats-a-note' // L3 · lesson
export const LEAK_SLUG = 'spot-the-leak' // L2 · mission · expense_rows_exist
export const AVOIDABLE_LESSON_SLUG = 'avoidable-vs-fixed' // L2 · lesson
export const MOVING_LESSON_SLUG = 'moving-money-is-saving' // L4 · lesson
export const FIRST_DEPOSIT_SLUG = 'make-your-first-deposit' // L4 · mission · space_has_attribution (for_bound)
export const DECIDE_LESSON_SLUG = 'decide-once' // L5 · lesson
export const ROUTING_SLUG = 'put-routing-on-autopilot' // L5 · mission · all_of(space_exists, claim_rule for_bound)
export const SAVING_LOOP_QUIZ_SLUG = 'the-saving-loop' // L5 · quiz
export const CAPSTONE_SLUG = 'first-money-attributed' // L6 · mission · all three (for_bound)

/** Topics that gate `saving` (saving ← budgeting ← smart-spending). */
const PREREQ_TOPICS = ['smart-spending', 'budgeting']

/** The `saving` topic level, by slug, out of a fresh map payload. */
export function savingLevel(payload: CurriculumMapPayload, levelSlug: string): MapLevel {
  const level = findTopic(payload, SAVING_TOPIC).levels.find((l) => l.slug === levelSlug)
  if (!level) throw new Error(`saving level '${levelSlug}' not present`)
  return level
}

/**
 * Complete every step-bearing level of saving's prereq topics so `saving`
 * unlocks to `available`. `seed/level-state` bypasses the map's topic-lock (it is
 * a DEBUG seed), so budgeting's levels can be completed even though budgeting is
 * itself locked for a fresh user — both prereq topics then read `completed` and
 * `saving` becomes available with a `current` node.
 */
export async function unlockSaving(api: ApiHelper): Promise<void> {
  const map = await api.getCurriculumMap() // lazy-seeds the tree on an empty DB
  for (const topicSlug of PREREQ_TOPICS) {
    for (const level of findTopic(map, topicSlug).levels) {
      if (level.step_count > 0) {
        await api.seedLevelState({ topic_slug: topicSlug, level_slug: level.slug })
      }
    }
  }
}

/** Seed-complete the given Saving levels (all their steps; writes NO XP, NO binding). */
export async function completeSavingLevels(api: ApiHelper, ...levelSlugs: string[]): Promise<void> {
  for (const slug of levelSlugs) {
    await api.seedLevelState({ topic_slug: SAVING_TOPIC, level_slug: slug })
  }
}

/** Resolve a Saving step's id by (level, slug) via the leak-safe manifest. */
export async function savingStepId(api: ApiHelper, levelSlug: string, stepSlug: string): Promise<number> {
  const manifest = await api.fetchLevel(SAVING_TOPIC, levelSlug)
  const step = manifest.steps.find((s) => s.slug === stepSlug)
  if (!step) throw new Error(`step '${stepSlug}' not found in saving/${levelSlug}`)
  return step.id
}

/**
 * Pre-complete a single Saving step (StepCompletion only — NO XP), so a level's
 * OTHER steps become the only incomplete ones and the host mounts exactly the
 * step under test.
 */
export async function precompleteSavingStep(
  api: ApiHelper,
  levelSlug: string,
  stepSlug: string,
): Promise<void> {
  await api.seedStepCompletion({ step_id: await savingStepId(api, levelSlug, stepSlug) })
}

/**
 * Capture the topic Space-binding to `spaceId` by verifying the create-Space
 * mission (`give-your-money-a-home`) with `{space_id}` — the exact path the UI
 * Space picker drives. Requires L3 to be playable (seed L1/L2 first). Persists
 * `StepCompletion.bound_space=spaceId` so the downstream `for_bound` missions
 * (first-deposit / rule / capstone) resolve against that ONE Space.
 */
export async function captureSavingBinding(api: ApiHelper, spaceId: number): Promise<void> {
  const stepId = await savingStepId(api, L3_A_HOME, GIVE_HOME_SLUG)
  const res = await api.verifyStep(stepId, spaceId)
  if (!res.passed) {
    throw new Error(`binding capture did not pass: ${JSON.stringify(res.snapshot)}`)
  }
}
