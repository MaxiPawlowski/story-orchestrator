# Plan 10 — Briefing drafting by the wizard

**Status (2026-10-03): v2.8 plan 10 (the LLM half of v2.7 plan 03 "story briefing", now v2.7 05; review A8, F13).
Decided in principle by the user (old 03 decision 1); this contract is not yet reviewed by the user; not built.**
Overview: `00-overview.md`.
**Gate tiers** (00-overview §Gate taxonomy): implementation D; acceptance CL (the wizard's authoring profile on
DeepSeek).

## What the user decided (old 03, verbatim)

Decision 1, "Fallback to `player_intro` when no `briefing` is authored?": "yes, or maybe we can create something on the
fly with the wizzard. If the player enables auto"

v2.7 05 builds everything static: the `briefing` format, validator and diagnostics (`briefing-spoiler-risk`), the
`player_intro` fallback, the modal, the Studio Briefing editor, chapter briefings, C8 onboarding and the full-saga vs
single-act indicator (old 03 decision 3). This plan adds the two places a model writes a briefing.

## Design

### D1. Author drafting in the wizard (Premise step)

- The Premise step proposes a `briefing` from the premise, the start checkpoint's player copy and the cast. It is an
  ordinary edit proposal: new mutation `setBriefing` in `studio/mutations.ts`, agent tool `setBriefing` in
  `copilot/agent/tools.ts` (`tools.test.ts` requires the pair). The author reviews it like any other card.
- Guide topic `briefing` (v2.7 05) is in the stage's `STAGE_GUIDE_TOPICS`.
- The output must pass v2.7 05's validator and the `briefing-spoiler-risk` diagnostic before the card is offered; a
  failing draft is refused locally with the diagnostic as feedback (one repair, like other staged outputs).

### D2. On-the-fly drafting for the player ("if the player enables auto")

- A player-facing install setting `display.briefingDraft` ("Write a briefing when a story has none"), **off by
  default** (rule 9: a new runtime model use ships dark until its floor passes twice). It never runs for a story that
  has an authored `briefing`.
- **When:** at the story's first activation in a chat (v2.7 05's trigger), when the story has no `briefing`. The
  `player_intro` fallback shows at once; the draft replaces it in the modal when it lands, or is offered from the
  drawer's "Story briefing" button if the modal was closed. The opener is never held for it.
- **Stored per chat**, not in the story: `extras.ui.briefingDraft = {storyId, version, sections, at}`. Never written to
  the library or the pinned story (the wizard is the only author path).
- **Route:** the wizard's authoring profile (Connection Manager profile per role, v2.7 14). No profile → no draft, the
  fallback stays; no error shown to the player.

### Model-input spoiler protection (review A8)

The player path's prompt is built from a **projection**, never from the story record:

- allowed: `player_intro`, the story title, the start checkpoint's `player_name` (never `name` or id), the v2.8 03
  `player` profile's `role`/`summary`/`assumes`, the cast members enabled at the start checkpoint with their card names
  and authored player-facing roles, `effects.scenario` text of the start checkpoint, the campaign's shared "How to
  play" text if the story carries one;
- never: other checkpoints, transitions, gates, qualities and their values, roster members muted at the start,
  lorebook entries, `description` (author copy), memory, epistemic rows.

The projection is one pure function (`briefingDraftInput(story)`), unit-tested to contain none of the forbidden
fields. The output is then checked by the same `briefing-spoiler-risk` diagnostic; a draft that trips it is discarded
and the fallback stays.

D1 (author drafting) may read the whole draft, because the author owns it; its output still passes the diagnostic,
because the briefing is player copy.

## Floors (predeclared)

- **Spoiler:** on sun-ruins and two Adolion lab stories, 10 drafts each on the player path: 0 drafts naming an
  unreached checkpoint, a muted member or a quality value (string check against the story's names), and 0 forbidden
  fields in any captured prompt.
- **Usefulness:** a second model rates each draft against the `player_intro` fallback ("which tells a new player more
  about who they are, where, with whom, and how to play?"); the draft is preferred in ≥ 70 % (rater never the user,
  rule 11).
- **Latency:** recorded (no floor); the opener never waits.

Passing twice moves D2 from dev-only to an off-by-default player setting (rule 9).

## Gates

- **D:** projection unit tests (forbidden fields absent; a story with a secret at a later checkpoint); mutation + tool
  pair (`tools.test.ts`); the per-chat store under rollback (untouched), reopen (kept) and Restart (dropped); Storybook
  for the modal's "draft arrived" state; spoiler checklist row; registry entry + Help (rule 10); `npm run gates`.
- **CL:** the floors above on the authoring profile, captured with `st-payload.mts arm --persist`.

## Links

v2.7 05 (format, modal, fallback, diagnostics, saga indicator), v2.7 14 (role picker: the authoring profile), v2.8 03
(`player` profile feeds the projection), v2.8 09 (the wizard assistant shares the projected-context rule for player
Ask mode), v2.6 plan 11 (agentic wizard tools).

## Review 2026-10-03

Applied: A8 (decision 1 gets a body, a gate and model-input spoiler protection), F13 (auto-draft opt-in, route and
spoiler gate specified; the selector indicator is v2.7 05; C8 is built only through v2.7 05), rule 9 (dark launch).
Not here: old 03 decision 3 (saga vs act indicator) is deterministic and stays in v2.7 05.
