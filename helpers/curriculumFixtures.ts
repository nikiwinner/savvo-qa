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
 *     NOT change `smart-spending`'s `levels_total_playable` — the topic-crest
 *     assertion in `progress.spec` ("1 / 4") is unaffected.
 *   - No spec asserts it COMPLETED. `progress.spec`'s streak test does
 *     `seedLevelState(name-what-you-buy)` (completes ALL its steps, incl. these
 *     fixtures) and only reads date-based streak — immune to an extra step.
 *   - Its ONLY prerequisite level is `catch-every-spend`, which carries NO
 *     fixture, so unlocking it is race-free.
 *
 * Determinism across the parallel player specs: EVERY spec seeds ALL THREE
 * fixtures (idempotent on `(level, slug)`) before making the level playable, then
 * completes every OTHER step for its own fresh user — so the single fixture it
 * targets is the ONLY incomplete step and the host mounts it deterministically,
 * regardless of what a concurrent spec is doing.
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

/** XP awarded on completion of each fixture (drives the "xp-total increments" checks). */
export const LESSON_XP = 15
export const QUIZ_XP = 15
export const MISSION_XP = 20

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

export interface SeededFixtures {
  lesson: SeedStepResult
  quiz: SeedStepResult
  mission: SeedStepResult
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
    },
    verifier: { predicate: 'space_exists' },
  })

  return { lesson, quiz, mission }
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
