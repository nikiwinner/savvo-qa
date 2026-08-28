/**
 * Mirror of the accountability-confirm copy pool in
 * `frontend/src/lib/curriculum/attestConfirm.ts`.
 *
 * The dialog draws one (title, message) pair at random per open, so a spec can
 * no longer assert a literal sentence. It asserts MEMBERSHIP instead: whatever
 * the dialog shows must be a pair from this list. A pair added on one side and
 * not the other fails that assertion — which is the tripwire we want, exactly
 * like the reaction-pool mirrors next door.
 *
 * The BUTTON labels ("I did it" / "Not yet — take me back") are deliberately not
 * part of the pool: they are what the page object locates the dialog by, and the
 * whole pool is written to be answerable by those two.
 */

export interface AttestConfirmPair {
  readonly title: string
  readonly message: string
}

export const ATTEST_CONFIRMS: readonly AttestConfirmPair[] = [
  { title: 'Did you actually do it?', message: 'Lying here only cheats you.' },
  { title: 'Done this one in real life?', message: 'It runs on your word, nothing else.' },
  { title: 'Is this one actually done?', message: 'No rush, you can come back to it.' },
  { title: 'Ready to mark this done?', message: 'Only mark it if you actually did it.' },
  { title: 'Did you complete the task?', message: 'Nobody checks this but you.' },
  { title: 'Done it for real?', message: 'This counts only if you did.' },
  { title: 'Did you do it, or not yet?', message: 'Answer it the way it actually is.' },
]

const escapeForRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Matches any title in the pool, whole-string. */
export const ATTEST_CONFIRM_TITLE = new RegExp(
  `^(${ATTEST_CONFIRMS.map((p) => escapeForRegExp(p.title)).join('|')})$`,
)

// There is deliberately NO message regex: the spec asserts the message of the
// pair it just matched by TITLE, which is strictly stronger than "some pooled
// message" — it also proves the two halves were not crossed.
