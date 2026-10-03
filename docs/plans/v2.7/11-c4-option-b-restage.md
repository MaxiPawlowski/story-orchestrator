# Plan 09 — C4 option (b): re-stage the target's path after a jump

**Status: SEED from v2.6, not approved.** Source: `docs/plans/v2.6/v2.7-seeds.md` row "C4 option (b)". Overview: `00-overview.md`.

Name clash: this is v2.6 plan 04's design call **C4** (`/cp activate` staging). It is not v2.3 plan 07's C4 ("absent agency
= the defaults"), which v2.4 D6 cites. Plan 23 uses the other one.

## What it is (plain words, 3–6 lines)

- A **jump** moves the story straight to a checkpoint without playing the ones in between.
- A checkpoint's staging (Author's Note, background, scenario, cast, World Info) is normally the sum of what the
  played path applied.
- v2.6 ships option (c): a jump **releases** the source's staging and applies **the target's own effects only**.
- Option (b) would instead replay every effect along an authored path to the target, so the target plays as if
  reached normally.
- The seed: revisit (b) only if sessions show that unstaged jumps hurt.

## History and evidence

| When | What | Where |
|---|---|---|
| 2026-09-30 | Design call written. Before it, a jump kept the **source's** staging (a delta apply): a start-scene scenario framed a later act; the start scene's gated World Info stayed on. Measured on the campaign data: a jump from the start reaches 132 of 157 checkpoints with the start's scenario still set. Three options: (a) debug-only, (b) path-replay every effect, (c) release then apply. Recommended (c): reuses the ledger's compare-and-set restore and `worldInfoPlan`'s release; "never invents a path". (b)'s cost: needs a canonical path to a checkpoint the chat never played; branches make it ambiguous | `docs/plans/v2.6/04-remaining-builds.md` §"C4 — `/cp activate` applies only the target's effects" (l.188-210) |
| 2026-09-30 | User approved (c) with the C3/C12/C13 calls | same file l.251 |
| 2026-09-30 | Built. `releaseStaging` restores applied `an`, `background`, `extension` (scenario) ledger rows, then (requirements ready) releases the story's whole gated World Info set; target applied with `stagedPath`. Cast is **not** released. Jest `effectsStaging.review.test.ts` C4 ×4, `jumpRelease.review.test.ts`; 13 hand mutants killed | same file §Gate record C3/C4/C12/C13 (l.402-441) |
| 2026-10-01 | Review fix CR-E2: staging survived only inside the boundary-log window; now `EngineState.stagedFrom` (path index of the last jump), restored by hydrate/rollback/step-back. CR-E3: every jump entry point asks the chapter-jump confirm | `docs/plans/v2.6/15-review.md:56-57` |
| 2026-10-01 | SP5 (story-owned scenario) live: a jump to a checkpoint that authors no scenario leaves the scenario **empty** (pre-story value), as (c) designs. PASS ×1 on the C1–C5 legs with (c) assumed. Caveat recorded: "a jump target with no scenario of its own plays unstaged" | `docs/plans/v2.5/09-sp5-spike-report.md:99-123, :152`; `docs/plans/v2.6/03-sp5-restated.md:81-84` |
| 2026-10-01 | Session T1-5 (Claude, harness `start` at a mid-story checkpoint by jump): two members that skipped checkpoints would have enabled stayed disabled. Fixed in the **harness**, not the product: cards may declare `setup.members`, set with `/member-enable`/`/member-disable` and read back | `docs/plans/v2.6/14-findings.md:247`; `test/sessions/T1/SUMMARY.md:165`; tests `scripts/debug/lib/sessionCast.test.mts` |
| 2026-10-02 | Review pack item 6 put "keep (c) or revisit (b)" to the user; Claude recommended keep (c) | `docs/plans/v2.6/14-review-pack.md:43, :235-262` |

Verdict so far: the only observed harm (T1-5) was a test-harness start, not play. No session recorded a jump hurting
a player. The user's answer to review item 6 is **not recorded** in the repo (not determined).

## Why it was deferred

The user chose (c) (04 l.251). (b) needs a path the chat never played, and with branches the "right" path is
ambiguous (04 l.208). Nothing measured asked for it.

## Current state in code

- `RuntimeManager.activateCheckpoint` (`src/runtime/runtimeManager.ts:295-310`): chapter-jump confirm →
  `effects.releaseStaging` at the source → `engine.activateCheckpoint` → `applyActive("activate")`.
- `EffectsApplier.releaseStaging` (`src/runtime/effectsApplier.ts:342-347`); released kinds
  `JUMP_RELEASED = an, background, extension` (`effectsApplier.ts:41`). Cast stays as the source left it; preset is a
  per-checkpoint overlay and re-arms from the target.
- `stagedPath(path, stagedFrom)` (`src/runtime/worldInfoGates.ts:45-48`): the path from the last jump on; used by load,
  hydrate, rollback (`runtimeManager.ts:525, :606`) and the scan-mode lore view (`src/runtime/wiring/lore.ts:34`).
  `stagedFrom` lives in `EngineState` (`src/engine/engine.ts:36, :309`).
- **Who can jump, all author-only:** `/cp activate` (`src/runtime/slashCommands.ts:63-67`, author view only since
  T3-4), the driver panel's Advance (`src/index.tsx:239`), and the agency-recovery "take alternate" button
  (`src/components/drawer/tabs/SchedulerTab.tsx:79`). Note the last one: an authored `agency.alternate` reached through
  the refusal recovery is a jump, so it also plays with the target's own staging only.
- No flag; (c) is the only behaviour.

## Options

| Option | Design | Cost | Risk | Needs |
|---|---|---|---|---|
| **A. Keep (c); drop the seed** | nothing | 0 | a jump target that relies on inherited staging plays unstaged (never wrong staging) | — |
| **B. Full path replay (the seed)** | on a jump, pick a path start→target (shortest by transitions, ties by priority) and fold every effect kind along it (AN, background, scenario, preset, cast, WI) | M–L: path chooser, a fold per effect kind, cast writes along the path, tests per kind; `stagedFrom` semantics change (WI would replay the chosen path, not start at the jump) | invents a history; on branching graphs picks one branch's staging; cast writes touch the shared group | a rule for ambiguous paths; evidence the campaign's targets depend on inheritance |
| **C. Author picks the path** | the jump UI lists predecessor paths (or "target alone") and the author chooses; replay that path | M + UI | author friction on every jump; still writes cast | Studio/drawer UI, rule-7 is not touched (author-only) |
| **D. Cast-only replay** | keep (c) for AN/background/scenario/WI; replay only `cast_changes` along the shortest path | S–M | same ambiguity, smaller blast radius; the only observed harm was cast | shortest-path helper; ledgered cast writes exist |
| **E. Report, don't replay** | after a jump, the author view lists the staging the skipped checkpoints would have applied ("not applied: enable X, background Y") with one-click apply per row | S | none to play; author does the work | an author-view panel row; reads the graph only |

## Recommendation

**A (keep (c)), with E as the cheap add-on if the user wants a safety net.** Players never jump; every entry point
is author-only (§Current state). The only recorded harm was a harness start, already fixed in the harness. (b) adds an
invented history and shared-group writes to fix a case nobody has hit in play. E gives the author the missing
information without the product guessing.

## Decisions for the user

1. Keep (c) as the jump semantics? **Recommended: yes.** yes
2. Drop this seed (A), or build the report-only panel (E)? **Recommended: A now; E only if an author session asks for it.** what u recommend, lets defer to the next version
3. Should the agency-recovery "take alternate" button (a jump) also follow (c), or should taking an authored alternate
   inherit the source's staging like an ordinary transition? **Recommended: keep (c) for it too; revisit with plan 23's
   session evidence, since alternates are where a player-facing story most often jumps.** (Not measured: how many
   campaign checkpoints author `agency.alternate`.)
4. If (b) is ever built, how is an ambiguous path resolved? **Recommended: don't build; if forced, C (author picks).**

## Floor and measurement before building

Predeclared, before any (b)/(C)/(D) build:
- **Trigger:** at least 2 sessions (user or Claude, player or author) where a jump target played wrongly **because**
  inherited staging was missing, each with a journal line and the checkpoint's missing effect named. Harness starts do
  not count (they have `setup.members`).
- **Data to collect first (no model):** over the campaign data and `test/fixtures/*.story.json`, count checkpoints that
  author no AN/background/scenario/cast of their own and inherit one from every predecessor (needs-inheritance), and
  how many of those have ≥2 predecessor paths that would stage differently (ambiguous). Not determined today.
- **Floor for (b)/(D):** on that census, the chosen path stages the target identically to the played path in ≥ 95 % of
  needs-inheritance checkpoints reached in recorded sessions; 0 cast writes outside the story's roster.

## Gates (per repo CLAUDE.md tiers)

- A: none (docs only).
- E: runtime/UI tier: `npm run gates` (jest for the pure "skipped staging" reader, Storybook play for the panel row)
  + live gate (`so-scenario` jump on a fixture story, panel lists the skipped effects; `so-ui assert-player-clean`).
- B/C/D: runtime tier: `npm run gates`; jest per effect kind (jump == played path on a linear fixture; ambiguity rule on
  a branching one); `rollback ≡ replay` across a jump; live no-LLM scenario on a group (cast restored after cleanup,
  per debug-scripts rules).

## Links

04 story presence/plays index · 19 quests/game layer · 18 character life · 25 new game plus · 08 SP2 · 22 SP9 · 16 spike
defers (SP5's caveat) · 20 J6d shadow record · 14 J7 judge ideas · 13 B10 CLI judge · 12 curator create op · 11 warden-lore
one request · 21 cue+scene read merge · **09 this** · 07 commitment double negatives · 23 D6/T22 revisits (agency
alternates) · 10 model choice · 06 thinking per story · 15 open-source Jev alternative
