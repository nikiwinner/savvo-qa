/**
 * Expenses — currency selector in the create form (Phase 08, Story 8.10)
 *
 * Verifies that the create form on /dashboard/expenses exposes a currency
 * dropdown defaulted to the viewer's currency, that picking a different
 * currency persists on submit, and that the new row renders with the
 * correct currency symbol.
 */
import { test, expect } from '../../fixtures/index'
import { ExpensesPage } from '../../pages/ExpensesPage'

test.describe('Currency selector on the expense create form', () => {
  test('creating an expense with explicit currency persists the chosen currency', async ({
    page,
    loggedInPage,
  }) => {
    const { api } = loggedInPage
    // Default user.currency is 'EUR'; we'll switch to 'USD' at create time.
    const space = await api.createSpace('Create Currency Home')
    const description = `create-currency-${Date.now()}`

    const expenses = new ExpensesPage(page)
    await expenses.gotoWithSpace(space.id)
    await expenses.openCreateForm()

    // The default selection must be the viewer's currency (EUR).
    const currencySelect = expenses.createForm.locator('select[name="currency"]')
    await expect(currencySelect).toBeVisible()
    await expect(currencySelect).toHaveValue('EUR')

    // Switch to USD. Use the imperative pattern from edit-currency.spec.ts so
    // WebKit/mobile-safari, which doesn't always honor selectOption() on a
    // native <select>, still picks up the change.
    await currencySelect.evaluate((el) => {
      const select = el as HTMLSelectElement
      select.value = 'USD'
      select.dispatchEvent(new Event('input', { bubbles: true }))
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await expect(currencySelect).toHaveValue('USD')

    // Fill description and amount.
    await expenses.createForm.locator('#description').fill(description)
    await expenses.createForm.locator('#amount').fill('17.25')

    // Re-assert space and currency immediately before submit, since
    // any reactive Svelte re-render could reset native form values.
    await page.evaluate(
      ({ spaceId, descValue, amountValue, currencyValue }: {
        spaceId: number
        descValue: string
        amountValue: string
        currencyValue: string
      }) => {
        const form = document.querySelector('.form-paper form') as HTMLFormElement | null
        if (!form) return
        const hh = form.querySelector('#space_id') as HTMLSelectElement | null
        if (hh) hh.value = String(spaceId)
        const desc = form.querySelector('#description') as HTMLInputElement | null
        if (desc) desc.value = descValue
        const amt = form.querySelector('#amount') as HTMLInputElement | null
        if (amt) amt.value = amountValue
        const cur = form.querySelector('select[name="currency"]') as HTMLSelectElement | null
        if (cur) cur.value = currencyValue
      },
      {
        spaceId: space.id,
        descValue: description,
        amountValue: '17.25',
        currencyValue: 'USD',
      },
    )

    // Submit and wait for the SvelteKit form action to complete.
    const responsePromise = page.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url().includes('?/create'),
    )
    const submitBtn = expenses.createForm.locator('button', { hasText: 'Add Transaction' })
    await submitBtn.scrollIntoViewIfNeeded()
    await submitBtn.click()
    const submitRes = await responsePromise
    expect(submitRes.status()).toBe(200)

    // Authoritative check: the API records the row with currency='USD'.
    await expect
      .poll(
        async () => {
          const all = await api.listExpenses()
          const found = all.find(
            (e) => (e as unknown as { description?: string }).description === description,
          )
          return (found as unknown as { currency?: string } | undefined)?.currency ?? null
        },
        { timeout: 5000 },
      )
      .toBe('USD')

    // Reload and verify the row renders with the USD symbol — not EUR.
    // Display-currency-first layout (Story 10.7, revised): the primary
    // `.canonical` line shows the display currency, with the native amount as a
    // small secondary line. Here the primary resolves to `$` (same-currency or
    // native fallback), so scope the symbol assertions to the canonical line.
    await page.reload()
    await page.waitForLoadState('networkidle')
    const row = expenses.row(description)
    await expect(row).toBeVisible({ timeout: 5000 })
    const canonical = row.locator('td.cell-amount .canonical')
    await expect(canonical).toBeVisible()
    const canonicalText = await canonical.innerText()
    expect(canonicalText).toContain('$')
    expect(canonicalText).not.toContain('€')
  })
})
