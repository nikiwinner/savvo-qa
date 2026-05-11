/**
 * Banking — Faster perceived bank sync (Phase 09, Story 9.3)
 *
 * What this exercises:
 *  - The SyncProgress component (kickoff mode) renders an elapsed counter and
 *    a "Syncing…" label as soon as the user kicks a sync.
 *  - While the sync is in flight the UI keeps polling
 *    GET /api/bank-connections/<id>/sync_status/ every ~2s.
 *  - When the sync resolves (successfully or not) the SyncProgress component
 *    transitions out of the syncing state and disappears (parent removes the
 *    id from activeSyncIds via onComplete → invalidateAll).
 *
 * Notes / known gaps (documented, not silently skipped):
 *  - Passive-mode rendering (page load while connection.status === 'syncing')
 *    cannot be tested cleanly: the connections list is loaded SSR-side via
 *    djangoFetch, which Playwright page.route cannot intercept, and there is
 *    no debug endpoint that mutates BankConnection.status. Documented in the
 *    `test.fixme` below.
 *  - The 30s hint requires waiting 30+ seconds while the connection is in
 *    'syncing' state. With no way to pin status='syncing' server-side, we
 *    can't reliably surface the hint without slowing the suite to a crawl.
 *    Documented in the `test.fixme` below.
 */
import { test, expect } from '../../fixtures/index'

// Pre-existing Phase 09 timing flake under fullyParallel — page.clock advance
// competes for worker time on the shared :8001 backend. File-scoped retries
// keep this stable without slowing the rest of the suite. Phase 10 fix-up
// hygiene; revisit if/when the backend test stack moves to per-worker DBs.
test.describe.configure({ retries: 2 })

// Frontend (QA: `http://localhost:5174`) calls backend (QA: `http://localhost:8001`)
// from the browser via `apiFetch`. Because that's a cross-origin request with
// `credentials: 'include'` and `content-type: application/json`, the browser
// sends an OPTIONS preflight first. When we use page.route to fulfill the
// real HTTP roundtrip, our fake response MUST carry CORS headers — otherwise
// the browser rejects the response, apiFetch throws synchronously, and the
// SyncProgress component unmounts immediately (via fireComplete in its
// `finally`) before we ever see the spinner.
//
// `Access-Control-Allow-Origin` MUST echo whatever origin the browser used to
// load the page (FRONTEND_URL). Hardcoding :5173 here would break QA after we
// moved to dedicated ports.
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': process.env.FRONTEND_URL ?? 'http://localhost:5174',
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-csrftoken, X-CSRFToken',
}


test.describe('SyncProgress — kickoff mode', () => {
  test('clicking Sync now renders SyncProgress with an elapsed counter', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage

    // Seed a connection by creating a bank transaction. The seed endpoint
    // creates a BankConnection in STATUS_CONNECTED with last_synced_at=null,
    // which is exactly the "freshly-connected, never synced" state that
    // surfaces the hero "Sync now" button in the UI.
    const txn = await api.createBankTransaction({
      description: 'E2E seed txn',
      amount: '12.34',
      type: 'expense',
      transaction_date: '2026-05-01',
      currency: 'EUR',
    })
    const connectionId = txn.connection_id

    // Stall the POST /sync/ call so the SyncProgress stays in 'syncing' long
    // enough to make the UI assertions stable.
    let postSyncSeen = false
    await page.route(`**/api/bank-connections/${connectionId}/sync/`, async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: CORS_HEADERS })
        return
      }
      postSyncSeen = true
      // Resolve after ~5s with a successful payload — this is long enough for
      // the elapsed counter to advance past 1s, and short enough that the test
      // finishes the cleanup quickly.
      await new Promise((r) => setTimeout(r, 5000))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: CORS_HEADERS,
        body: JSON.stringify({ status: 'ok', synced_count: 0, categorized_count: 0 }),
      })
    })

    // Stall sync_status polls so the UI never observes a terminal state via
    // polling — we rely on the POST resolution above to end the spinner.
    let pollCount = 0
    await page.route(`**/api/bank-connections/${connectionId}/sync_status/`, async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: CORS_HEADERS })
        return
      }
      pollCount += 1
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: CORS_HEADERS,
        body: JSON.stringify({
          status: 'syncing',
          last_synced_at: null,
          error_message: '',
        }),
      })
    })

    await page.goto('/dashboard/settings/banking')
    await page.waitForLoadState('networkidle')

    // The hero "Sync now" button should be visible because last_synced_at is null.
    const heroSync = page.locator('button.btn-sync-hero')
    await expect(heroSync).toBeVisible({ timeout: 10000 })

    await heroSync.click()

    // SyncProgress should appear with the syncing label.
    const progress = page.locator('.sync-progress')
    await expect(progress).toBeVisible({ timeout: 5000 })
    await expect(progress).toHaveAttribute('data-status', 'syncing')
    await expect(progress).toContainText(/Syncing/i)

    // The elapsed counter should advance. Start by reading "0s" then expect a
    // higher value within ~3s. Use `toHaveText` polling to avoid flakiness.
    const elapsed = progress.locator('.elapsed')
    await expect(elapsed).toBeVisible()
    // Within 3.5s the counter should show at least "1s".
    await expect(elapsed).toHaveText(/[1-9]\d*s/, { timeout: 3500 })

    // Confirm that the POST /sync/ was kicked off.
    expect(postSyncSeen).toBe(true)

    // The polling loop runs on a 2s interval — by the time the elapsed counter
    // has advanced past 1s, at least one /sync_status/ poll should have fired.
    // Allow up to 4.5s total to give the second interval tick a chance.
    await expect.poll(() => pollCount, { timeout: 4500 }).toBeGreaterThanOrEqual(1)

    // After the stalled POST resolves (~5s) the SyncProgress should leave the
    // syncing state. The parent component removes the id from activeSyncIds in
    // onComplete → handleSyncComplete; after invalidateAll() the connection's
    // last_synced_at is still null in the DB (we mocked the POST), so the page
    // will re-render the hero "Sync now" button.
    await expect(heroSync).toBeVisible({ timeout: 10000 })
  })

  test('SyncProgress polls GET /sync_status/ while sync is in flight', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage

    const txn = await api.createBankTransaction({
      description: 'E2E poll txn',
      amount: '7.50',
      type: 'expense',
      transaction_date: '2026-05-01',
      currency: 'EUR',
    })
    const connectionId = txn.connection_id

    // Block the POST so the SyncProgress can never finish via the POST path —
    // this forces the UI to depend purely on the polling loop.
    await page.route(`**/api/bank-connections/${connectionId}/sync/`, async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: CORS_HEADERS })
        return
      }
      // Hold the response open for a long time. The test finishes well before
      // this resolves.
      await new Promise((r) => setTimeout(r, 30_000))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: CORS_HEADERS,
        body: JSON.stringify({ status: 'ok', synced_count: 0, categorized_count: 0 }),
      })
    })

    // First N polls report 'syncing'; the (N+1)th flips to 'connected' to let
    // SyncProgress finalize cleanly.
    let pollCount = 0
    await page.route(`**/api/bank-connections/${connectionId}/sync_status/`, async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: CORS_HEADERS })
        return
      }
      pollCount += 1
      const body =
        pollCount >= 3
          ? { status: 'connected', last_synced_at: '2026-05-02T00:00:00Z', error_message: '' }
          : { status: 'syncing', last_synced_at: null, error_message: '' }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: CORS_HEADERS,
        body: JSON.stringify(body),
      })
    })

    await page.goto('/dashboard/settings/banking')
    await page.waitForLoadState('networkidle')
    const heroSync = page.locator('button.btn-sync-hero')
    await expect(heroSync).toBeVisible({ timeout: 10000 })
    await heroSync.click()

    // The poll loop runs every 2s — wait for at least 2 polls (~4–4.5s).
    await expect.poll(() => pollCount, { timeout: 8000 }).toBeGreaterThanOrEqual(2)

    // After the third poll returns 'connected', SyncProgress finalizes.
    // It either stays mounted briefly with status='connected' (success row) or
    // is unmounted by the parent's onComplete → invalidateAll. In either case
    // the spinning .row should no longer have data-status='syncing'.
    const progress = page.locator('.sync-progress')
    await expect
      .poll(async () => {
        const count = await progress.count()
        if (count === 0) return 'gone'
        return await progress.first().getAttribute('data-status')
      }, { timeout: 8000 })
      .not.toBe('syncing')
  })
})

test.describe('SyncProgress — passive mode + 30s hint', () => {
  // The DEBUG-only POST /api/seed/bank-connection-status/ endpoint lets us
  // force `BankConnection.status='syncing'` server-side. Once the row is in
  // that state, the SvelteKit SSR `djangoFetch` for the connections list will
  // observe `status === 'syncing'` and the page renders SyncProgress in
  // passive mode automatically — no button click required, no /sync/ POST
  // emitted from the browser.
  test('passive mode renders SyncProgress when server reports status=syncing on page load', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage

    // Seed a connection (status='connected', last_synced_at=null).
    const txn = await api.createBankTransaction({
      description: 'E2E passive seed',
      amount: '4.20',
      type: 'expense',
      transaction_date: '2026-05-01',
      currency: 'EUR',
    })
    const connectionId = txn.connection_id

    // Force the connection into 'syncing' server-side.
    await api.setBankConnectionStatus(connectionId, 'syncing')

    // Track that the browser does NOT POST /sync/ in passive mode.
    let postSyncSeen = false
    await page.route(`**/api/bank-connections/${connectionId}/sync/`, async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: CORS_HEADERS })
        return
      }
      postSyncSeen = true
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: CORS_HEADERS,
        body: JSON.stringify({ status: 'ok', synced_count: 0, categorized_count: 0 }),
      })
    })

    // Mock /sync_status/: first 2 polls return 'syncing', the 3rd flips to
    // 'connected' so the component finalizes cleanly.
    let pollCount = 0
    await page.route(`**/api/bank-connections/${connectionId}/sync_status/`, async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: CORS_HEADERS })
        return
      }
      pollCount += 1
      const body =
        pollCount >= 3
          ? { status: 'connected', last_synced_at: '2026-05-02T00:00:00Z', error_message: '' }
          : { status: 'syncing', last_synced_at: null, error_message: '' }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: CORS_HEADERS,
        body: JSON.stringify(body),
      })
    })

    await page.goto('/dashboard/settings/banking')
    await page.waitForLoadState('networkidle')

    // SyncProgress should appear in passive mode without any button click.
    const progress = page.locator('.sync-progress').first()
    await expect(progress).toBeVisible({ timeout: 10000 })
    await expect(progress).toHaveAttribute('data-status', 'syncing')
    await expect(progress).toContainText(/Syncing/i)
    const elapsed = progress.locator('.elapsed')
    await expect(elapsed).toBeVisible()

    // Wait for at least one /sync_status/ poll (loop runs every 2s).
    await expect.poll(() => pollCount, { timeout: 8000 }).toBeGreaterThanOrEqual(1)

    // Critical invariant: passive mode does NOT trigger POST /sync/.
    // We can't prove a negative across the entire test, but by the time
    // pollCount has advanced, the kickoff fireSync() would already have run.
    expect(postSyncSeen).toBe(false)

    // After the 3rd poll returns 'connected', SyncProgress finalizes and the
    // parent invalidates — at that point .sync-progress either unmounts or
    // shows data-status != 'syncing'.
    await expect
      .poll(
        async () => {
          const count = await page.locator('.sync-progress').count()
          if (count === 0) return 'gone'
          return await page.locator('.sync-progress').first().getAttribute('data-status')
        },
        { timeout: 12000 },
      )
      .not.toBe('syncing')
  })

  test('30s hint surfaces after 30 elapsed seconds in syncing state', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage

    const txn = await api.createBankTransaction({
      description: 'E2E 30s-hint seed',
      amount: '9.99',
      type: 'expense',
      transaction_date: '2026-05-01',
      currency: 'EUR',
    })
    const connectionId = txn.connection_id

    // Pin status='syncing' so the SSR render kicks SyncProgress into passive mode.
    await api.setBankConnectionStatus(connectionId, 'syncing')

    // Polls keep returning 'syncing' for the duration of this test.
    await page.route(`**/api/bank-connections/${connectionId}/sync_status/`, async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: CORS_HEADERS })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: CORS_HEADERS,
        body: JSON.stringify({ status: 'syncing', last_synced_at: null, error_message: '' }),
      })
    })

    // Block any accidental POST /sync/ — passive mode should not emit one,
    // but we don't want a real call to leak through if the implementation
    // ever regresses.
    await page.route(`**/api/bank-connections/${connectionId}/sync/`, async (route) => {
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: CORS_HEADERS })
        return
      }
      // Hold open; the test ends before this resolves.
      await new Promise((r) => setTimeout(r, 60_000))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: CORS_HEADERS,
        body: JSON.stringify({ status: 'ok', synced_count: 0, categorized_count: 0 }),
      })
    })

    // Install the clock BEFORE navigation so SyncProgress's setInterval
    // bindings are captured by the simulated clock.
    await page.clock.install()

    await page.goto('/dashboard/settings/banking')
    await page.waitForLoadState('networkidle')

    const progress = page.locator('.sync-progress').first()
    await expect(progress).toBeVisible({ timeout: 10000 })
    await expect(progress).toHaveAttribute('data-status', 'syncing')

    // Tick the page's clock past 30 seconds. `runFor` (unlike `fastForward`)
    // fires every interval timer that comes due during the window — required
    // here because the elapsed counter relies on a 1s setInterval.
    await page.clock.runFor(35_000)

    const hint = progress.locator('.hint')
    await expect(hint).toBeVisible({ timeout: 5000 })
    await expect(hint).toContainText(/Tink can take up to 60 seconds/i)
    // The 30s hint is the non-stuck variant — assert we have NOT yet flipped
    // to the 90s "stuck" copy.
    await expect(progress.locator('.hint-stuck')).toHaveCount(0)

    // Push past 90s and confirm the stuck-state copy replaces the 30s hint.
    await page.clock.runFor(60_000)
    const stuck = progress.locator('.hint-stuck')
    await expect(stuck).toBeVisible({ timeout: 5000 })
    await expect(stuck).toContainText(/taking longer than expected/i)
  })
})
