/**
 * Curriculum — the unlock rewrite: missions never gate (Phase 32)
 *
 * Real-world MISSION steps are the learner's own choice. Levels and quizzes are
 * the road; finishing them is what opens the next topic and earns the crest.
 * The user's ruling (2026-08-27, verbatim): *"real-world action не должна
 * блокировать дальнейшее обучение, потому что мы не всегда можем объективно
 * проверить выполнение действия"*.
 *
 * Three things nothing else covers:
 *   • the ROAD alone opens `interest` — with `saving`'s mission capstone still
 *     open and the crest already earned;
 *   • a MISSION-ONLY topic passes learners through with zero missions done and
 *     never crests — missions earn no badge at all (user 2026-08-30, verbatim:
 *     "missions do nothing даже на крест"), so a topic with no lesson in it has
 *     no knowledge to complete;
 *   • a ZERO-STEP stub still walls the road — content missing is not a mission
 *     blocking.
 *
 * Pollution-safety: every fixture here is PER-USER progress written through the
 * DEBUG seeds; no global `Step` is created, so the persistent QA content DB
 * (which lives for the whole run) is untouched. Note the QA DB is NOT the authored content: the
 * player fixtures in `helpers/curriculumFixtures.ts` put nine steps into
 * `smart-spending / name-what-you-buy`, which makes that topic a ROAD topic
 * here while it is mission-only in production — so this file opens `saving`
 * through `completeRequiredSteps`, which works either way, and uses `budgeting`
 * (fixture-free) as its mission-only subject.
 *
 * URLs come from `process.env.BACKEND_URL/FRONTEND_URL` — never a hard-coded
 * :8000/:5173.
 */
import { test, expect } from '../../fixtures/index'
import { CurriculumMapPage } from '../../pages/CurriculumMapPage'
import { completeRequiredSteps, levelOf, topicOf } from '../../helpers/unlockFixtures'

const SAVING = 'saving'
const CAPSTONE = 'first-money-saved'

test.describe('Curriculum — missions never gate', () => {
  test('finishing the road alone unlocks the next topic, leaves the capstone open, and crests', async ({
    page,
    loggedInPage,
  }) => {
    test.slow()
    const { api } = loggedInPage
    const map = new CurriculumMapPage(page)

    // Open `saving` through its prerequisites' ROAD only — every mission in
    // smart-spending and budgeting stays untouched.
    await completeRequiredSteps(api, 'smart-spending')
    const opened = await api.getCurriculumMap()
    expect(topicOf(opened, 'budgeting').status).toBe('available')
    expect(topicOf(opened, SAVING).status).toBe('available')
    expect(topicOf(opened, 'interest').status).toBe('locked')

    // Now saving's own road — its lessons, quizzes and scenario, no missions.
    const written = await completeRequiredSteps(api, SAVING)
    expect(written).toBeGreaterThan(0)

    const payload = await api.getCurriculumMap()
    // The next topics opened on knowledge alone …
    expect(topicOf(payload, SAVING).status).toBe('completed')
    expect(topicOf(payload, 'interest').status).toBe('available')
    expect(topicOf(payload, 'net-wealth').status).toBe('available')
    // … the mission capstone is an OPEN side quest, nothing completed in it …
    const capstone = levelOf(payload, SAVING, CAPSTONE)
    expect(capstone.status).toBe('optional')
    expect(capstone.required_step_count).toBe(0)
    expect(capstone.steps_completed).toBe(0)
    // … and the crest IS present.
    const crest = topicOf(payload, SAVING).crest
    expect(crest.levels_completed).toBe(crest.levels_total_playable)

    // The map says the same thing the payload does.
    await map.goto(45_000)
    await map.expandIslandFor(SAVING)
    await expect(map.topic(SAVING)).toHaveAttribute('data-topic-status', 'completed')
    expect(await map.levelNodeStatus(SAVING, CAPSTONE)).toBe('optional')
    await expect(map.levelNode(SAVING, CAPSTONE)).toHaveAttribute('data-side-quest', 'true')
    // The side quest is reachable — never `current`, never disabled.
    await expect(map.levelNode(SAVING, CAPSTONE)).toBeEnabled()
    expect(await map.nodesInTopic(SAVING, 'current').count()).toBe(0)
    expect(await map.crestCountValue()).toBeGreaterThanOrEqual(1)
  })

  test('a mission-only topic passes learners through and never crests', async ({
    page,
    loggedInPage,
  }) => {
    test.slow()
    const { api } = loggedInPage
    const map = new CurriculumMapPage(page)

    await completeRequiredSteps(api, 'smart-spending')
    const before = await api.getCurriculumMap()
    const budgeting = topicOf(before, 'budgeting')
    // `budgeting` holds nothing but missions: it lets `saving` through with ZERO
    // of them done, and claims no badge for work nobody did.
    expect(budgeting.levels.length).toBeGreaterThan(0)
    expect(budgeting.levels.every((l) => l.required_step_count === 0)).toBe(true)
    expect(budgeting.status).toBe('available')
    // No required work in it, so it offers no fraction at all.
    expect(budgeting.crest.levels_completed).toBe(0)
    expect(budgeting.crest.levels_total_playable).toBe(0)
    expect(topicOf(before, SAVING).status).toBe('available')

    await map.goto(45_000)
    await map.expandIslandFor('budgeting')
    await expect(map.topic('budgeting')).toHaveAttribute('data-topic-status', 'available')
    expect(await map.sideQuestNodes('budgeting').count()).toBeGreaterThan(0)

    // Every mission in it done — the badge still does not move.
    const crestBefore = await map.crestCountValue()
    for (const level of budgeting.levels) {
      if (level.step_count > 0) {
        await api.seedLevelState({ topic_slug: 'budgeting', level_slug: level.slug })
      }
    }
    const after = await api.getCurriculumMap()
    expect(topicOf(after, 'budgeting').status).toBe('available')
    expect(after.bars.knowledge.crest_count).toBe(before.bars.knowledge.crest_count)
    // …while the learner's own work stays visible on every node they did.
    expect(
      after.sections
        .flatMap((s) => s.topics)
        .filter((t) => t.slug === 'budgeting')
        .flatMap((t) => t.levels)
        .filter((l) => l.step_count > 0)
        .every((l) => l.status === 'completed'),
    ).toBe(true)

    await map.goto(45_000)
    await map.expandIslandFor('budgeting')
    await expect(map.topic('budgeting')).toHaveAttribute('data-topic-status', 'available')
    expect(await map.crestCountValue()).toBe(crestBefore)
  })

  test('an unauthored topic still walls the road behind it', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    const map = new CurriculumMapPage(page)

    await completeRequiredSteps(api, 'earning-money')
    const payload = await api.getCurriculumMap()

    // earning-money's road opened the mission-only `career-choice`, which passes
    // straight through to `writing-a-cv` — and there the road stops, because
    // `writing-a-cv` has no content at all.
    expect(topicOf(payload, 'earning-money').status).toBe('completed')
    expect(topicOf(payload, 'career-choice').status).toBe('available')
    const cv = topicOf(payload, 'writing-a-cv')
    expect(cv.levels.length).toBeGreaterThan(0)
    expect(cv.levels.every((l) => l.step_count === 0)).toBe(true)
    expect(topicOf(payload, 'job-applications').status).toBe('locked')
    expect(topicOf(payload, 'job-applications').prerequisites).toEqual(['writing-a-cv'])

    await map.goto(45_000)
    await map.expandIslandFor('job-applications')
    await expect(map.topic('job-applications')).toHaveAttribute('data-topic-status', 'locked')
    await expect(map.topic('writing-a-cv')).toHaveAttribute('data-topic-status', 'available')
  })
})
