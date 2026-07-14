/**
 * Reaction-line matchers for the step players.
 *
 * The mascot was removed with the character art, so the reaction is no longer
 * observable as an asset path or an emotion attribute — the LINE is the whole
 * signal now, and the line is what the user actually reads. These patterns are
 * mirrors of the pools in `frontend/src/lib/curriculum/reactions.ts`; the specs
 * assert against them so a wrong answer can never quietly start celebrating (or
 * start shaming).
 *
 * Each pattern covers EVERY line in its pool. When a pool gains a line, extend
 * the pattern here — a spec failing with "expected the support pool" is exactly
 * the tripwire we want, not noise to be silenced.
 */

/** `lesson_correct` + `mission_pass` — the celebration pools. */
export const CELEBRATES =
  /(got it|nailed it|exactly right|that's the one|spot on|love it|you did it|real progress|done and dusted|pulled it off|a real win|proud of you)/i

/** `lesson_wrong` + `quiz_fail` + `mission_fail` — the supportive pools. */
export const SUPPORTS =
  /(almost|not quite|good try|no worries|close|so close|nearly there|good effort|not there yet|give it another go)/i

/** Language that must NEVER reach the user on a wrong answer. */
export const SHAME_PATTERN =
  /\b(wrong|stupid|idiot|dumb|failure|failed|loser|useless|terrible|pathetic)\b/i
