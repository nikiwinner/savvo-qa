/**
 * Marketing — Signup Quiz Linkage (Phase 04, Story 4.5)
 *
 * API-level Playwright coverage for the signup endpoint's optional
 * `quiz_token` field and the `has_completed_onboarding_quiz` flag on
 * `GET /api/auth/me/`.
 *
 * All tests use a fresh `request.newContext()` per test so the session
 * cookie from signup is isolated and the subsequent `/api/auth/me/` call
 * lands on the newly-authenticated user.
 *
 * Baseline fixture assumption: `manage.py seed_quiz` has been executed and
 * an active `QuizDefinition` with slug `household-finance-v1` is present.
 *
 * Note on rate limiting: creating submissions for each test consumes slots
 * in the same 10/hour anonymous throttle that the submission spec exercises.
 * This file only creates at most 3 submissions (two of the four tests do
 * not create a submission at all), so combined with the submission-api
 * spec's usage the suite stays under the 10-per-hour ceiling per fresh
 * backend process.
 */
import { test, expect, request as pwRequest, APIRequestContext } from '@playwright/test'

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://127.0.0.1:8000'
const QUIZ_SLUG = 'household-finance-v1'

// API-only suite — skip on non-chromium projects. See the header of
// `quiz-submission-api.spec.ts` for why.
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'API-only suite; runs on chromium project only')
})

// Two of the four tests create a quiz submission, which counts against the
// 10/hour AnonRateThrottle shared with `quiz-submission-api.spec.ts`. Force
// serial execution so submissions are created one at a time. Combined with
// `--workers=1` at the marketing dir level, this keeps the entire suite inside
// the throttle budget.
test.describe.configure({ mode: 'serial' })

interface QuizOption {
  value: string
}
interface QuizQuestion {
  id: number
  kind: 'yes_no' | 'single_choice' | 'multi_choice' | 'open_text'
  options: QuizOption[]
}
interface ActiveQuiz {
  questions: QuizQuestion[]
}
interface CreateResponse {
  token: string
  quiz: ActiveQuiz
}

/** Generate a unique email so parallel or replayed tests never collide. */
function uniqueEmail(prefix: string): string {
  const ts = Date.now()
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${ts}-${rand}@example.com`
}

function buildAllAnswers(
  quiz: ActiveQuiz,
): Array<{ question_id: number; selected_values: string[]; text_value: string }> {
  return quiz.questions.map((q) => {
    if (q.kind === 'open_text') {
      return { question_id: q.id, selected_values: [], text_value: 'n/a' }
    }
    return { question_id: q.id, selected_values: [q.options[0].value], text_value: '' }
  })
}

async function freshRequest(): Promise<APIRequestContext> {
  return pwRequest.newContext({ baseURL: BACKEND_URL, maxRedirects: 0 })
}

/** Create + finalize a submission with the given identity email; return token. */
async function createFinalizedSubmission(
  ctx: APIRequestContext,
  email: string,
): Promise<string> {
  const createRes = await ctx.post('/api/quiz/submissions/', {
    data: { quiz_slug: QUIZ_SLUG },
    headers: { 'Content-Type': 'application/json' },
  })
  if (createRes.status() !== 201) {
    throw new Error(`quiz create failed: ${createRes.status()} ${await createRes.text()}`)
  }
  const { token, quiz } = (await createRes.json()) as CreateResponse

  const patchRes = await ctx.patch(`/api/quiz/submissions/${token}/`, {
    data: {
      name: 'Quiz Lead',
      email,
      location: '',
      phone: '',
      answers: buildAllAnswers(quiz),
    },
    headers: { 'Content-Type': 'application/json' },
  })
  if (patchRes.status() !== 200) {
    throw new Error(`quiz patch failed: ${patchRes.status()} ${await patchRes.text()}`)
  }

  const finRes = await ctx.post(`/api/quiz/submissions/${token}/finalize/`, {
    data: {},
    headers: { 'Content-Type': 'application/json' },
  })
  if (finRes.status() !== 200) {
    throw new Error(`quiz finalize failed: ${finRes.status()} ${await finRes.text()}`)
  }
  return token
}

/** Plain signup — no quiz_token. Signup is @csrf_exempt; no CSRF header needed. */
async function signup(
  ctx: APIRequestContext,
  email: string,
  password: string,
  extra: Record<string, unknown> = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await ctx.post('/api/auth/signup/', {
    data: {
      username: email,
      email,
      password,
      password_confirm: password,
      name: 'Signup User',
      ...extra,
    },
    headers: { 'Content-Type': 'application/json' },
  })
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { status: res.status(), body }
}

interface MeResponse {
  user: null | {
    id: number
    email: string
    has_completed_onboarding_quiz: boolean
  }
}

async function fetchMe(ctx: APIRequestContext): Promise<MeResponse> {
  const res = await ctx.get('/api/auth/me/')
  expect(res.status()).toBe(200)
  return (await res.json()) as MeResponse
}

test.describe('Signup Quiz Linkage — Story 4.5', () => {
  test('POST /api/auth/signup/ with matching quiz_token flips has_completed_onboarding_quiz=true', async () => {
    const ctx = await freshRequest()
    try {
      const email = uniqueEmail('match')
      const token = await createFinalizedSubmission(ctx, email)

      const { status } = await signup(ctx, email, 'TestPass123!', { quiz_token: token })
      expect(status).toBe(201)

      const me = await fetchMe(ctx)
      expect(me.user).not.toBeNull()
      expect(me.user!.email).toBe(email)
      expect(me.user!.has_completed_onboarding_quiz).toBe(true)
    } finally {
      await ctx.dispose()
    }
  })

  test('POST /api/auth/signup/ with quiz_token whose email does not match leaves the flag false', async () => {
    const ctx = await freshRequest()
    try {
      const quizEmail = uniqueEmail('quiz')
      const signupEmail = uniqueEmail('signup')
      const token = await createFinalizedSubmission(ctx, quizEmail)

      const { status } = await signup(ctx, signupEmail, 'TestPass123!', { quiz_token: token })
      expect(status).toBe(201)

      const me = await fetchMe(ctx)
      expect(me.user).not.toBeNull()
      expect(me.user!.email).toBe(signupEmail)
      expect(me.user!.has_completed_onboarding_quiz).toBe(false)
    } finally {
      await ctx.dispose()
    }
  })

  test('POST /api/auth/signup/ without quiz_token leaves the flag false', async () => {
    const ctx = await freshRequest()
    try {
      const email = uniqueEmail('noquiz')
      const { status } = await signup(ctx, email, 'TestPass123!')
      expect(status).toBe(201)

      const me = await fetchMe(ctx)
      expect(me.user).not.toBeNull()
      expect(me.user!.email).toBe(email)
      expect(me.user!.has_completed_onboarding_quiz).toBe(false)
    } finally {
      await ctx.dispose()
    }
  })

  test('POST /api/auth/signup/ with an unknown quiz_token does not error', async () => {
    const ctx = await freshRequest()
    try {
      const email = uniqueEmail('unknown')
      // A random UUID that has no matching submission in the DB.
      const bogusToken = '11111111-2222-3333-4444-555555555555'
      const { status } = await signup(ctx, email, 'TestPass123!', { quiz_token: bogusToken })
      expect(status).toBe(201)

      const me = await fetchMe(ctx)
      expect(me.user).not.toBeNull()
      expect(me.user!.email).toBe(email)
      expect(me.user!.has_completed_onboarding_quiz).toBe(false)
    } finally {
      await ctx.dispose()
    }
  })
})
