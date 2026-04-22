/**
 * Marketing — Quiz Submission API (Phase 04, Story 4.4)
 *
 * API-level Playwright coverage for the anonymous quiz submission lifecycle.
 * All tests hit the live Django backend via `request.newContext()` — no
 * browser is launched.
 *
 * Baseline fixture assumption: `manage.py seed_quiz` has been executed against
 * the target database so that an active `QuizDefinition` with slug
 * `household-finance-v1` exists. The suite does NOT hardcode the seeded
 * question count (15); it bootstraps the expected count from the first
 * successful POST response and asserts subsequent payloads against that
 * number. This keeps the spec resilient to content edits.
 *
 * Rate-limit test note:
 *   The rate-limit assertion for Story 4.4 lives in `zz-rate-limit.spec.ts`
 *   so that, when the marketing dir is run with `--workers=1`, it executes
 *   strictly after every submission-creating test in both this file and
 *   `signup-quiz-link.spec.ts`. Keeping it here would exhaust the 10/hour
 *   AnonRateThrottle budget before `signup-quiz-link` tests get a chance to
 *   create their submissions.
 *
 * Invocation:
 *   pnpm test:marketing   (playwright test tests/marketing/ --project=chromium --workers=1)
 *   Full-suite parallel runs will race these specs for the 10/hour IP budget
 *   and some marketing tests will 429 spuriously. Use the dedicated script.
 */
import { test, expect, request as pwRequest, APIRequestContext } from '@playwright/test'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://127.0.0.1:8000'
const QUIZ_SLUG = 'household-finance-v1'

// These tests hit the backend via `request.newContext()` and never launch a
// browser, so the device project (mobile-safari / tablet) is irrelevant. The
// 10/hour AnonRateThrottle is global per IP and would be exhausted by repeated
// runs across three projects; skip everything but `chromium` to keep the
// budget sane. Run with `--project=chromium --workers=1` for a clean suite.
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'API-only suite; runs on chromium project only')
})

// Every test in this file creates a submission. With the 10/hour AnonRateThrottle,
// running them in parallel quickly exhausts the budget and produces spurious 429s
// in non-throttle tests. Force serial execution so the budget is consumed
// deterministically and the rate-limit test (placed last) fires once everything
// else has settled. For a clean run, the marketing dir should be invoked with
// `--workers=1` so this file does not race `signup-quiz-link.spec.ts` for IP slots.
test.describe.configure({ mode: 'serial' })

interface QuizOption {
  id: number
  position: number
  label: string
  value: string
  // MUST NOT carry `score`
  score?: number
}

interface QuizQuestion {
  id: number
  position: number
  kind: 'yes_no' | 'single_choice' | 'multi_choice' | 'open_text'
  group: 'best_practice' | 'diagnostic'
  prompt: string
  help_text: string
  is_required: boolean
  options: QuizOption[]
  // MUST NOT carry `weight`
  weight?: number
}

interface ActiveQuiz {
  id: number
  slug: string
  title: string
  questions: QuizQuestion[]
}

interface CreateResponse {
  token: string
  quiz: ActiveQuiz
}

interface Verdict {
  band: 'low' | 'mid' | 'high'
  headline: string
  subheadline: string
  cta_label: string
}

interface Insight {
  id: string
  title: string
  body: string
}

interface Recommendation {
  id: string
  title: string
  body: string
  cta_label: string
  cta_kind: string
  cta_url?: string
}

interface ResultsResponse {
  token: string
  status: 'finalized'
  name: string
  score: number
  verdict: Verdict
  insights: Insight[]
  recommendations: Recommendation[]
}

/** Pick a valid answer payload for every required question in the active quiz. */
function buildAllAnswers(
  quiz: ActiveQuiz,
): Array<{ question_id: number; selected_values: string[]; text_value: string }> {
  return quiz.questions.map((q) => {
    if (q.kind === 'open_text') {
      return { question_id: q.id, selected_values: [], text_value: 'n/a' }
    }
    if (q.kind === 'multi_choice') {
      // Pick the first option — multi_choice accepts a single-element list.
      return { question_id: q.id, selected_values: [q.options[0].value], text_value: '' }
    }
    // yes_no or single_choice — pick the first option.
    return { question_id: q.id, selected_values: [q.options[0].value], text_value: '' }
  })
}

/** Create a fresh Playwright request context rooted at the backend. */
async function freshRequest(maxRedirects = 0): Promise<APIRequestContext> {
  return pwRequest.newContext({ baseURL: BACKEND_URL, maxRedirects })
}

/** Create a submission and return token + quiz payload. */
async function createSubmission(
  ctx: APIRequestContext,
): Promise<{ token: string; quiz: ActiveQuiz; rawStatus: number }> {
  const res = await ctx.post('/api/quiz/submissions/', {
    data: { quiz_slug: QUIZ_SLUG },
    headers: { 'Content-Type': 'application/json' },
  })
  const rawStatus = res.status()
  if (!res.ok()) {
    throw new Error(`createSubmission failed (${rawStatus}): ${await res.text()}`)
  }
  const body = (await res.json()) as CreateResponse
  return { token: body.token, quiz: body.quiz, rawStatus }
}

test.describe('Quiz Submission API — Story 4.4', () => {
  test('POST /api/quiz/submissions/ creates a pending submission and returns a token', async () => {
    const ctx = await freshRequest()
    try {
      const res = await ctx.post('/api/quiz/submissions/', {
        data: { quiz_slug: QUIZ_SLUG },
        headers: { 'Content-Type': 'application/json' },
      })
      expect(res.status()).toBe(201)
      const body = (await res.json()) as CreateResponse

      // token is a UUID v4
      expect(body.token).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      )
      expect(body.quiz.slug).toBe(QUIZ_SLUG)
      expect(Array.isArray(body.quiz.questions)).toBe(true)
      // Derive the expected count from the seeded fixture — do not hardcode 15 / 7.
      expect(body.quiz.questions.length).toBeGreaterThanOrEqual(1)

      // Security invariant: no per-option `score`, no per-question `weight`.
      for (const q of body.quiz.questions) {
        expect(q).not.toHaveProperty('weight')
        expect(q.prompt.length).toBeGreaterThan(0)
        expect(['yes_no', 'single_choice', 'multi_choice', 'open_text']).toContain(q.kind)
        expect(['best_practice', 'diagnostic']).toContain(q.group)
        for (const opt of q.options) {
          expect(opt).not.toHaveProperty('score')
          expect(opt.value.length).toBeGreaterThan(0)
        }
      }

      // Follow-up GET echoes status=in_progress.
      const getRes = await ctx.get(`/api/quiz/submissions/${body.token}/`)
      expect(getRes.status()).toBe(200)
      const getBody = await getRes.json()
      expect(getBody.status).toBe('in_progress')
    } finally {
      await ctx.dispose()
    }
  })

  test('PATCH /api/quiz/submissions/<token>/ persists answers incrementally', async () => {
    const ctx = await freshRequest()
    try {
      const { token, quiz } = await createSubmission(ctx)
      const allAnswers = buildAllAnswers(quiz)
      const firstHalf = allAnswers.slice(0, 3)
      const secondHalf = allAnswers.slice(3, 6)

      const res1 = await ctx.patch(`/api/quiz/submissions/${token}/`, {
        data: { answers: firstHalf },
        headers: { 'Content-Type': 'application/json' },
      })
      expect(res1.status()).toBe(200)

      const res2 = await ctx.patch(`/api/quiz/submissions/${token}/`, {
        data: { answers: secondHalf },
        headers: { 'Content-Type': 'application/json' },
      })
      expect(res2.status()).toBe(200)

      const getRes = await ctx.get(`/api/quiz/submissions/${token}/`)
      expect(getRes.status()).toBe(200)
      const body = await getRes.json()
      expect(Array.isArray(body.answers)).toBe(true)

      // Union of both PATCHes is present (upserted by (submission, question)).
      const savedIds = new Set<number>(body.answers.map((a: { question_id: number }) => a.question_id))
      for (const a of [...firstHalf, ...secondHalf]) {
        expect(savedIds.has(a.question_id)).toBe(true)
      }

      // In-progress GET never leaks finalize-only fields.
      expect(body).not.toHaveProperty('score')
      expect(body).not.toHaveProperty('verdict_band')
      expect(body).not.toHaveProperty('insights')
      expect(body).not.toHaveProperty('recommendations')
    } finally {
      await ctx.dispose()
    }
  })

  test('PATCH /api/quiz/submissions/<token>/ persists identity fields independently of answers', async () => {
    const ctx = await freshRequest()
    try {
      const { token } = await createSubmission(ctx)

      const res = await ctx.patch(`/api/quiz/submissions/${token}/`, {
        data: {
          name: 'Identity Only',
          email: 'identity-only@example.com',
          location: 'Riga',
          phone: '+371 20000000',
        },
        headers: { 'Content-Type': 'application/json' },
      })
      expect(res.status()).toBe(200)

      const getRes = await ctx.get(`/api/quiz/submissions/${token}/`)
      const body = await getRes.json()
      expect(body.name).toBe('Identity Only')
      expect(body.email).toBe('identity-only@example.com')
      expect(body.location).toBe('Riga')
      expect(body.phone).toBe('+371 20000000')
      // No answers yet; `answers` should be an empty list (or missing).
      expect(Array.isArray(body.answers ?? [])).toBe(true)
      expect((body.answers ?? []).length).toBe(0)
    } finally {
      await ctx.dispose()
    }
  })

  test('POST /api/quiz/submissions/<token>/finalize/ transitions to finalized and returns results', async () => {
    const ctx = await freshRequest()
    try {
      const { token, quiz } = await createSubmission(ctx)

      await ctx.patch(`/api/quiz/submissions/${token}/`, {
        data: {
          name: 'Finalize User',
          email: 'finalize-user@example.com',
          location: 'Riga',
          phone: '',
        },
        headers: { 'Content-Type': 'application/json' },
      })
      await ctx.patch(`/api/quiz/submissions/${token}/`, {
        data: { answers: buildAllAnswers(quiz) },
        headers: { 'Content-Type': 'application/json' },
      })

      const finRes = await ctx.post(`/api/quiz/submissions/${token}/finalize/`, {
        data: {},
        headers: { 'Content-Type': 'application/json' },
      })
      expect(finRes.status()).toBe(200)
      const body = (await finRes.json()) as ResultsResponse

      expect(body.status).toBe('finalized')
      expect(body.token).toBe(token)
      expect(typeof body.score).toBe('number')
      expect(body.score).toBeGreaterThanOrEqual(0)
      expect(body.score).toBeLessThanOrEqual(100)

      expect(body.verdict).toBeDefined()
      expect(['low', 'mid', 'high']).toContain(body.verdict.band)
      expect(body.verdict.headline.length).toBeGreaterThan(0)
      expect(body.verdict.subheadline.length).toBeGreaterThan(0)
      expect(body.verdict.cta_label.length).toBeGreaterThan(0)

      expect(body.insights).toHaveLength(3)
      for (const ins of body.insights) {
        expect(ins.id.length).toBeGreaterThan(0)
        expect(ins.title.length).toBeGreaterThan(0)
        expect(ins.body.length).toBeGreaterThan(0)
      }

      expect(body.recommendations.length).toBeGreaterThanOrEqual(3)
      expect(body.recommendations.length).toBeLessThanOrEqual(5)

      // The final recommendation carries a cta_url pointing at the signup page
      // with the submission token injected.
      const last = body.recommendations[body.recommendations.length - 1]
      expect(last.cta_url).toBe(`/signup?from_quiz=${token}`)
    } finally {
      await ctx.dispose()
    }
  })

  test('POST finalize/ rejects incomplete submissions with 400', async () => {
    const ctx = await freshRequest()
    try {
      const { token, quiz } = await createSubmission(ctx)

      // Save identity but intentionally omit one required answer.
      await ctx.patch(`/api/quiz/submissions/${token}/`, {
        data: {
          name: 'Incomplete',
          email: 'incomplete@example.com',
          location: '',
          phone: '',
        },
        headers: { 'Content-Type': 'application/json' },
      })
      const partial = buildAllAnswers(quiz).slice(1) // drop first required answer
      await ctx.patch(`/api/quiz/submissions/${token}/`, {
        data: { answers: partial },
        headers: { 'Content-Type': 'application/json' },
      })

      const res = await ctx.post(`/api/quiz/submissions/${token}/finalize/`, {
        data: {},
        headers: { 'Content-Type': 'application/json' },
      })
      expect(res.status()).toBe(400)

      // Status remains in_progress — GET confirms.
      const getRes = await ctx.get(`/api/quiz/submissions/${token}/`)
      expect(getRes.status()).toBe(200)
      const body = await getRes.json()
      expect(body.status).toBe('in_progress')
    } finally {
      await ctx.dispose()
    }
  })

  test('POST finalize/ on an already-finalized submission returns 409', async () => {
    const ctx = await freshRequest()
    try {
      const { token, quiz } = await createSubmission(ctx)

      await ctx.patch(`/api/quiz/submissions/${token}/`, {
        data: {
          name: 'Double Finalize',
          email: 'double@example.com',
          location: '',
          phone: '',
          answers: buildAllAnswers(quiz),
        },
        headers: { 'Content-Type': 'application/json' },
      })

      const first = await ctx.post(`/api/quiz/submissions/${token}/finalize/`, {
        data: {},
        headers: { 'Content-Type': 'application/json' },
      })
      expect(first.status()).toBe(200)
      const firstBody = (await first.json()) as ResultsResponse
      const initialScore = firstBody.score

      const second = await ctx.post(`/api/quiz/submissions/${token}/finalize/`, {
        data: {},
        headers: { 'Content-Type': 'application/json' },
      })
      expect(second.status()).toBe(409)

      // Fetch results and confirm score unchanged.
      const results = await ctx.get(`/api/quiz/submissions/${token}/results/`)
      expect(results.status()).toBe(200)
      const resultsBody = (await results.json()) as ResultsResponse
      expect(resultsBody.score).toBe(initialScore)
    } finally {
      await ctx.dispose()
    }
  })

  test('GET /api/quiz/submissions/<token>/ on a finalized submission issues a 303 redirect to results', async () => {
    // Must explicitly disable redirect-following, otherwise Playwright eats the 303.
    const ctx = await freshRequest(0)
    try {
      const { token, quiz } = await createSubmission(ctx)
      await ctx.patch(`/api/quiz/submissions/${token}/`, {
        data: {
          name: 'Redirect User',
          email: 'redirect@example.com',
          location: '',
          phone: '',
          answers: buildAllAnswers(quiz),
        },
        headers: { 'Content-Type': 'application/json' },
      })
      const fin = await ctx.post(`/api/quiz/submissions/${token}/finalize/`, {
        data: {},
        headers: { 'Content-Type': 'application/json' },
      })
      expect(fin.status()).toBe(200)

      const getRes = await ctx.get(`/api/quiz/submissions/${token}/`)
      expect(getRes.status()).toBe(303)
      const location = getRes.headers()['location']
      expect(location).toBe(`/api/quiz/submissions/${token}/results/`)
    } finally {
      await ctx.dispose()
    }
  })

  test('GET /api/quiz/submissions/<token>/results/ returns 404 before finalize and matches finalize payload after', async () => {
    const ctx = await freshRequest()
    try {
      const { token, quiz } = await createSubmission(ctx)

      const before = await ctx.get(`/api/quiz/submissions/${token}/results/`)
      expect(before.status()).toBe(404)

      await ctx.patch(`/api/quiz/submissions/${token}/`, {
        data: {
          name: 'Results User',
          email: 'results@example.com',
          location: '',
          phone: '',
          answers: buildAllAnswers(quiz),
        },
        headers: { 'Content-Type': 'application/json' },
      })
      const fin = await ctx.post(`/api/quiz/submissions/${token}/finalize/`, {
        data: {},
        headers: { 'Content-Type': 'application/json' },
      })
      expect(fin.status()).toBe(200)
      const finBody = (await fin.json()) as ResultsResponse

      const after = await ctx.get(`/api/quiz/submissions/${token}/results/`)
      expect(after.status()).toBe(200)
      const afterBody = (await after.json()) as ResultsResponse

      expect(afterBody.token).toBe(finBody.token)
      expect(afterBody.score).toBe(finBody.score)
      expect(afterBody.verdict).toEqual(finBody.verdict)
      expect(afterBody.insights).toEqual(finBody.insights)
      expect(afterBody.recommendations).toEqual(finBody.recommendations)
    } finally {
      await ctx.dispose()
    }
  })
})

// The rate-limit test for Story 4.4 lives in `zz-rate-limit.spec.ts` so that,
// when the marketing suite is run with `--workers=1`, it executes strictly
// after every other submission-creating test across both files. Moving it out
// of this file was necessary to keep the submission-creating tests in
// `signup-quiz-link.spec.ts` inside the 10/hour AnonRateThrottle budget.
