# Plan 02 — v2.6 carry-in

**Status: DRAFT 2026-10-03. Not approved, not built.** Overview: `00-overview.md` (rule 2).

## Why

User decision 2026-10-03: **v2.6 takes no more changes.** Anything the seed research marked as a v2.6 item, and
anything v2.6 still owes, lands here. v2.6's code, gate records and seeds file stay as written, as history.

## Items

| # | Item | What | Source | Proposed gate |
|---|---|---|---|---|
| C1 | **SP5.b build** | the story-owned scenario (`effects.scenario` → `chat_metadata.scenario`), approved in v2.6 but never built. On the campaign it gives one story block instead of up to 7 card texts. C1–C5 passed ×1 | `16a-sp5-story-scenario.md` (design); `v2.6/04-remaining-builds.md:26`; `v2.6/03-sp5-restated.md` | triage the T7 red first; `npm run gates` + the SP5 recipe ×2 live; the scenario stays held while requirements are unmet (C3) |
| C2 | **Summarize / chat-vectors Repair row** | warn the author when ST's Summarize or Vector Storage chat vectors are on, because they put the whole transcript (unwitnessed scenes included) into every member's prompt. This bypasses per-member privacy | `22-sp9-witness-filter-v2.md` option A, decision 1; `v2.6/14-findings.md` T2-2 item 1 | pure `repair.ts` row + unit cases; live: toggle each extension and see the row appear and clear |
| C3 | **Warden and lore-check timeouts** | pooled over the playtest sessions, warden calls timed out 7.2% and lore-check calls 3.9%, both above J2's 1-in-50 bar. Find out whether this is the 4000 ms budget, plugin queueing or provider latency before tuning anything | `11-warden-lore-one-request.md` decision 3 (ad hoc scan of session journals) | formal `so-judge timeouts` run (was v2.6's owed R4) ×2; the floor stays 1 in 50, never retuned |
| C4 | **Separate-arm live checks owed** | the warden-lore runtime shipped as a separate call; R4, R6 and the G-L7 J8 on/off checks were owed to v2.6 plan 15 Part B | `11-warden-lore-one-request.md:22,70`; `v2.6/15-review.md:407-429` | as written in `v2.6/04-remaining-builds.md:536-540` |
| C5 | **SP6 / SP1 / SP10 runs** | never run in v2.6. SP6 measured, then built in plan 19 on PASS (`16b-sp6-complication-pool.md`); SP1 parked with a swipe-back counter (`16c-sp1-swipe-back-cache.md`); SP10 README note + probe removed (`16d-sp10-tool-call-turns.md`) | `16-spike-defers.md` (index) | per each file |

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

`22-sp9-witness-filter-v2.md`, `16-spike-defers.md` (index; `16a`–`16d`), `11-warden-lore-one-request.md`, `19-quests-and-game-layer.md`
(SP6).
