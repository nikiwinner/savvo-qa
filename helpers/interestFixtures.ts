/**
 * Phase 26 — Interest-topic E2E fixtures (pollution-safe seeding).
 *
 * The Interest topic (Section 3, `interest`) is REAL seeded content (the runtime
 * `seed_curriculum` authors L1–L6: lessons/quizzes + two labeled sandboxes + two
 * branching scenarios, capped by the `interest-boss` quiz checkpoint). Like the
 * Saving / Net-Wealth fixtures this file seeds NO global `Step` — everything is
 * PER-USER progress only (`StepCompletion`), all `request.user`-scoped, so the
 * persistent QA content DB (gotcha #26) is never mutated and the crest counts stay
 * stable across parallel runs.
 *
 * Interest is prereq-locked behind Saving (interest ← saving ← budgeting ←
 * smart-spending), and a topic only reads `completed` when its OWN prereqs are
 * completed too (map_service `topic_status` recurses the prereq DAG). So to make
 * `interest` AVAILABLE the whole Saving chain must be COMPLETED — `unlockInterest`
 * completes every step-bearing level of smart-spending + budgeting + saving via
 * the DEBUG `seed/level-state` (which bypasses the map's topic-lock).
 */
import type { ApiHelper, CurriculumMapPayload, MapTopic } from './api'

export const INTEREST_TOPIC = 'interest'

// The 6 Interest level slugs (order 1→6; L6 is the checkpoint capstone).
export const I_L1_MONEY_EARNS = 'money-that-earns-money'
export const I_L2_READING_RATE = 'reading-a-rate'
export const I_L3_COMPOUNDING = 'the-compounding-curve'
export const I_L4_BOTH_WAYS = 'interest-cuts-both-ways'
export const I_L5_TIME = 'time-is-the-multiplier'
export const I_L6_BOSS = 'interest-boss'

// The correct answer indices, in order, for the quizzes the specs submit.
//   L2 `per-month-vs-per-year`: [False, mcq#1, True]
export const I_L2_QUIZ_ANSWERS = [1, 1, 0]
//   L6 `interest-mastery-boss` (6-question mixed mastery set) — all correct.
export const I_BOSS_ANSWERS = [1, 1, 0, 1, 1, 0]

/** Interest's full prereq chain, in dependency order (all must be COMPLETED). */
export const SAVING_CHAIN = ['smart-spending', 'budgeting', 'saving']

export function allTopics(payload: CurriculumMapPayload): MapTopic[] {
  return payload.sections.flatMap((s) => s.topics)
}

export function findTopic(payload: CurriculumMapPayload, slug: string): MapTopic {
  const topic = allTopics(payload).find((t) => t.slug === slug)
  if (!topic) throw new Error(`topic '${slug}' not present in the curriculum map`)
  return topic
}

/**
 * Complete EVERY step-bearing level of each given topic (in list order) via
 * `seed/level-state`, which bypasses the map's topic-lock. Completing a topic's
 * prereq chain plus its own levels is what flips a downstream topic to
 * `available`/`completed`.
 *
 * Self-verifying: player specs upsert global `qa-fixture-*` Steps into
 * `smart-spending` (this chain's ROOT topic) mid-run, so a level completed here
 * can gain a NEW, incomplete step between our seed call and the map re-read —
 * leaving the whole chain (and everything prereq-locked behind it) stuck. After
 * seeding, re-read the map and re-seed any topic that does not read `completed`
 * yet; a concurrent fixture-step upsert then costs one extra pass instead of a
 * flaked spec.
 */
export async function completeTopicsFully(api: ApiHelper, topicSlugs: string[]): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const map = await api.getCurriculumMap() // lazy-seeds the tree on an empty DB
    const pending = topicSlugs.filter((slug) => findTopic(map, slug).status !== 'completed')
    if (pending.length === 0) return
    for (const topicSlug of pending) {
      for (const level of findTopic(map, topicSlug).levels) {
        if (level.step_count > 0) {
          await api.seedLevelState({ topic_slug: topicSlug, level_slug: level.slug })
        }
      }
    }
  }
  const map = await api.getCurriculumMap()
  const stillPending = topicSlugs.filter((slug) => findTopic(map, slug).status !== 'completed')
  if (stillPending.length > 0) {
    throw new Error(`chain topics never read 'completed' after 3 seeding passes: ${stillPending.join(', ')}`)
  }
}

/** Complete the whole Saving chain so `interest` unlocks to `available`. */
export async function unlockInterest(api: ApiHelper): Promise<void> {
  await completeTopicsFully(api, SAVING_CHAIN)
}

/** Seed-complete the given Interest levels (all their steps; writes NO XP). */
export async function completeInterestLevels(api: ApiHelper, ...levelSlugs: string[]): Promise<void> {
  for (const slug of levelSlugs) {
    await api.seedLevelState({ topic_slug: INTEREST_TOPIC, level_slug: slug })
  }
}
