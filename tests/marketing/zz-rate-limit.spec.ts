/**
 * Marketing — Quiz Submission Rate Limiting (Phase 04, Story 4.4)
 *
 * API-level coverage for the `AnonRateThrottle` on `POST /api/quiz/submissions/`
 * (10/hour per IP, DRF scope `quiz_create`).
 *
 * Why this test lives in its own `zz-*.spec.ts` file:
 *   Playwright's default file ordering is alphabetical. Running the marketing
 *   suite with `--workers=1` then executes files in this order:
 *     1. quiz-submission-api.spec.ts  (8 submission-creating tests)
 *     2. signup-quiz-link.spec.ts     (2 submission-creating tests)
 *     3. zz-rate-limit.spec.ts        (this file — exhausts the budget)
 *   By the time this test runs, roughly 10 POSTs have already landed. Firing
 *   another round here reliably produces the 429 we want to assert.
 *
 * Rate-limit window caveat: `AnonRateThrottle` uses Django's default cache
 * (LocMemCache in dev — in-process, survives request boundaries but NOT
 * server restart). If you run the full suite inside the same hour against a
 * long-lived backend, the cache carries hits between runs. The remedy is to
 * restart the backend `runserver` process (Playwright's `webServer` block
 * auto-starts a fresh one when none is listening). The assertion below is
 * still meaningful in both cases: once 429s start arriving, no further
 * request slips through as 201.
 */
import { test, expect, request as pwRequest } from '@playwright/test'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://127.0.0.1:8000'
const QUIZ_SLUG = 'household-finance-v1'

// API-only suite — skip on non-chromium projects. See the header of
// `quiz-submission-api.spec.ts` for why.
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'API-only suite; runs on chromium project only')
})

test.describe.configure({ mode: 'serial' })

test.describe('Quiz Submission API — rate limiting (Story 4.4)', () => {
  test('POST /api/quiz/submissions/ rate-limits anonymous IPs (AnonRateThrottle, 10/hour)', async () => {
    const ctx = await pwRequest.newContext({ baseURL: BACKEND_URL })
    try {
      const statuses: number[] = []
      // Fire up to 20 POSTs. Spec says the 11th should 429 from a clean cache;
      // the prior suite files consume the first ~10 slots. We assert:
      //   (a) at least one 429 occurs within 20 tries, and
      //   (b) once a 429 appears, no later request in the loop returns 201 —
      //       the throttle is sticky inside the 1-hour window.
      for (let i = 0; i < 20; i++) {
        const res = await ctx.post('/api/quiz/submissions/', {
          data: { quiz_slug: QUIZ_SLUG },
          headers: { 'Content-Type': 'application/json' },
        })
        statuses.push(res.status())
      }

      const firstThrottledIdx = statuses.indexOf(429)
      expect(firstThrottledIdx).toBeGreaterThanOrEqual(0)
      const tail = statuses.slice(firstThrottledIdx)
      for (const s of tail) {
        // Only 429 (throttled) or 403 (CSRF / permission rejection) are
        // acceptable after the window closes. A 201 here would mean the
        // throttle is leaking.
        expect(s === 429 || s === 403).toBe(true)
      }
    } finally {
      await ctx.dispose()
    }
  })
})
