# Plan 10 — Briefing drafting by the wizard

**Status (2026-10-10): BUILT on branch `v2.8-briefing` (owner approved 2026-10-10), see §Gate record; CL floors not run.**
**Earlier status (2026-10-03): v2.8 plan 10 (the LLM half of v2.7 plan 03 "story briefing", now v2.7 05; review A8, F13).
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

## Gate record (2026-10-10, branch `v2.8-briefing`)

Built as written except where noted; every feature on by default (owner rule 2026-10-10: private plugin, floors
informational, so rule 9's dark launch does not apply). Builds on plan 09 (recipes, `readGuide`, the DeepSeek default for
the authoring role).

**D1, author drafting.** `setBriefing` is now a `ProposalOp` (`copilot/types.ts`, `parseOps.ts` reads it with the story's
own `readBriefing`, `proposal.ts` applies it through `mutations.setBriefing`) and an edit tool (`agent/tools.ts`; its
`MUTATIONS_WITHOUT_A_TOOL` excuse is gone). Staged wizard: allowed in the Premise (`qualities`) and Setup (`effects`)
stages, the `briefing` guide topic is in both stage guides, both stage instructions mention it. A draft that trips
`briefing-spoiler-risk` (shared `briefingSpoilerNames`, `studio/briefingDiagnostics.ts`) is blocking in
`validateProposal`, so the stage spends its one repair on it, and is refused in the agent loop's `editProblem` with the
named terms and the diagnostic code. New recipe `briefing` (readGuide → readCheckpoint → readStory → setBriefing, verify,
traps cued from the guide). Tests: `copilot/agent/setBriefing.test.ts`.

**D2, per-chat player draft.** Install setting `display.briefingDraft` ("Write a briefing when a story has none",
`#so-briefing-draft`, Playing/Display, **on**). Lazy `runtime/briefingDraftHost.ts` (started from `wiring/lore.ts` like
the card overlay) asks once per chat + story + hash while the story's briefing is pending and the story has no authored
one. Prompt from `runtime/briefingDraft.ts#briefingDraftInput` only: title, `player_intro` (never `description`), the start
checkpoint's `player_name` and `effects.scenario`, `player.role/summary/assumes`, the card names of the cast the start leaves
on stage. Route: role `authoring`, new pass `briefing` (debug global `storyOrchestratorDebugBriefingResponse`). The reply is
checked by `readBriefing` and `briefingSpoilerNames`; a failing draft is discarded with a journal line and the
`player_intro` fallback stays; a failed call is silent. Stored per chat in `extras.briefing.draft = {storyId, hash,
sections, at}`, shown only while the pinned story's hash matches; the open modal swaps to it when it lands, with the note
"Written for this chat from the story's opening…" (`[data-so="briefing-drafted"]`). Rollback leaves it, reopen keeps it,
Restart drops it, a story update makes it stale. Census row `briefingDraftHost.ts#draftBriefing` checked.
Tests: `runtime/briefingDraft.test.ts` (projection forbidden-field list + description control, discard cases, store under
rollback/reopen/Restart/update, chat switch mid-call, failed call, setting off, authored briefing, once per key, payload
invariance).

Deviations: the draft lives in `extras.briefing.draft`, not `extras.ui.briefingDraft` (`extras.ui` is rebuilt from the
install settings and stripped before persisting); "version" is the record hash (stories carry no version since
2026-10-07); latency goes to the journal detail, not the record (main bundle budget); the projection carries card names
only, not roster roles (`roster[].role` is author copy and can spoil; there is no player-facing role field); there is no
"How to play" story field, so the prompt states the generic how-to-play line itself; the session baseline sets
`briefingDraft: false` beside `briefing: false`.

**Owner decisions to confirm (taken as the plan recommends, or forced by the code):**
1. D2 on by default (owner rule), not dark until the floors pass twice.
2. Staged wizard: the briefing may be proposed in Premise and in Setup (the plan said Premise; at Premise the draft often
   has no start checkpoint or cast yet, so Setup is where it can be specific).
3. Projection without roster roles (above).
4. A draft is discarded on any spoiler term, including a later checkpoint name in common words: conservative.

Commands and results (final tree):
- `npm run gates -- --no-storybook --jobs 2`: **all green in 196.6 s** (typecheck, typecheck:test, debug:typecheck, test,
  build, test:replay, lint, test:plugin, test:release, test:debug). `test-storybook:ci` SKIPPED (worktree, `--no-storybook`).
  Earlier runs were red and fixed: authoring calibration goldens (recorded `allowedKinds` predate `setBriefing`: the replay
  now drops kinds added after recording, `KINDS_ADDED_AFTER_RECORDING`), call-site role census, errorCopy inventory, session
  baseline, arrival golden (new scenario), a cast through unknown, and the main bundle budget.
- Main entry `dist/index.js` **1,249,926 B** (budget 1,250,000; 74 B headroom). The drafted-note copy moved to the lazy
  `features/briefingDraftCopy.ts` and the setting help was shortened to fit.
- Storybook to run on master: `Briefing/BriefingModal` (BriefingOnly, new DraftedBriefing), `Briefing/BriefingHost` (new
  DraftReplacesTheIntroInTheOpenModal, OpensOnActivation), `Settings/*` panels that render `#so-briefing-draft` (PlayGroups
  Display group).
- No-model live check: lane 50 (offline seed, private ST code copy `C:\dev\so-lanes\agent-st-briefing` with the branch
  staged, nothing staged into the shared ST slot), `test/scenarios/v28-10-briefing-draft.json --sandbox` ×2 PASS: planted
  draft lands as `source: draft`, the drawer's Story briefing opens it with the drafted note and no spoiler, 
  `assert-player-clean` 0 findings, and a planted spoiling draft after Restart is discarded (intro stays). Plumbing only.
- Not run: the CL floors (spoiler ×10 per story on sun-ruins + two Adolion lab stories, usefulness rating, latency) on the
  DeepSeek authoring route; no real-model draft was made.

Adolion: the campaign's stories should author their own `briefing` (the per-chat draft is a fallback that sees only the
opening); the briefing recipe gives a campaign author a reviewed first draft from the opening scene.
