# Plan 69 — Harvest hardening bundle

**Status: candidate, owner decision pending.** Written 2026-10-14 from the extension harvest (`61-harvest-triage-2026-10-14.md`).
Not built, not queued. One plan for the ten small hardening items that are not defects (defects B1–B19 are plan 60) and that no
feature plan owns. Each item is S, independent, one commit, and closes on its own D floor. Implementation and acceptance **D**,
except K1b (**CL**, ×1). Overview: `00-overview.md` §Rules.

## What it is

| # | Item | Source | Size |
|---|---|---|---|
| K1 | Short-term compaction accepted only if it is non-empty, shorter than its inputs and inside the token budget; otherwise keep the previous entry and journal the refusal | `docs/plans/v2.8/extension-research-2026-10-14/sillytavern-copilot-p3dra.md` P2 (H10) | S |
| K2 | Nemo Preset Extension rows in the interference probes: Nemo ≥ 6.0.9 rewrites multiword WI keys to regex, which changes what our key matcher predicts | `nemopresetext.md` P2 (H16) | S |
| K3 | Stale-tab overwrite of install-wide state: measure first (two pages on one lane), then a detect-only `degrades` check when the library or wizard sessions lose a record another page held | `creative-studio.md` P3, `worldinfo-workspace.md` P7, `writers-workbench.md` P3 (H16) | S + M |
| K4 | Last-word request rewrite: if plan 60's B8 fix (`makeLast` for the sampler overlay) still loses keys to a later listener, apply the overlay at serialization (`toJSON` on the outgoing body) | `nemopresetext.md` P1 (H16) | S, conditional |
| K5 | Guard test: no SO host lands inside `.mes_text` (with click-to-edit on, a click there opens the editor, and an edit is a rollback) | `rpg-companion.md` P6 | S |
| K6 | Test: a receipt-time reply rewrite (thought-leak repair) does not trigger a rollback or an "eventless change" journal, identity equals the post-rewrite key after render, and swipe away/back keeps the stripped text | `dynamic-response.md` P4 | S |
| K7 | Jaccard token normalisation: strip punctuation and fold quotes before the similarity split, so "Mara." and "Mara" are one token | v2.4 harvest theme 7 (vecthare) | S |
| K8 | Three missing interop fixtures: a silent `mes` rewrite with `saveChat` and no event, an out-of-band swipe append, a synthetic player-like message from another extension | v2.4 harvest T20 | S |
| K9 | Declarative withhold policy: each `INJECTION_REGISTRY` entry declares what quiet and impersonate generations receive; a guard test fails a block without one (the structural follow-up to plan 60's B10) | v2.4 harvest theme 5 | S |
| K10 | NPC replies trigger by character index, not by name (`/trigger` resolves a numeric-looking name as an index first) | v2.4 harvest theme 5 | S |

## History and evidence

- `docs/plans/v2.8/extension-research-2026-10-14/SUMMARY.md` H10, H16 and the per-repo reports named in the table.
- `docs/plans/v2.4/extension-research/SUMMARY.md` theme 7 (token normalisation for Jaccard), T20 (interop corpus), theme 5
  (per-generation-kind carry policy, `/trigger` by index).

## Current state in code

Verified on master `9e96871d`.

- **K1.** `runShortTermCompaction` (`src/runtime/coordinators/extractionCoordinator.ts:409-436`) replaces the short-term entry
  with any non-empty summary (`replaceShortTerm`), checked only by `refuseIncomplete` and ownership. A summary longer than
  `previous + window` replaces the live one.
- **K2.** `KNOWN_EXTENSIONS` (`src/services/stHost/extensionConflicts.ts:47-51`) lists Stepped Thinking (separated), Presence
  and Prompt Inspector; no Nemo row (grep `nemo` = 0, also in `src/runtime/loreKeyMatch.ts`).
- **K3.** `librarySave.ts` confirms a save at save time by read-back (`src/runtime/librarySave.ts:1-25`); nothing notices a later
  revert by another page. ST's `/api/settings/save` writes the whole file from the client body (last writer wins). The
  owner's browser and the harness CDP page on one ST are two writers (memory: shared ST browser collisions).
- **K4.** `src/services/stHost/samplerOverlay.ts:31-36` subscribes with plain `subscribeToHostEvent`; B8 (plan 60) adds
  `makeLast`.
- **K5.** `src/services/stHost/inlineMount.ts:40` mounts on `.mes_block` (outside `.mes_text`): safe today, unguarded.
- **K6.** `rewriteReplyText` (`src/services/stHost/chatMessages.ts:18-30`) re-renders through `updateMessageBlock`;
  `ChatIdentity` keys by content hash (`src/runtime/messageIdentity.ts`); the order is healed only by the render-time refresh.
  No test pins it.
- **K7.** `tokenize` (`src/memory/similarity.ts:1-3`) is lowercase + whitespace split.
- **K8.** Thirteen `test/scenarios/v24-*` shapes exist (nested quiet, foreign source, middle delete, no-op edit, message move,
  hide, same-chat reload, branch, tool-call run, …); none plants a silent rewrite, an out-of-band swipe append or a synthetic
  message.
- **K9.** Withholding is ad hoc: `WITHHOLDING_TYPES` (`src/runtime/generationLifecycle.ts:22`) plus per-coordinator clears;
  `INJECTION_REGISTRY` (`src/constants/injectionRegistry.ts:14-32`) has no per-kind field, which is how B10 happened.
- **K10.** `fireReply` runs `/trigger await=true <member name>` (`src/runtime/effectSteps.ts:66-69`); the talk path already
  addresses by index (`src/services/stHost/voiceStart.ts`).

## Options

| | Design | Cost | Risk |
|---|---|---|---|
| **A. Bundle, item by item** | each item its own commit and floor; skip any item whose floor already holds when measured | S each | none beyond each item's |
| **B. Spread into feature plans** | | same | small items wait on big plans |
| **C. Nothing** | | 0 | — |

## Recommendation

**A**, in table order, after plan 60 lands (K4 depends on B8; K1 shares the memory coordinator with B-fixes).

- **K1.** Pure `acceptCompaction({ summary, previous, window, budget })` → `{ ok } | { ok: false, reason }`; a refusal keeps the
  previous entry, journals `compaction-refused` (author view), and retries at the next due boundary.
- **K2.** A `nemo-preset` row: detected by folder and settings key; `on` when its WI key rewrite is enabled; Repair `info` row
  "Nemo rewrites multiword lorebook keys; key previews may differ" (player-safe wording). Host fact to verify first: the
  setting name at the installed Nemo version.
- **K3.** Step 1 (measurement): a lane script opens one chat in two pages, saves a library record in page A, then a settings
  save from page B; record whether A's record survives. Step 2 only if it is lost: a mirror of library ids + hashes in
  `user/files/so-library-index.json` (new `stHost/` module, `WriteResult`), compared on start; a record in the mirror but not
  in settings = `degrades` check "a story was lost to another tab" with Restore / Forget. Never a silent restore; nothing
  deleted.
- **K4.** Only if a planted later listener still overwrites overlay keys after B8: `toJSON` wrapper on the request body that
  re-applies exactly the overlay's keys, recorded in the overlay's `applied`.
- **K5, K6.** Tests only (`inlineMount` guard in `architecture.test.ts` style; a TurnBridge review test with the rewrite
  subscribed before and after TurnBridge).
- **K7.** `tokenize` strips punctuation (`\p{P}`) and folds quotes; dedup goldens re-run.
- **K8.** No-model scenarios in the closed vocabulary (new verbs added to `scenarioSchema.mts` if needed), each with a verified
  host fact cited first.
- **K9.** `InjectionSpec.carry: { quiet: "keep" | "withhold", impersonate: "keep" | "withhold" }`, required; the withhold path
  reads it instead of per-coordinator lists; `architecture.test.ts`-style guard.
- **K10.** Resolve the member to its character index (`castNames`) and trigger by index; a missing member refuses with a
  journal line.

## Predeclared floors

| # | Condition | Floor | Tier |
|---|---|---|---|
| K1a | Planted: a longer-than-inputs summary, an empty one and an over-budget one are refused; a valid one accepted; the previous entry survives every refusal | 4/4 | D |
| K1b | On 20 recorded real compaction windows, refusal rate recorded (expected low) | recorded | CL |
| K2 | Planted settings with the rewrite on/off: row present/absent | 2/2 | D |
| K3 | Step 1 recorded (survives / lost); step 2 only on lost: a planted revert raises the check and Restore brings the record back | recorded; 1/1 | D (lane, no model) |
| K4 | Planted later listener overwrites a key: the outgoing body still carries the overlay value | 1/1 | D |
| K5 | No SO-owned node inside any `.mes_text` across the inline Storybook and a no-model scenario | 0 | D |
| K6 | 0 rollbacks, 0 eventless-change journals, identity = post-rewrite key, swipe back shows stripped text (4 orders) | 4/4 | D |
| K7 | "Mara." vs "Mara" similarity 1.0; dedup goldens unchanged except declared rows | holds | D |
| K8 | Each of the three fixtures runs green ×2 on a no-model lane (product behaviour as specified in the fixture) | 3/3 ×2 | D |
| K9 | Guard: every registry entry declares `carry`; a planted entry without it fails; impersonate payload golden has no withheld block | holds | D |
| K10 | A member named "2" in a planted group gets its own reply, not member index 2's | 1/1 | D |

Floors are informational and never retuned (rule 2).

## Gates by tier

- **D:** `npm run gates` per item (one commit each); K3 step 1 on a lane with no model.
- **CL:** K1b ×1 offline over recorded windows.

## Privacy and spoiler notes

- No player-visible change except K2/K3 Repair rows (player-safe wording). No campaign content.

## Dependencies and links

- Plan 60 (B8 before K4; B3/B14 share the persistence area with K3), v2.8 35 (coverage matrix rows for K5, K6).

## Decisions for the owner

1. **One bundle plan for these items, built after plan 60?** **Recommended: yes.**
2. **K3 detection only (never an automatic restore)?** **Recommended: yes.**

## Unresolved questions

- K3 alternative: a Web Locks leader per install so a second page is read-only (`writers-workbench.md` P3). Proposed: only if
  step 1 shows the loss is common.
