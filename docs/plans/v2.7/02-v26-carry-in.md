# Plan 02 — v2.6 carry-in

**Status: DRAFT 2026-10-03. Not approved, not built.** Overview: `00-overview.md` (rule 2).

## Why

User decision 2026-10-03: **v2.6 takes no more changes.** Anything the seed research marked as a v2.6 item, and
anything v2.6 still owes, lands here. v2.6's code, gate records and seeds file stay as written, as history.

## Items

| # | Item | What | Source | Proposed gate |
|---|---|---|---|---|
| C1 | **SP5.b build** | the story-owned scenario (`effects.scenario` → `chat_metadata.scenario`), approved in v2.6 but never built. On the campaign it gives one story block instead of up to 7 card texts. C1–C5 passed ×1 | `16-spike-defers.md` §SP5; `v2.6/04-remaining-builds.md:26`; `v2.6/03-sp5-restated.md` | `npm run gates` + the SP5 recipe ×2 live; the scenario stays held while requirements are unmet (C3) |
| C2 | **Summarize / chat-vectors Repair row** | warn the author when ST's Summarize or Vector Storage chat vectors are on, because they put the whole transcript (unwitnessed scenes included) into every member's prompt. This bypasses per-member privacy | `22-sp9-witness-filter-v2.md` option A, decision 1; `v2.6/14-findings.md` T2-2 item 1 | pure `repair.ts` row + unit cases; live: toggle each extension and see the row appear and clear |
| C3 | **Warden and lore-check timeouts** | pooled over the playtest sessions, warden calls timed out 7.2% and lore-check calls 3.9%, both above J2's 1-in-50 bar. Find out whether this is the 4000 ms budget, plugin queueing or provider latency before tuning anything | `11-warden-lore-one-request.md` decision 3 (ad hoc scan of session journals) | formal `so-judge timeouts` run (was v2.6's owed R4) ×2; the floor stays 1 in 50, never retuned |
| C4 | **Separate-arm live checks owed** | the warden-lore runtime shipped as a separate call; R4, R6 and the G-L7 J8 on/off checks were owed to v2.6 plan 15 Part B | `11-warden-lore-one-request.md:22,70`; `v2.6/15-review.md:407-429` | as written in `v2.6/04-remaining-builds.md:536-540` |
| C5 | **SP6 / SP1 / SP10 runs** | never run in v2.6. SP6 → plan 19 (complication pool as the game layer's pacing tool); SP1 parked; SP10 dropped with a README note | `16-spike-defers.md` | per that plan |

Plugin-side findings the campaign cannot fix (`C:\dev\adolion-campaign\docs\FEATURE-COVERAGE.md` §Findings,
re-checked against the current plugin before building):

| # | Item | What | Source | Proposed fix |
|---|---|---|---|---|
| C6 | **Image cue leaks the internal checkpoint name** (F3) | the establishing-shot cue sends `name`, never `player_name`, so a name that says more than the scene has shown reaches the image prompt | campaign F3; `src/image/runtime.ts:91-97` (cited there) | use `player_name` when present, else a neutral "establishing shot"; spoiler-checklist row for image prompts |
| C7 | **Secret looks reach image prompts** (F6) | lore `Appearance:` lines are read from every scanned entry the scene mentions, hidden forms included | campaign F6; `src/image/lore.ts` | read appearance only from entries the player has seen fire (`extras.lore.fired`) or an authored `public` flag |
| C8 | **Illustrations are story-wide** (F4) | no per-checkpoint opt-out or look; the Saga renders one image per transition (157 checkpoints, ~26 s GPU each, text queued meanwhile) | campaign F4; `src/engine/schema.ts` | `checkpoints[].illustrate: false` + per-chapter look override; chapter boundary as the default cadence |
| C9 | **Card fallback reads as a look** (F5) | a member with no image prompt falls back to 500 chars of the card description (the narrator's instructions) | campaign F5; `src/image/prompt.ts` | skip members whose roster role is narrator/system, or require an `appearance` |
| C10 | **Curator vs the house-style meta entry** | the WI curator may propose edits to the book's house-style entry | campaign review | a per-entry curator exclusion (`stagecraft.exclude`) |
| C11 | **F1/F2/F7 still open** | judge-typed evidence cut to 160 chars (F1); `commit_evidence` per quality, not per value (F2); chain voice ignores `no_repeat` (F7) | campaign F1, F2, F7 | each needs its own small plan before building; listed so they are not lost |

v2.6 playtest findings that arrive from now on are appended as new rows here (or as their own plan when large), with
their session dir or `14-findings.md` row as the source.

## Decisions for the user

1. Build order: C2 and C1 first (small, already designed), then C3 (measurement before any fix)? **Recommended: yes.** yes
2. Do C3/C4 run on the frozen v2.6 bundle (a clean before-measurement), or only on the first v2.7 build? 2.6 is goibg to be untouched at this point, this is the first properly dev plan.
3. Does the playtest's findings stream keep going into `v2.6/14-findings.md`, with this file only citing it, or straight
   into this file? **Recommended: straight here.** v2.6 docs stay as history.  Your recommendation is accepted.

## Links

`22-sp9-witness-filter-v2.md`, `16-spike-defers.md`, `11-warden-lore-one-request.md`, `19-quests-and-game-layer.md`
(SP6).

## Gate record — C2 (2026-10-03)

**As built.** v2.6 T6-4 (`97156c2f`) already shipped a block-based row: Summarize's `1_memory` / Vector Storage's
`3_vectors` extension prompt present + a held secret (`secretsHeld`, groups only) → author-only `privacy` Repair row.
C2 adds:

- **Settings read** (`src/services/stHost/transcriptCopiers.ts`, pure, host shapes cited from ST `7c3994196`:
  `memory/index.js:36,93-97,319,418,434,541-555,566,785`, `vectors/index.js:50,52,86,795,1746-1789`,
  `extensions.js:146,513`, `script.js:485`). Summarize counts as on when not in `disabledExtensions`, not paused,
  interval > 0, position not NONE and source main/webllm (the retired Extras source is invisible to this read; its
  block, if any, is still caught by the block read). Chat vectors: `vectors.enabled_chats === true`. So the row
  appears before the copier's first block lands, not only after.
- Wired in `runtime/wiring/lore.ts` through `readCopiersWith` (`runtime/transcriptCopiers.ts`), the same reader-seam
  pattern as `globalStoryLore`; the snapshot unions both readings into `secretLeaks`.
- **Player wording**: "<Summarize and Vector Storage> share the whole chat with every character, so a character can
  learn what was kept from them. Switch them off in SillyTavern's extensions to keep secrets." Names no secret and no
  holder. The author detail says how to switch each one off.
- **Check registry seed (plan 31 design note)**: `src/runtime/checks.ts`, `Check {id, area, scope, audience,
  severity, applies?, detect}`; C2 is `transcript-copiers` (scope story, audience player, severity degrades). Findings
  reach the one Repair channel (`repairSteps` → drawer, settings, new HUD `#so-hud-setup` chip); no parallel alert
  path. The existing repair.ts steps are NOT migrated yet (follow-up, plan 31).
- Spoiler checklist rows added (`docs/plans/v2.1/test-plan.md`).

**Tests:** `src/services/stHost/transcriptCopiers.test.ts`, `src/runtime/secretLeak.test.ts` (settings reading,
reader seam, player wording, HUD alert), `src/runtime/checks.test.ts`.

**Gates:** one run covers plans 02 C2, 06, 07 E and 08 C; see the plan 06 gate record.

**Live: NOT run** (no ST lane available to this agent). Owed: a lane with a group story holding a `[hiding]` row →
switch Summarize (main source, interval > 0) and chat vectors on → row and `#so-hud-setup` appear in player mode,
clear when off; `so-ui.mts assert-player-clean` green.
