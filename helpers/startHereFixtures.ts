/**
 * Phase 24 — Topic 0 "Start here" E2E fixtures (pollution-safe seeding).
 *
 * The "Start here" topic (Section 0, `start-here`) is REAL seeded content now
 * (the runtime seeder authors L1–L4 — 4 lessons, 1 quiz, 3 missions = 8 steps;
 * Phase 24 added the L3 `take-the-tour` self_attest mission), so — like
 * the Saving fixtures — these helpers seed NO global `Step`. Everything here is
 * PER-USER progress only (`StepCompletion` / spaces / claim rules), all
 * `request.user`-scoped, so the persistent QA content DB (gotcha #26) is never
 * mutated and the map/crest counts stay stable across parallel runs.
 *
 * Unlike Saving, Topic 0 is prereq-FREE (Section 0, no `prerequisite_slugs`), so
 * it is `available` with a `current` node for a brand-new user — no unlock step.
 * A spec seed-completes whichever earlier levels precede the one under test.
 */
import type { ApiHelper, CurriculumMapPayload, MapLevel, MapTopic } from './api'
import { allTopics } from './interestFixtures'

export const START_HERE_SECTION = 'start-here'
export const START_HERE_TOPIC = 'start-here'

// The 4 Start-here level slugs (order 1→4; L4 is the checkpoint → Section 0 crest).
export const L1_HOW_THIS_WORKS = 'how-this-works'
export const L2_MISSIONS_ARE_REAL = 'missions-are-real'
export const L3_THE_PIECES = 'the-pieces'
export const L4_YOURE_SET_UP = 'youre-set-up'

// Start-here step slugs referenced by the specs.
export const HOW_LESSON_SLUG = 'how-the-course-works' // L1 · lesson (v2 deck)
export const MAP_QUIZ_SLUG = 'map-basics' // L1 · quiz (server-graded)
export const MISSIONS_REAL_LESSON_SLUG = 'missions-are-real' // L2 · lesson
export const CREATE_SPACE_MISSION_SLUG = 'create-your-first-space' // L2 · mission · space_exists (plain)
export const PIECES_LESSON_SLUG = 'the-pieces' // L3 · lesson
export const CREATE_RULE_MISSION_SLUG = 'create-your-first-rule' // L3 · mission · claim_rule_exists (plain)
// L3 now carries a THIRD step (order 3): a self_attest "tour" mission WITH a
// seeded deep-link → /dashboard/transactions. A tour leaves no row to verify, so
// it's honestly self_attest; the deep-link still leads (do the thing, then attest).
export const TAKE_TOUR_MISSION_SLUG = 'take-the-tour' // L3 · mission · self_attest (deep_link → transactions)
export const SET_UP_LESSON_SLUG = 'youre-set-up' // L4 · lesson (checkpoint close)

// The `map-basics` quiz correct option indices, in question order:
// Q1 mcq → 1 ("What you've learned"), Q2 true_false → 0 ("True"), Q3 mcq → 1.
export const MAP_QUIZ_ANSWERS = [1, 0, 1]

// L1's `how-the-course-works` lesson title (the level caption / node aria-label).
export const L1_TITLE = 'How this course works'

/** The `start-here` topic out of a fresh map payload. */
export function startHereTopic(payload: CurriculumMapPayload): MapTopic {
  const topic = allTopics(payload).find((t) => t.slug === START_HERE_TOPIC)
  if (!topic) throw new Error("topic 'start-here' not present in the curriculum map")
  return topic
}

/** A `start-here` topic level, by slug, out of a fresh map payload. */
export function startHereLevel(payload: CurriculumMapPayload, levelSlug: string): MapLevel {
  const level = startHereTopic(payload).levels.find((l) => l.slug === levelSlug)
  if (!level) throw new Error(`start-here level '${levelSlug}' not present`)
  return level
}

/** Seed-complete the given Start-here levels (all their steps; writes NO XP). */
export async function completeStartHereLevels(api: ApiHelper, ...levelSlugs: string[]): Promise<void> {
  await api.getCurriculumMap() // lazy-seeds the tree on an empty DB
  for (const slug of levelSlugs) {
    await api.seedLevelState({ topic_slug: START_HERE_TOPIC, level_slug: slug })
  }
}

/** Resolve a Start-here step's id by (level, slug) via the leak-safe manifest. */
export async function startHereStepId(api: ApiHelper, levelSlug: string, stepSlug: string): Promise<number> {
  const manifest = await api.fetchLevel(START_HERE_TOPIC, levelSlug)
  const step = manifest.steps.find((s) => s.slug === stepSlug)
  if (!step) throw new Error(`step '${stepSlug}' not found in start-here/${levelSlug}`)
  return step.id
}

/**
 * Pre-complete a single Start-here step (StepCompletion only — NO XP), so a
 * level's OTHER steps become the only incomplete ones and the host mounts
 * exactly the step under test.
 */
export async function precompleteStartHereStep(
  api: ApiHelper,
  levelSlug: string,
  stepSlug: string,
): Promise<void> {
  await api.seedStepCompletion({ step_id: await startHereStepId(api, levelSlug, stepSlug) })
}
