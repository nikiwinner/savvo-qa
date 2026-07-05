/**
 * Curriculum — Topic 0 "Start here" plays end-to-end (Phase 24, Story 24.4)
 *
 * "Start here" (Section 0, `start-here`) is the orientation topic every new user
 * lands on FIRST: how the course works + a demo mini-quiz, then the TWO real
 * foundational setup missions — create your first Space (`space_exists`) and
 * create your first routing rule (`claim_rule_exists`), both PLAIN (non-bound)
 * predicates honestly completable by a brand-new zero-transaction user. The L4
 * checkpoint close awards the Section 0 crest.
 *
 * Pollution-safety (gotcha #26): "Start here" is REAL seeded content (the runtime
 * seeder authors it), so this file seeds NO global `Step` — every fixture is
 * PER-USER progress (StepCompletion / spaces / claim rules), `request.user`-scoped.
 * The persistent QA content DB is never mutated; every test uses a fresh user.
 *
 * `test.slow()` + 45s waits absorb the single-threaded QA stack's cold-start.
 */
import { test, expect } from '../../fixtures/index'
import { CurriculumMapPage } from '../../pages/CurriculumMapPage'
import {
  START_HERE_SECTION,
  L1_TITLE,
  L1_HOW_THIS_WORKS,
  L2_MISSIONS_ARE_REAL,
  L3_THE_PIECES,
  MISSIONS_REAL_LESSON_SLUG,
  PIECES_LESSON_SLUG,
  CREATE_RULE_MISSION_SLUG,
  TAKE_TOUR_MISSION_SLUG,
  MAP_QUIZ_ANSWERS,
  completeStartHereLevels,
  precompleteStartHereStep,
} from '../../helpers/startHereFixtures'

// Money/currency tripwire (same shape as map.spec / saving.spec): any currency
// symbol, a currency-formatted decimal, or an ISO code. The Topic 0 surface must
// show ZERO money — only XP / crest / streak (behavior-rules: no fake numbers).
const MONEY_PATTERN = /[€$£¥]|\b\d+[.,]\d{2}\b|\bEUR\b|\bUSD\b|\bGBP\b/

test.describe('Curriculum — Start here (Topic 0)', () => {
  test('a fresh user lands on Start here as the first node', async ({ page, loggedInPage: _ }) => {
    const map = new CurriculumMapPage(page)
    await map.goto()

    await expect(map.map).toBeVisible()
    // Section 0 renders FIRST on the map (order 0).
    expect(await map.sections.first().getAttribute('data-section-slug')).toBe(START_HERE_SECTION)

    // The `start-here` topic is `available` (no prerequisites) with exactly one
    // current node — its L1 `how-this-works`.
    await expect(map.topic('start-here')).toHaveAttribute('data-topic-status', 'available')
    expect(await map.nodesInTopic('start-here', 'current').count()).toBe(1)
    const currentNode = map.nodesInTopic('start-here', 'current').first()
    await expect(currentNode).toBeVisible()
    await expect(currentNode).toHaveAttribute('aria-label', new RegExp(L1_TITLE))
  })

  test('the demo mini-quiz completes and raises XP', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    await api.getCurriculumMap() // lazy-seed the tree

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    const xpBefore = await map.xpValue()
    expect(xpBefore).toBe(0)

    // L1 `how-this-works` is the current node → host mounts the v2 lesson (order
    // 1), then auto-advances to the `map-basics` demo mini-quiz (order 2).
    await map.openCurrentNode('start-here')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'lesson')
    await map.playLessonDeck()

    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'quiz', { timeout: 45_000 })
    await map.answerMcqQuiz(MAP_QUIZ_ANSWERS)

    // L1 completes → host closes → real XP lands (lesson + quiz), from the ledger.
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
    await expect.poll(async () => map.xpValue(), { timeout: 45_000 }).toBeGreaterThan(xpBefore)
    expect((await api.getCurriculumMap()).bars.knowledge.xp_total).toBeGreaterThan(0)
  })

  test('creating the first Space passes the setup mission', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    // Complete L1, then pre-complete the L2 lesson so the create-Space MISSION is
    // the active step of the L2 current node.
    await completeStartHereLevels(api, L1_HOW_THIS_WORKS)
    await precompleteStartHereStep(api, L2_MISSIONS_ARE_REAL, MISSIONS_REAL_LESSON_SLUG)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    const xpBefore = await map.xpValue()
    expect(xpBefore).toBe(0)

    await map.openCurrentNode('start-here')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'mission')
    // A PLAIN (non-binding) space_exists mission: NO Space picker, NO self_attest,
    // a real deep-link CTA to /dashboard/spaces.
    await expect(map.spacePicker).toHaveCount(0)
    await expect(map.missionSelfAttest).toHaveCount(0)
    await expect(map.missionDeeplink).toBeVisible()

    // No Space yet → honest FAIL, no snapshot, no fabricated pass.
    await map.missionVerify.click()
    await expect(map.missionFailNote).toBeVisible({ timeout: 45_000 })
    await expect(map.verifierSnapshot).toHaveCount(0)

    // Create a REAL Space, verify again → PASS naming the real Space id (tappable
    // to /dashboard/spaces — every figure traces to a real row).
    const space = await api.createSpace('QA Start Space')
    await map.missionVerify.click()
    await expect(map.verifierSnapshot).toBeVisible({ timeout: 45_000 })
    const figure = map.snapshotFigure.first()
    await expect(figure).toContainText(String(space.id))
    await expect(figure).toHaveAttribute('href', /\/dashboard\/spaces/)

    // Continue → the mission was the last step in L2 → host closes, real XP lands.
    await map.missionContinue.click()
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
    await expect.poll(async () => map.xpValue(), { timeout: 45_000 }).toBeGreaterThan(xpBefore)
  })

  test('the mission deep-link actually navigates into the app', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    // Same setup as the create-Space mission above: L1 done + the L2 lesson
    // pre-completed → the create-your-first-space MISSION is the L2 active step.
    await completeStartHereLevels(api, L1_HOW_THIS_WORKS)
    await precompleteStartHereStep(api, L2_MISSIONS_ARE_REAL, MISSIONS_REAL_LESSON_SLUG)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    await map.openCurrentNode('start-here')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'mission')

    // The redesign made the deep-link the FILLED hero CTA — a real anchor to
    // /dashboard/spaces. Clicking it must actually navigate (this test fails loudly
    // if a future change swallows anchor clicks inside the step-player modal — the
    // gap live testing exposed, since the old assertion only checked toBeVisible()).
    await expect(map.missionDeeplink).toBeVisible()
    await expect(map.missionDeeplink).toHaveAttribute('href', /\/dashboard\/spaces/)

    await map.missionDeeplink.click()
    await page.waitForURL('**/dashboard/spaces', { timeout: 45_000 })
    // …and the destination truly renders (not a blank client-nav no-op).
    await expect(page.locator('h1', { hasText: 'Spaces' })).toBeVisible({ timeout: 45_000 })
  })

  test('creating the first rule passes the setup mission', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    // Complete L1 + L2 (their create-Space mission is marked done by the DEBUG
    // seed, bypassing verify), then pre-complete the L3 lesson AND the L3
    // `take-the-tour` mission (Phase 24 added it at order 3, after this one) so the
    // create-rule MISSION is the ONLY active step of the L3 current node — Continue
    // then closes the host instead of advancing to the tour.
    await completeStartHereLevels(api, L1_HOW_THIS_WORKS, L2_MISSIONS_ARE_REAL)
    await precompleteStartHereStep(api, L3_THE_PIECES, PIECES_LESSON_SLUG)
    await precompleteStartHereStep(api, L3_THE_PIECES, TAKE_TOUR_MISSION_SLUG)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    const xpBefore = await map.xpValue()
    expect(xpBefore).toBe(0)

    await map.openCurrentNode('start-here')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'mission')
    // A PLAIN claim_rule_exists mission: NO picker, NO self_attest, deep-link to
    // the routing-rules form (which needs no transaction).
    await expect(map.spacePicker).toHaveCount(0)
    await expect(map.missionSelfAttest).toHaveCount(0)
    await expect(map.missionDeeplink).toBeVisible()

    // No rule yet → honest FAIL.
    await map.missionVerify.click()
    await expect(map.missionFailNote).toBeVisible({ timeout: 45_000 })
    await expect(map.verifierSnapshot).toHaveCount(0)

    // Create a REAL SpaceClaimRule (a Space + one condition; no transaction
    // required), verify again → PASS naming the rule's Space (tappable to the
    // routing-rules page).
    const space = await api.createSpace('QA Rule Space')
    await api.createClaimRule({ space: space.id, name: 'QA start rule', merchant_contains: 'coffee' })
    await map.missionVerify.click()
    await expect(map.verifierSnapshot).toBeVisible({ timeout: 45_000 })
    const figure = map.snapshotFigure.first()
    await expect(figure).toContainText(String(space.id))
    await expect(figure).toHaveAttribute('href', /routing-rules/)

    await map.missionContinue.click()
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
    await expect.poll(async () => map.xpValue(), { timeout: 45_000 }).toBeGreaterThan(xpBefore)
  })

  test('the take-the-tour mission leads with the deep-link and marks done', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    // Reach L3 `the-pieces` with the tour as the active step: complete L1 + L2,
    // then pre-complete the L3 lesson AND the create-rule mission (orders 1 + 2) so
    // `take-the-tour` (order 3) is the sole incomplete step of the L3 current node.
    await completeStartHereLevels(api, L1_HOW_THIS_WORKS, L2_MISSIONS_ARE_REAL)
    await precompleteStartHereStep(api, L3_THE_PIECES, PIECES_LESSON_SLUG)
    await precompleteStartHereStep(api, L3_THE_PIECES, CREATE_RULE_MISSION_SLUG)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    const xpBefore = await map.xpValue()
    expect(xpBefore).toBe(0)

    await map.openCurrentNode('start-here')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'mission')

    // A self_attest mission WITH a seeded deep-link: the honest "Mark done" path is
    // present AND the deep-link stays the leading action (do the thing, then
    // attest). Assert testid presence + the /dashboard/transactions href only — no
    // CSS-class assertions on the emphasis (which is styling, not behaviour).
    await expect(map.missionSelfAttest).toBeVisible()
    await expect(map.missionDeeplink).toBeVisible()
    await expect(map.missionDeeplink).toHaveAttribute('href', /\/dashboard\/transactions/)

    // "Mark done" (self_attest) completes the tour → it's the last L3 step → the
    // host closes and the real XP lands, traceable to the ledger (API parity).
    await map.missionVerify.click()
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
    await expect.poll(async () => map.xpValue(), { timeout: 45_000 }).toBeGreaterThan(xpBefore)
    expect((await api.getCurriculumMap()).bars.knowledge.xp_total).toBeGreaterThan(0)
  })

  test('finishing Start here reveals the Section 0 crest', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    // Seed-complete L1–L3 (their setup missions — including the Phase-24 L3
    // `take-the-tour` — are all marked done by the DEBUG seed, which completes
    // EVERY step in the level, bypassing verify) so the L4 checkpoint is current.
    await completeStartHereLevels(api, L1_HOW_THIS_WORKS, L2_MISSIONS_ARE_REAL, L3_THE_PIECES)

    const crestBefore = (await api.getCurriculumMap()).bars.knowledge.crest_count

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    // L4 `youre-set-up` is a lesson-only checkpoint — play its v2 deck (an
    // interactive recap card gates one advance) to complete the level.
    await map.openCurrentNode('start-here')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'lesson')
    const tapped = await map.playLessonDeck()
    expect(tapped).toBeGreaterThan(0)

    // The checkpoint crest reveal fires; the real crest count rose by exactly one.
    await expect(map.crestReveal).toBeVisible({ timeout: 45_000 })
    const crestAfter = (await api.getCurriculumMap()).bars.knowledge.crest_count
    expect(crestAfter).toBe(crestBefore + 1)
    // …and the on-screen Bar #1 chip shows the SAME real number (live refresh).
    await expect.poll(() => map.crestCountValue(), { timeout: 15_000 }).toBe(crestAfter)
  })

  test('the Start here surface shows zero money figures', async ({ page, loggedInPage: _ }) => {
    const map = new CurriculumMapPage(page)
    await map.goto()
    await expect(map.map).toBeVisible()
    await expect(map.topic('start-here')).toHaveAttribute('data-topic-status', 'available')

    // XP / crest / streak only — the Topic 0 surface never renders a money figure.
    const pageText = await map.learnPage.innerText()
    expect(pageText).not.toMatch(MONEY_PATTERN)
  })
})
