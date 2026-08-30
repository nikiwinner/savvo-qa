/**
 * Phase 22 — shared curriculum step-player fixtures (pollution-safe seeding).
 *
 * The QA content DB (Section/Topic/Level/Step rows) PERSISTS across the whole
 * `pnpm test` run (gotcha #26) — only per-user progress (StepCompletion / XP) is
 * isolated. So a seeded fixture `Step` is GLOBAL content every user sees. To keep
 * the map/progress specs green (HARD RULE #0), every fixture here lands in ONE
 * already-step-bearing, unlocked level: `smart-spending / name-what-you-buy`.
 *
 * Why that level is safe:
 *   - It is ALREADY step-bearing (carries seeded missions), so adding steps does
 *     not add a NODE to the map.
 *   - No spec asserts it COMPLETED. `progress.spec`'s streak test does
 *     `seedLevelState(name-what-you-buy)` (completes ALL its steps, incl. these
 *     fixtures) and only reads date-based streak — immune to an extra step.
 *   - Its ONLY prerequisite level is `catch-every-spend`, which carries NO
 *     fixture, so unlocking it is race-free.
 *
 * What Phase 32 changed about that choice, and it is load-bearing: eight of the
 * nine fixtures are NON-mission, so in the QA database `smart-spending` is a
 * ROAD topic, while in the authored content it is mission-only. Two consequences
 * a spec author must know:
 *   - `smart-spending` GATES here (its required fixture steps must be done
 *     before `budgeting → saving` opens) where in production it passes learners
 *     through. That is why the fresh-user "locked" assertions on `saving` /
 *     `interest` still hold in the suite. Do not move these fixtures onto
 *     another topic without re-reading every such assertion.
 *   - its topic fraction counts ROAD levels only, so it reads out of 1 (this
 *     level), not out of 4. A mission-only level such as `catch-every-spend` is
 *     a side quest and is not part of the fraction.
 *
 * Determinism across the parallel player specs: EVERY spec seeds ALL FOUR
 * fixtures (idempotent on `(level, slug)`) before making the level playable, then
 * completes every OTHER step for its own fresh user — so the single fixture it
 * targets is the ONLY incomplete step and the host mounts it deterministically,
 * regardless of what a concurrent spec is doing. (Phase 24 added the interactive
 * lesson as the 4th fixture INSIDE `seedPlayerFixtures` — not a separate seed —
 * precisely so every UI-completion spec also completes it via
 * `makeFixtureLevelPlayable`, keeping the level's "complete on the last step"
 * close race-free.)
 */
import type { ApiHelper, ManifestStep, SeedStepResult } from './api'

export const FIXTURE_TOPIC = 'smart-spending'
export const FIXTURE_LEVEL = 'name-what-you-buy'
/** The step-bearing level immediately before FIXTURE_LEVEL (no fixture on it). */
export const FIXTURE_PREREQ_LEVEL = 'catch-every-spend'

/** Fixed fixture slugs (idempotent seeding keys). */
export const LESSON_SLUG = 'qa-fixture-lesson'
export const QUIZ_SLUG = 'qa-fixture-quiz'
export const MISSION_SLUG = 'qa-fixture-mission'
/** Phase 24 — a lesson deck carrying a v2 interactive (tap) `choice` card. */
export const INTERACTIVE_LESSON_SLUG = 'qa-fixture-lesson-v2'
/** Phase 26 — a 🧮 Sandbox (labeled-hypothetical calculator) + a 🎭 Scenario. */
export const SANDBOX_SLUG = 'qa-fixture-sandbox'
export const SCENARIO_SLUG = 'qa-fixture-scenario'
/**
 * Phase 31 — the practice loop needs TWO questions to prove that only the MISSED
 * one is replayed, and a separate `assessment` quiz to prove the boss keeps batch
 * grading. New slugs, deliberately: `seed/step/` is create-only, so re-shaping an
 * existing fixture in place would silently keep the old content on any DB that
 * already has it.
 */
export const PRACTICE_QUIZ_SLUG = 'qa-fixture-practice-quiz'
export const BOSS_QUIZ_SLUG = 'qa-fixture-boss-quiz'
/** An `order` question — arranged, then committed with its own Check. */
export const ORDER_QUIZ_SLUG = 'qa-fixture-order-quiz'

/** XP awarded on completion of each fixture (drives the "xp-total increments" checks). */
export const LESSON_XP = 15
export const QUIZ_XP = 15
export const MISSION_XP = 20
export const INTERACTIVE_LESSON_XP = 15
export const SANDBOX_XP = 12
export const SCENARIO_XP = 14

// ── Phase 26 — the seeded Sandbox fixture (a labeled-hypothetical calculator) ──
// A `compound_interest` calculator: the mandatory banner labels EVERY figure a
// hypothetical, and the calculator renders only rounded whole amounts (`fmt`) +
// one-decimal rates — so NO number here reads as a `\d+[.,]\d{2}` real money
// figure and the copy carries no currency symbol (the sandbox-player no-money
// tripwire depends on this being real-money-free).
export const SANDBOX_BANNER = 'Hypothetical — not your real balance.'
export const SANDBOX_CONTENT = {
  banner: SANDBOX_BANNER,
  calculator: 'compound_interest',
  intro: 'Slide the inputs to see how a made-up starting amount could grow. None of these numbers is your money.',
  defaults: { start: 1000, monthly: 100, rate: 6, years: 20 },
  caption: 'Every figure here is a labeled example, never a real balance.',
} as const

// ── Phase 26 — the seeded Scenario fixture (a branching decision sim) ─────────
// Two nodes; both entry options fan into `why`, whose options terminate. Every
// option carries formative `feedback` and NO right/wrong verdict — the copy
// deliberately avoids the words "correct"/"incorrect"/"score" so the
// scenario-player leak assertion (no answer key, no score UI) stays honest.
export const SCENARIO_CONTENT = {
  intro: 'A two-step choice to show the branching.',
  nodes: [
    {
      id: 'start',
      prompt: 'Payday lands. What do you do first?',
      options: [
        {
          label: 'Move some to savings first',
          feedback: 'Paying yourself first means the saving actually happens.',
          next: 'why',
        },
        {
          label: 'Spend first, save whatever is left',
          feedback: 'Leftover saving tends to be thin — the month eats it.',
          next: 'why',
        },
      ],
    },
    {
      id: 'why',
      prompt: 'What made the difference here?',
      options: [
        {
          label: 'The order you handled the money',
          feedback: 'Exactly — the order decides what actually reaches savings.',
          next: null,
        },
        {
          label: 'Pure chance',
          feedback: 'Not chance — the order is the part you control.',
          next: null,
        },
      ],
    },
  ],
} as const

// ── Phase 24 — the seeded interactive `choice` card the specs interact with ──
// The card sits at index 1 of the deck (a text card before + after it), so a
// text card advancing without a tap (index 0) AND an interactive card gating
// the advance (index 1) are both exercised. `correct`/`feedback` ship verbatim
// in the leak-safe manifest (acceptable — inline checks award zero XP).
export const INTERACTIVE_CORRECT_OPTION = 1
export const INTERACTIVE_WRONG_OPTION = 0
export const INTERACTIVE_OPTIONS = [
  'A spontaneous coffee',
  'Your monthly rent',
  'A one-off birthday gift',
  'A holiday you booked once',
]
export const INTERACTIVE_FEEDBACK =
  'Rent is a fixed need you pay every month — the others are flexible or one-off.'

/**
 * The correct option index of the seeded quiz fixture's single MCQ. The DOM
 * NEVER exposes this (the backend strips the `answer` key); the spec knows it
 * only because it authored the fixture.
 */
export const QUIZ_ANSWER_INDEX: number = 2

/** The seeded quiz options (index 2 — "Your monthly rent" — is the answer). */
export const QUIZ_OPTIONS = [
  'A one-off birthday gift',
  'A spontaneous coffee',
  'Your monthly rent',
  'A holiday you booked once',
]

/**
 * The seeded question's `feedback` line — the explanation the reader is shown
 * when they MISS it. Stripped from the manifest like the answer key, so a spec
 * finding this string in the DOM before a graded fail is a leak.
 */
export const QUIZ_FEEDBACK = 'A fixed bill lands on the same date every month, whether you think about it or not.'

/**
 * The two-question practice fixture. Q0's answer is index 1, Q1's is index 0 —
 * DIFFERENT indices on purpose, so a spec that always taps the same slot cannot
 * accidentally pass both.
 */
export const PRACTICE_Q0_ANSWER: number = 1
export const PRACTICE_Q1_ANSWER: number = 0
export const PRACTICE_Q0_PROMPT = 'Which of these is a fixed monthly bill?'
export const PRACTICE_Q1_PROMPT = 'Money you can name is money you can…'
export const PRACTICE_Q0_FEEDBACK =
  'A fixed bill lands on the same date every month, whether you think about it or not.'
export const PRACTICE_QUIZ_XP = 15

/** The assessment fixture's single question — graded all-or-nothing. */
export const BOSS_ANSWER_INDEX: number = 1
export const BOSS_QUIZ_XP = 15

/**
 * The `order` fixture. Presented as [Rent, Coffee, Gift]; the authored answer is
 * [1, 2, 0] — deliberately NOT the identity permutation, so pressing Check
 * without touching anything is a MISS and the reveal is observable.
 */
export const ORDER_OPTIONS = ['Your monthly rent', 'A spontaneous coffee', 'A one-off birthday gift']
export const ORDER_ANSWER: number[] = [1, 2, 0]
export const ORDER_FEEDBACK = 'Sort by how often it repeats: daily, then one-off, then monthly.'
export const ORDER_QUIZ_XP = 15

export interface SeededFixtures {
  lesson: SeedStepResult
  quiz: SeedStepResult
  mission: SeedStepResult
  /** Phase 24 — a v2 lesson deck with an interactive `choice` card (text → choice → text). */
  interactive: SeedStepResult
  /** Phase 26 — a 🧮 Sandbox calculator (mandatory hypothetical banner). */
  sandbox: SeedStepResult
  /** Phase 26 — a 🎭 branching Scenario (formative per-node feedback). */
  scenario: SeedStepResult
  /** Phase 31 — a two-question PRACTICE quiz (immediate check + review round). */
  practiceQuiz: SeedStepResult
  /** Phase 31 — an `assessment` quiz: batch submit, and `check/` refuses it. */
  bossQuiz: SeedStepResult
  /** Phase 31 — an `order` question: arrange, Check, and a sequence reveal on a miss. */
  orderQuiz: SeedStepResult
}

/**
 * Seed the lesson / quiz / mission fixtures into FIXTURE_LEVEL (idempotent).
 * Also lazily seeds the curriculum tree via `getCurriculumMap()` first.
 */
export async function seedPlayerFixtures(api: ApiHelper): Promise<SeededFixtures> {
  await api.getCurriculumMap() // lazy-seed the content tree on an empty DB

  const lesson = await api.seedStep({
    topic_slug: FIXTURE_TOPIC,
    level_slug: FIXTURE_LEVEL,
    slug: LESSON_SLUG,
    kind: 'lesson',
    title: 'QA fixture lesson',
    order: 51,
    xp: LESSON_XP,
    content: {
      cards: [
        { title: 'Name every purchase', body: 'A category is just a name for where your money went.' },
        { title: 'Why naming matters', body: 'Money you can name is money you can steer.' },
      ],
    },
  })

  const quiz = await api.seedStep({
    topic_slug: FIXTURE_TOPIC,
    level_slug: FIXTURE_LEVEL,
    slug: QUIZ_SLUG,
    kind: 'quiz',
    title: 'QA fixture quiz',
    order: 52,
    xp: QUIZ_XP,
    content: {
      questions: [
        {
          prompt: 'Which of these is a fixed monthly bill?',
          type: 'mcq',
          options: QUIZ_OPTIONS,
          answer: QUIZ_ANSWER_INDEX,
          feedback: QUIZ_FEEDBACK,
        },
      ],
    },
  })

  const mission = await api.seedStep({
    topic_slug: FIXTURE_TOPIC,
    level_slug: FIXTURE_LEVEL,
    slug: MISSION_SLUG,
    kind: 'mission',
    title: 'QA fixture mission',
    order: 53,
    xp: MISSION_XP,
    content: {
      legacy_day_number: 0,
      steps: ['Open Spaces and create a Space that matches your everyday life.'],
      estimated_minutes: 5,
      difficulty: 'EASY',
      // A REAL route for the CTA. The player no longer falls back to a generic
      // "Open Savvo" → `/dashboard` (which 307s to the Learn page the reader is
      // already on), so a mission that wants a CTA has to name where it goes.
      deep_link: { route: '/dashboard/spaces', label: 'Open Spaces' },
    },
    verifier: { predicate: 'space_exists' },
  })

  // Phase 24 — a v2 lesson deck: text → interactive `choice` → text. Seeded as
  // the 4th fixture so every UI-completion spec's `makeFixtureLevelPlayable`
  // completes it too (race-free level close). Its `correct`/`feedback` ship in
  // the leak-safe manifest verbatim — acceptable because inline checks award
  // ZERO XP (nothing to cheat).
  const interactive = await api.seedStep({
    topic_slug: FIXTURE_TOPIC,
    level_slug: FIXTURE_LEVEL,
    slug: INTERACTIVE_LESSON_SLUG,
    kind: 'lesson',
    title: 'QA fixture interactive lesson',
    order: 54,
    xp: INTERACTIVE_LESSON_XP,
    content: {
      cards: [
        { title: 'Warm up', body: 'Money you can name is money you can steer.' },
        {
          kind: 'choice',
          prompt: 'Which of these is a fixed monthly need?',
          options: INTERACTIVE_OPTIONS,
          correct: INTERACTIVE_CORRECT_OPTION,
          feedback: INTERACTIVE_FEEDBACK,
        },
        { title: 'Nice work', body: 'You spotted the fixed cost. Onward.' },
      ],
    },
  })

  // Phase 26 — a 🧮 Sandbox + a 🎭 Scenario, seeded as the 5th/6th fixtures so
  // EVERY UI-completion spec also completes them via `makeFixtureLevelPlayable`
  // (same race-free reasoning as the Phase-24 interactive lesson): the level only
  // "completes on the last step" once every seeded fixture is done, so all specs
  // must seed the IDENTICAL set before making the level playable.
  const sandbox = await api.seedStep({
    topic_slug: FIXTURE_TOPIC,
    level_slug: FIXTURE_LEVEL,
    slug: SANDBOX_SLUG,
    kind: 'sandbox',
    title: 'QA fixture sandbox',
    order: 55,
    xp: SANDBOX_XP,
    content: { ...SANDBOX_CONTENT, defaults: { ...SANDBOX_CONTENT.defaults } },
  })

  const scenario = await api.seedStep({
    topic_slug: FIXTURE_TOPIC,
    level_slug: FIXTURE_LEVEL,
    slug: SCENARIO_SLUG,
    kind: 'scenario',
    title: 'QA fixture scenario',
    order: 56,
    xp: SCENARIO_XP,
    content: { intro: SCENARIO_CONTENT.intro, nodes: SCENARIO_CONTENT.nodes.map((n) => ({ ...n })) },
  })

  // Phase 31 — the practice loop. TWO questions with DIFFERENT answer indices, so
  // "only the missed one comes back" is actually observable.
  const practiceQuiz = await api.seedStep({
    topic_slug: FIXTURE_TOPIC,
    level_slug: FIXTURE_LEVEL,
    slug: PRACTICE_QUIZ_SLUG,
    kind: 'quiz',
    title: 'QA fixture practice quiz',
    order: 57,
    xp: PRACTICE_QUIZ_XP,
    content: {
      questions: [
        {
          prompt: PRACTICE_Q0_PROMPT,
          type: 'mcq',
          options: ['A spontaneous coffee', 'Your monthly rent', 'A one-off birthday gift'],
          answer: PRACTICE_Q0_ANSWER,
          feedback: PRACTICE_Q0_FEEDBACK,
        },
        {
          prompt: PRACTICE_Q1_PROMPT,
          type: 'mcq',
          options: ['Steer', 'Forget', 'Hide'],
          answer: PRACTICE_Q1_ANSWER,
        },
      ],
    },
  })

  // Phase 31 — the ONE mechanic that did NOT change: an assessment quiz is graded
  // as a single attempt and `check/` refuses it.
  const bossQuiz = await api.seedStep({
    topic_slug: FIXTURE_TOPIC,
    level_slug: FIXTURE_LEVEL,
    slug: BOSS_QUIZ_SLUG,
    kind: 'quiz',
    title: 'QA fixture boss quiz',
    order: 58,
    xp: BOSS_QUIZ_XP,
    content: {
      mode: 'assessment',
      questions: [
        {
          prompt: 'Which of these is a fixed monthly bill?',
          type: 'mcq',
          options: ['A spontaneous coffee', 'Your monthly rent', 'A one-off birthday gift'],
          answer: BOSS_ANSWER_INDEX,
          feedback: PRACTICE_Q0_FEEDBACK,
        },
      ],
    },
  })

  // Phase 31 — the `order` type has its own commit path (arrange, then Check) and
  // its own reveal (a sequence, because there is no single option to mark).
  const orderQuiz = await api.seedStep({
    topic_slug: FIXTURE_TOPIC,
    level_slug: FIXTURE_LEVEL,
    slug: ORDER_QUIZ_SLUG,
    kind: 'quiz',
    title: 'QA fixture order quiz',
    order: 59,
    xp: ORDER_QUIZ_XP,
    content: {
      questions: [
        {
          prompt: 'Put these in order of how often they repeat.',
          type: 'order',
          options: ORDER_OPTIONS,
          answer: ORDER_ANSWER,
          feedback: ORDER_FEEDBACK,
        },
      ],
    },
  })

  return { lesson, quiz, mission, interactive, sandbox, scenario, practiceQuiz, bossQuiz, orderQuiz }
}

/**
 * Make FIXTURE_LEVEL the caller's `current` node with `targetStepId` the ONLY
 * incomplete step — so the step-player host mounts exactly that fixture's player.
 *
 * Completes the prerequisite level (to unlock FIXTURE_LEVEL), then completes
 * every step in FIXTURE_LEVEL EXCEPT the target. `seedStepCompletion` writes only
 * `StepCompletion` (never XP), so the target's real completion is the only XP the
 * map will show afterwards.
 */
export async function makeFixtureLevelPlayable(api: ApiHelper, targetStepId: number): Promise<void> {
  await api.seedLevelState({ topic_slug: FIXTURE_TOPIC, level_slug: FIXTURE_PREREQ_LEVEL })
  const manifest = await api.fetchLevel(FIXTURE_TOPIC, FIXTURE_LEVEL)
  for (const step of manifest.steps as ManifestStep[]) {
    if (step.id !== targetStepId) {
      await api.seedStepCompletion({ step_id: step.id })
    }
  }
}

/** Unlock FIXTURE_LEVEL (make it `current`) without completing any of its steps. */
export async function unlockFixtureLevel(api: ApiHelper): Promise<void> {
  await api.seedLevelState({ topic_slug: FIXTURE_TOPIC, level_slug: FIXTURE_PREREQ_LEVEL })
}
