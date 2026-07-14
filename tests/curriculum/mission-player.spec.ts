/**
 * Curriculum — Mission player + verify write-path (Phase 22, Story 22.6 / 22.3)
 *
 * The ★ Mission player is the first production caller of the Phase-20 verifier.
 * A `self_attest` mission completes on an honest "nothing to verify but you"
 * label; a row-verified mission (`space_exists`) FAILS without real data and
 * PASSES once the row exists, rendering a `verifier-snapshot` whose every figure
 * taps through to the source rows (no-fake-numbers). Verification is strictly
 * `request.user`-scoped — a non-owner's rows never leak into the snapshot, and an
 * anonymous verify is rejected.
 *
 * The row-verified fixture lands in the pollution-safe
 * `smart-spending / name-what-you-buy` level (see `helpers/curriculumFixtures.ts`);
 * the `self_attest` case reuses the real single-mission `earning-inventory` node.
 * `test.slow()` + 45s waits absorb the QA stack's cold-start window.
 */
import { test, expect } from '../../fixtures/index'
import { CurriculumMapPage } from '../../pages/CurriculumMapPage'
import { CELEBRATES } from '../../helpers/reactions'
import {
  seedPlayerFixtures,
  makeFixtureLevelPlayable,
  unlockFixtureLevel,
  MISSION_XP,
} from '../../helpers/curriculumFixtures'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8001'

test.describe('Curriculum — mission player', () => {
  test('a self_attest mission shows the honest label and completes', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage

    const map = new CurriculumMapPage(page)
    await map.goto(45_000) // fresh user — seeds the tree + renders the map
    const xpBefore = await map.xpValue()
    expect(xpBefore).toBe(0)

    // `earning-inventory` is a fresh user's `current` node in earning-money and
    // holds a single self_attest mission (in a collapsed island — expand it first).
    await map.expandIslandFor('earning-money')
    await map.nodesInTopic('earning-money', 'current').first().click()
    await expect(map.stepPlayerHost).toBeVisible()
    await expect(map.stepPlayer).toBeVisible({ timeout: 45_000 })
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'mission')

    // The honest "nothing to verify but you" label — and NO fabricated row check.
    await expect(page.getByTestId('mission-self-attest')).toBeVisible()
    await expect(page.getByTestId('verifier-snapshot')).toHaveCount(0)

    // "Mark done" completes it on the user's honour → a self-attest mission DOES
    // get the Phase-27 reward screen (no row snapshot to celebrate in) → Continue
    // closes the host.
    await page.getByTestId('mission-verify').click()
    await map.absorbCompletionScreen()

    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
    await expect.poll(async () => map.xpValue(), { timeout: 45_000 }).toBeGreaterThan(xpBefore)
    const payload = await api.getCurriculumMap()
    expect(payload.bars.knowledge.xp_total).toBeGreaterThan(0)
  })

  test('a row-verified mission fails without data then passes with it', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    const { mission } = await seedPlayerFixtures(api)
    await makeFixtureLevelPlayable(api, mission.step_id)

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)

    await map.expandIslandFor('smart-spending')
    await map.nodesInTopic('smart-spending', 'current').first().click()
    await expect(map.stepPlayerHost).toBeVisible()
    await expect(map.stepPlayer).toBeVisible({ timeout: 45_000 })
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'mission')
    // Row-verified — NOT a self_attest label; there's a real "Verify" action + deep link.
    await expect(page.getByTestId('mission-self-attest')).toHaveCount(0)
    await expect(page.getByTestId('mission-deeplink')).toBeVisible()

    // No space yet → honest FAIL, no completion.
    await page.getByTestId('mission-verify').click()
    await expect(page.getByTestId('mission-fail-note')).toBeVisible({ timeout: 45_000 })
    await expect(page.getByTestId('verifier-snapshot')).toHaveCount(0)

    // Do the real thing, then verify again → PASS against real rows.
    const space = await api.createSpace('QA Mission Home')
    await page.getByTestId('mission-verify').click()

    // The snapshot: a tappable figure carrying the real space id → its source rows.
    await expect(page.getByTestId('verifier-snapshot')).toBeVisible({ timeout: 45_000 })
    const figure = page.getByTestId('snapshot-figure').first()
    await expect(figure).toBeVisible()
    await expect(figure).toContainText(String(space.id))
    await expect(figure).toHaveAttribute('href', /\/dashboard\/spaces/)

    // XP awarded on the real pass (traceable to the ledger).
    const payload = await api.getCurriculumMap()
    expect(payload.bars.knowledge.xp_total).toBe(MISSION_XP)
  })

  test('verify is user-scoped and blocks a non-owner’s data', async ({ twoActors, playwright }) => {
    test.slow()
    const { apiA, apiB } = twoActors

    const { mission } = await seedPlayerFixtures(apiA)
    await unlockFixtureLevel(apiA) // make the fixture level playable for A

    // A has no space → honest FAIL, snapshot names zero spaces.
    const noData = await apiA.verifyStep(mission.step_id)
    expect(noData.passed).toBe(false)
    expect((noData.snapshot['space_exists'] as { space_ids: number[] }).space_ids).toEqual([])

    // B owns a space — it must NEVER appear in A's snapshot.
    const bSpace = await apiB.createSpace('B private space')
    const stillFail = await apiA.verifyStep(mission.step_id)
    expect(stillFail.passed).toBe(false)
    const bLeak = (stillFail.snapshot['space_exists'] as { space_ids: number[] }).space_ids
    expect(bLeak).not.toContain(bSpace.id)
    expect(bLeak).toEqual([])

    // A creates its OWN space → PASS, snapshot carries A's id and not B's.
    const aSpace = await apiA.createSpace('A private space')
    const pass = await apiA.verifyStep(mission.step_id)
    expect(pass.passed).toBe(true)
    const aIds = (pass.snapshot['space_exists'] as { space_ids: number[] }).space_ids
    expect(aIds).toContain(aSpace.id)
    expect(aIds).not.toContain(bSpace.id)

    // A logged-out verify is rejected (session auth + IsAuthenticated → 403).
    const anon = await playwright.request.newContext()
    const res = await anon.post(`${BACKEND_URL}/api/steps/${mission.step_id}/verify/`, { data: {} })
    expect(res.status()).toBe(403)
    await anon.dispose()
  })

  test('a row-verified mission celebrates once via its snapshot', async ({ page, loggedInPage }) => {
    test.slow()
    const { api } = loggedInPage
    const { mission } = await seedPlayerFixtures(api)
    await makeFixtureLevelPlayable(api, mission.step_id)
    // Create the real Space up front so the very first verify PASSES against rows.
    await api.createSpace('QA Celebrate Home')

    const map = new CurriculumMapPage(page)
    await map.goto(45_000)
    const xpBefore = await map.xpValue()
    expect(xpBefore).toBe(0)

    await map.openCurrentNode('smart-spending')
    await expect(map.stepPlayer).toHaveAttribute('data-player-kind', 'mission')

    // Verify → PASS → the ENRICHED snapshot phase celebrates in ONE screen: a
    // celebrating line + a real +XP chip alongside the row-verified snapshot.
    await map.missionVerify.click()
    await expect(map.verifierSnapshot).toBeVisible({ timeout: 45_000 })
    await expect(map.playerReaction).toBeVisible()
    await expect(map.playerReaction).toHaveText(CELEBRATES)
    await expect(map.completionXp).toBeVisible()
    await expect(map.completionXp).toContainText(String(MISSION_XP))
    // A row-verified mission NEVER shows the separate reward screen — the snapshot
    // IS the celebration (no double screen).
    await expect(map.stepCompletion).toHaveCount(0)

    // Continue closes the host; the real XP rose by exactly the mission award.
    await map.missionContinue.click()
    await expect(map.stepPlayerHost).toBeHidden({ timeout: 45_000 })
    await expect.poll(async () => map.xpValue(), { timeout: 45_000 }).toBe(xpBefore + MISSION_XP)
  })
})
