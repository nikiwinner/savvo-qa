/**
 * Coaching — Streak day-advance, browser-level (Phase 18, Stories 18.1/18.2)
 *
 * Uses `seed/program-state/` + `seed/completion/` to pin deterministic state.
 * The program tz is `'UTC'` and every seeded date is computed in UTC so the
 * suite never flakes near midnight.
 *
 * Day-advance contract: completing day N keeps `today/` showing the completed-N
 * celebration for the SAME local calendar day; Day N+1 surfaces only on the next
 * local day. A reload after Complete therefore still shows the celebration state
 * for the same day, NOT the next day.
 */
import { test, expect } from '../../fixtures/index'
import { utcDateDaysAgo, utcInstantDaysAgo } from '../../helpers/api'
import { TodayPage } from '../../pages/TodayPage'

test.describe('Coaching — streak / day-advance', () => {
  test('completing today does not advance the day until tomorrow', async ({
    page,
    loggedInPage: _,
  }) => {
    const today = new TodayPage(page)
    await today.goto()
    await expect(today.missionCard).toBeVisible()

    // Fresh user: active Day 1.
    expect(await today.currentDay()).toBe(1)
    await today.complete()
    await expect(today.celebration).toBeVisible()
    const completedDay = await today.currentDay()
    expect(completedDay).toBe(1)

    // Reload — the completion is dated today, so `today/` keeps showing the
    // completed-Day-1 celebration state, NOT Day 2.
    await page.reload()
    await today.waitForSettled()
    await expect(today.celebration).toBeVisible()
    await expect(today.missionCard).toBeHidden()
    expect(await today.currentDay()).toBe(1)
  })

  test('seeded consecutive completions render the right streak and day counter', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage

    // Five consecutive calendar-day completions (Days 1-5) ending YESTERDAY, so
    // the live run reaches yesterday (not stale) and the next active day is Day 6.
    await api.seedProgramState({
      timezone: 'UTC',
      start_date: utcDateDaysAgo(5),
      current_day: 6,
    })
    for (let i = 0; i < 5; i++) {
      // day 1 @ 5 days ago … day 5 @ 1 day ago (yesterday).
      await api.seedCompletion({ day_number: i + 1, completed_at: utcInstantDaysAgo(5 - i) })
    }

    const today = new TodayPage(page)
    await today.goto()
    await expect(today.missionCard).toBeVisible()

    // The active day is Day 6 (no completion dated today → fresh active mission).
    expect(await today.currentDay()).toBe(6)
    expect(await today.totalDays()).toBe(30)

    // A 5-day consecutive run ending yesterday → current streak 5.
    expect(await today.currentStreak()).toBe(5)

    const payload = await api.getMissionToday()
    expect((payload.streak as { current: number; best: number }).current).toBe(5)
    expect((payload.streak as { current: number; best: number }).best).toBe(5)
  })
})
