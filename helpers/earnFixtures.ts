/**
 * Phase 29 — Earning-money topic E2E fixtures (pollution-safe seeding).
 *
 * Earning money (Section 1, `earning-money`) is REAL seeded content (the runtime
 * `seed_curriculum` authors L1–L5: lessons/quizzes + a branching scenario + a
 * labeled growth sandbox + the row-verified `log-your-income` mission, capped by
 * the row-verified `income-shows-up` capstone). Like the Saving / Interest /
 * Net-Wealth fixtures this file seeds NO global `Step` — everything is PER-USER
 * progress only (`StepCompletion`) plus the user's OWN `type='income'` bank rows,
 * all `request.user`-scoped, so the persistent QA content DB (gotcha #26) is never
 * mutated and the crest counts stay stable across parallel runs.
 *
 * Earning-money has NO prerequisite chain (Section 1 topic 1 — AVAILABLE to a
 * fresh user), so there is no `unlock*` helper. The level-completion helpers still
 * use the `completeTopicsFully` self-verify RETRY shape (interestFixtures.ts:64) —
 * the standing contract against a concurrent global fixture-step upsert leaving a
 * seeded level with a fresh incomplete step: seed, re-read the map, re-seed anything
 * that does not read `completed`/complete yet, up to 3 passes, then throw. Income
 * rows are seeded via the DEBUG `seedBankTransaction({type:'income'})` (defaults
 * EUR / `pending:false`). Retrofitting `unlockSaving`/`netWealthFixtures` is out of
 * scope (carried in `claude-phase30-…`).
 */
import type { ApiHelper, CurriculumMapPayload, MapSection, MapTopic } from './api'
import { utcToday } from './api'

export const EARNING_MONEY_TOPIC = 'earning-money'
export const EARN_CAREER_SECTION = 'earn-career'

// The 5 earning-money level slugs (order 1→5; L5 income-shows-up is the checkpoint
// capstone). L1 + L3 flip from `coming_soon` to step-bearing this phase.
export const EM_L1_INCOME_IS_A_NUMBER = 'income-is-a-number'
export const EM_L2_EARNING_INVENTORY = 'earning-inventory'
export const EM_L3_ACTIVE_PASSIVE = 'active-passive-one-off'
export const EM_L4_PLANT_ONE_NEW_STREAM = 'plant-one-new-stream'
export const EM_L5_INCOME_SHOWS_UP = 'income-shows-up'

/** All five earning-money level slugs in order (L1→L5). */
export const EM_ALL_LEVELS = [
  EM_L1_INCOME_IS_A_NUMBER,
  EM_L2_EARNING_INVENTORY,
  EM_L3_ACTIVE_PASSIVE,
  EM_L4_PLANT_ONE_NEW_STREAM,
  EM_L5_INCOME_SHOWS_UP,
]

/** The four step-bearing levels BEFORE the L5 capstone (unlock it via these). */
export const EM_PRE_CAPSTONE_LEVELS = [
  EM_L1_INCOME_IS_A_NUMBER,
  EM_L2_EARNING_INVENTORY,
  EM_L3_ACTIVE_PASSIVE,
  EM_L4_PLANT_ONE_NEW_STREAM,
]

// The L1 quiz `spot-the-income` correct option indices, in order (3 MCQs):
//   Q1 a freelance invoice → Income — Freelance (0); Q2 checking→savings is a
//   transfer (1); Q3 a shop refund → Income — Refunds (2). The DOM never exposes
//   these (the backend strips the `answer` key AND the per-question `feedback`
//   line); the spec knows them only because the content authored them (backend
//   `content/earning_money.py`).
export const EM_L1_QUIZ_ANSWERS = [0, 1, 2]

// The L1 lesson/quiz step slugs (used by the mid-level per-step seeds).
export const EM_L1_LESSON_SLUG = 'income-is-data'
export const EM_L1_QUIZ_SLUG = 'spot-the-income'
// The L2 lesson mounts before the legacy self_attest mission (teach-then-act).
export const EM_L2_LESSON_SLUG = 'what-you-already-own'
// The two L4 steps BEFORE the `sell-something-idle` alternative-path mission
// (order 3): the growth sandbox (order 1) + the `one-small-ask` commitment (order
// 2). Seed-complete both to open the L4 `current` node directly onto the two-path
// `sell-something-idle` mission.
export const EM_L4_SANDBOX_SLUG = 'income-stream-boost'
export const EM_L4_ONE_SMALL_ASK_SLUG = 'one-small-ask'

function findSection(payload: CurriculumMapPayload, slug: string): MapSection {
  const section = payload.sections.find((s) => s.slug === slug)
  if (!section) throw new Error(`section '${slug}' not present in the curriculum map`)
  return section
}

function findTopic(payload: CurriculumMapPayload, slug: string): MapTopic {
  const topic = payload.sections.flatMap((s) => s.topics).find((t) => t.slug === slug)
  if (!topic) throw new Error(`topic '${slug}' not present in the curriculum map`)
  return topic
}

/**
 * Seed `count` distinct `type='income'` bank rows for the requesting user via the
 * DEBUG `seed/bank-transaction` endpoint (defaults EUR / `pending:false`). Each row
 * carries a distinct description + amount so the income feed is unambiguous. These
 * are the real rows the L1 `log-your-income` mission (`income_rows_exist{min_count
 * 1}`) and the L5 capstone (a pure `income_rows_exist{min_count:1}` check behind the
 * guided-v2 flow, Phase 29 Amendment 1 — the old `any_of` self-attest arm is gone)
 * verify against — no-fake-numbers: every applied income figure traces to one of
 * these rows.
 */
export async function seedIncomeRows(api: ApiHelper, count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    await api.createBankTransaction({
      description: `QA income stream ${i + 1}`,
      amount: (1000 + i * 250).toFixed(2),
      type: 'income',
      transaction_date: utcToday(),
    })
  }
}

/**
 * Seed-complete the given earning-money levels (ALL their steps; writes NO XP) via
 * `seed/level-state`, then self-verify against a fresh map read and re-seed any
 * level that does not read `completed` yet — up to 3 passes (the
 * `completeTopicsFully` retry contract, interestFixtures.ts:64), then throw.
 * earning-money has no prereq chain, but the retry shape is the standing contract
 * against a concurrent global fixture-step upsert landing a fresh incomplete step
 * in a seeded level between the seed call and the read.
 */
export async function completeEarningMoneyLevels(api: ApiHelper, levelSlugs: string[]): Promise<void> {
  const pendingLevels = (topic: MapTopic): string[] =>
    levelSlugs.filter((slug) => topic.levels.find((l) => l.slug === slug)?.status !== 'completed')

  for (let attempt = 0; attempt < 3; attempt++) {
    for (const slug of levelSlugs) {
      await api.seedLevelState({ topic_slug: EARNING_MONEY_TOPIC, level_slug: slug })
    }
    const topic = findTopic(await api.getCurriculumMap(), EARNING_MONEY_TOPIC)
    if (pendingLevels(topic).length === 0) return
  }
  const stillPending = pendingLevels(findTopic(await api.getCurriculumMap(), EARNING_MONEY_TOPIC))
  if (stillPending.length > 0) {
    throw new Error(`earning-money levels never read 'completed' after 3 seeding passes: ${stillPending.join(', ')}`)
  }
}

/**
 * Seed-complete EVERY step-bearing level across ALL topics of the earn-career
 * section (Section 1) — earning-money's 5 levels PLUS the legacy-mission levels in
 * career-choice / job-applications / pay-and-tax — so the SECTION crest reads
 * complete (`levels_completed === levels_total_playable`). That full-section
 * completion is what flips the focused-chapter guide copy to the "…done. Nice."
 * short-circuit (I4); completing ONLY earning-money leaves the section crest short
 * (the other Section-1 topics still carry step-bearing legacy-mission levels).
 * Same 3-pass self-verify retry, verified against the section crest.
 */
export async function completeEarnCareerSection(api: ApiHelper): Promise<void> {
  const isComplete = (section: MapSection): boolean =>
    section.crest.levels_total_playable > 0 &&
    section.crest.levels_completed === section.crest.levels_total_playable

  for (let attempt = 0; attempt < 3; attempt++) {
    const section = findSection(await api.getCurriculumMap(), EARN_CAREER_SECTION)
    for (const topic of section.topics) {
      for (const level of topic.levels) {
        if (level.step_count > 0 && level.status !== 'completed') {
          await api.seedLevelState({ topic_slug: topic.slug, level_slug: level.slug })
        }
      }
    }
    if (isComplete(findSection(await api.getCurriculumMap(), EARN_CAREER_SECTION))) return
  }
  const crest = findSection(await api.getCurriculumMap(), EARN_CAREER_SECTION).crest
  if (crest.levels_completed !== crest.levels_total_playable) {
    throw new Error(
      `earn-career section crest never completed after 3 seeding passes: ` +
        `${crest.levels_completed}/${crest.levels_total_playable}`,
    )
  }
}
