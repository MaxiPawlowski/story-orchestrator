# Plan 07 — Adolion campaign: upkeep that needs no model

**Status (2026-10-03): v2.7 plan 07 (was old v2.7 05). Decided ("do all if you can"). A1 and A2 DONE (campaign
`8012a61`, `b61639f`); A3, A7, A8 and A6's deterministic half DONE (campaign `b65b5e6`, `c0927b5` on `v2.7-upkeep`;
see §Gate record); live rows (A3 lane seed, A6 badge on a lane) owed. A4, A5 and the new campaign rows (review D13)
are `v2.8/02-adolion-campaign.md`.** Repo: `C:\dev\adolion-campaign` (branch `v2.7-upkeep`, HEAD `c0927b5`).
Overview: `00-overview.md`. Plugin-side campaign findings live in v2.7 02 C6–C11 (C12, C13 also come from the campaign
lab; their model halves are v2.8 01).
**Gate tiers** (v2.7 overview §Gate taxonomy): implementation D (campaign repo, offline checks); acceptance D in v2.7
(A7's deterministic checks: `validate-stories`, `check_player_copy.py` on `briefing` text). A7's independent second-model
content review is CL and is owned by `v2.8/01-v27-carry-over.md` §A O15 (indexed in `v2.8/24-test-plan.md`), never the
user (rule 11).

No campaign story content is quoted here: rows name files, counts and acts only.

## Current state (2026-10-03 review)

- Clean tree. `build_all` produces no diff. `validate-stories` passes on all nine stories plus the tutorial example.
- `scripts/debug/adolion-fresh.pin.json` still pins `6d974d6` (review A10). HEAD is three commits ahead: one docs-only
  review write-up, then A2 and A1.
- The Saga has 157 checkpoints, 179 qualities, 269 transitions, 125 roster members, 16 lorebooks and 12 chapters. Each act
  has 12–27 checkpoints and 7–40 members.
- Sprites: 2889/2889 (denominator: see v2.8 02 D13e).
- Every v2.6 session finding on the campaign side is fixed. The review's 9 MEDIUM findings were fixed in `38ad45c`.
- **Plugin features not used:** `display` / any player-visible quality, per-checkpoint `reasoning`, authored
  `scaffolding`, `stop_on_player`, `allow_silence`, personas. The 13 A3 stubs rely on background generation.

## Steps

| # | Step | Why | Effort | Depends on | State |
|---|---|---|---|---|---|
| A1 | **Refresh `docs/FEATURE-COVERAGE.md` and `lab/README.md`** to the current plugin: reference commit, judge uses on by default, per-lab verdicts from `v2.6/03-*-restated.md`, a status column for F1–F8 / C1–C14 | the campaign's map was 487 plugin commits stale | S | none | **done** `8012a61` (refreshed to plugin `b2be37ab`) |
| A2 | **Make `check_all.sh` portable**: working-python detection, `--fast` (skip the 8+ min harness), delete the stray `build/story/adolion-adventurer.v6.json` | the check could not run here | S | none | **done** `b61639f` |
| A3 | **Move the pin once**, in the first v2.7 build step (step 0b), and re-freeze story-orchestrator's `test:debug` integration runs in the same change | `test:debug` went red the last time the pin moved alone (`v2.6/15-review.md`); moving it during the playtest re-seeds every lane | S | v2.7 step 0 | **done** pin `c0927b5` (was `6d974d6`); lane seed owed |
| A8 | **Harness test vs current plugin types:** `tests/adolion.local.test.ts` fails `typecheck:test` on the plugin (12× `activeCheckpoint` possibly undefined since T6-1 typed it `Checkpoint \| undefined`); a left-over copy in the plugin turned master's gates red on 2026-10-03 | fix with guards in the campaign test; same change as A3 | S | none | **done** `c0927b5` |
| A7 | **Story briefings:** one `briefing` per story plus Saga chapter briefings, built from the authored player copy and scenario framing, checked by `check_player_copy.py` (spoiler terms); content review by an independent model is v2.8 01 O15 (CL), not a v2.7 gate | the opening message lacks context (user, 2026-10-03) | M | v2.7 05 format | **done** `b65b5e6` (content review: v2.8 01 O15) |
| A6 | **Badge check:** the nine `groupStories` bindings (`build/st-groups.js`) show the v2.7 06 badge, and the saga/act kind is right for each (Sol split item 7) | first real consumer of v2.7 06 | S | v2.7 06 built | deterministic half done; finding: all nine read `saga` (§Gate record); live owed |
| A4 | lab data for v2.8 measurements | | | | → v2.8 02 |
| A5 | playtest fix round | | | | → v2.8 02 |

## Pilots

All pilots are v2.8 plans now (v2.8 04, 18, 20, 19, 03, 07, 08); the table lives in `v2.8/02-adolion-campaign.md`
§Pilots. In v2.7 the campaign is the live consumer of v2.7 05 (A7) and v2.7 06 (A6).

## Decisions for the user

1. Do A1 and A2 now (campaign-only, no plugin change)? **Recommended: yes.** do all if you can, i love those proposings
2. Pin move at the start of the v2.7 build, not before? **Recommended: yes.** yes
3. Which act pilots plan 19, and which plan 18? **Recommended: the academy act for 19, the 7-member act for 18.** sure

(Decision 3's old numbers: 19 = v2.8 18 quests, 18 = v2.8 20 character life; it is held in v2.8 02.)

## Gates

- Campaign repo: `check_all.sh --fast` green after each row; `validate-stories` on all nine plus the tutorial example;
  `check_player_copy.py` extended to `briefing` text (A7).
- A3 + A8: on the plugin, `npm run gates` (incl. `typecheck:test`, `test:debug`) green with the new pin; one
  `adolion-fresh seed` + `check` on a lane (inventory diff accepted with a reason, `accept-baseline`).
- A6: the v2.7 06 live check on an adolion-fresh lane (D).

## Links

v2.7 05 (briefing format), v2.7 06 (badges, saga/act kind), v2.7 02 (C6–C13 campaign findings), v2.8 02 (A4, A5,
D13a–e, pilots), v2.8 01 §F (lab ratings via Astra).

## Review 2026-10-03

Applied: A10 (pin still `6d974d6`; moved in step 0b with A8), the Claude-A note on the header (C12/C13 also come from the
campaign), Sol split item 7 (A6 badge validation in v2.7), D13 (new campaign rows go to v2.8 02), A1/A2 recorded as done,
B4 (A7 content reviewed by a second model), B12 (references).

Round 3 (Sol): R3-02 applied.

## Gate record

**2026-10-03, plugin worktree `agent-a6f794593db33799e` off master `795948c2`; campaign branch `v2.7-upkeep`
(`8012a61` → `b65b5e6` → `c0927b5`, not merged, not pushed).** No lane seeded, ST not started, nothing staged (the
user is playtesting). No campaign content is quoted here.

### As built

- **A8** (campaign `c0927b5`): `tests/adolion.local.test.ts` reads the active checkpoint through one guard helper (12
  sites; throws when the engine has none) and imports `@runtime/storyScenario` (the SP5 module left `runtime/spikes/`).
  `typecheck:test` on the plugin with the file copied into `src/engine/`: 0 errors.
- **A7** (campaign `b65b5e6`): `scripts/campaign/briefings.py` holds the player copy; `dsl.build_story` writes
  `briefing` on each act story, `campaign/assemble.py` writes the Saga's and one `chapters[].briefing` per act chapter
  (8; the 4 board interludes have none). Each story briefing: 4–5 sections incl. a shared "How to play", a `tone` line,
  `start_label`. Built from each story's `player_intro` and its opening checkpoint's player copy only. All nine story
  versions bumped by one. `check_player_copy.py` extended: every story needs a `briefing`, every Saga act chapter
  needs one, no macro or quality key, the story briefing names no act SPOILERS term (as the intro), a chapter briefing
  names a term only when its reveal checkpoint dominates every entry into the chapter. Negative controls (scratch, not
  committed): a spoiler term in a story briefing, a term revealed inside the chapter in a chapter briefing, a missing
  story briefing and a missing act-chapter briefing are each reported; a term revealed in an earlier act passes in a
  later chapter's briefing.
  - Plugin diagnostics over the nine built stories (bundled `parseStoryV2` + `runDiagnostics` from this worktree):
    first draft raised 10 `briefing-spoiler-risk` (common words that are story enum values, two later checkpoint
    names, a muted member's alias); text reworded, final **0** `briefing-spoiler-risk`, 0 warnings/errors.
    `composeBriefing` source `authored` on all nine; `composeChapterBriefing` resolves 8 on the Saga.
- **A3**: `scripts/debug/adolion-fresh.pin.json` `6d974d6873e9bcfb0e2c491bc7d166a25b540432` (branch `master`) →
  `c0927b523c3cbe171406aaf7260adb2f99bb6076` (branch `v2.7-upkeep`). Re-frozen in the same change:
  `ST_ROOT=… node scripts/debug/so-session.mts index` (git reads only) rewrote `test/sessions/adolion-stories.json`,
  `test/sessions/charters.json` and `docs/plans/v2.6/14-cards.md` (commit field only; graph, roster and features
  unchanged); `test/measurements/v2.6-09/runs.json` `campaign.commit` moved to the new pin (its three frozen route
  blobs are byte-identical between the two commits, so their sha256 stand).
- **A6 (deterministic half)**: `storyKind` (`engine/briefing.ts`, used by `runtime/playsIndex.ts` for the badge) over
  the nine `build/st-groups.js` stories: **all nine read `saga`** (the Saga has 12 chapters; every act story has 2 or
  3 chapters, because each act is split into chapters for sealing). The tutorial example (0 chapters) reads `story`.
  **Finding:** the plan 05 rule (≥ 2 chapters = saga) does not tell the full campaign from a single act on this
  campaign, so the badge colour will not carry the distinction the user asked for (plan 05 decision 3). Not fixed here
  (product rule, owned by v2.7 05/06); needs a rule change (e.g. an authored kind, or interludes / cross-act chapters)
  or a decision to accept it. **Resolved 2026-10-03:** the authored `kind` field replaced the chapter rule (plan 05
  §Saga vs act indicator); the campaign marks only the Saga `kind: "saga"`.

### Gates

- Plugin: `ST_ROOT=C:/dev/SillyTavern-MainBranch npm run gates -- --no-storybook`: **all green** (typecheck,
  typecheck:test, lint, test 6348 passed / 1 skipped, build, build:dev, test:debug 961 pass, debug:typecheck,
  test:release, test:replay, test:plugin); `test-storybook:ci` SKIPPED (`--no-storybook`; no UI change).
- Campaign: `SO_PLUGIN=<this worktree> sh scripts/check_all.sh --fast` ALL GREEN (build_all, validate-stories nine +
  tutorial clean, check-scope, check_cast, check_triggers, check_aliases, check_guidance, check_player_copy 9 stories /
  307 checkpoints / 0 problems, check_backgrounds, check_cards, check_lab 0 of 9 failing); then the full
  `check_all.sh` incl. the jest harness on this worktree: ALL GREEN.

### Owed

- A3 live: one `adolion-fresh seed` + `check` on a lane at the new pin, inventory drift accepted with a reason
  (`accept-baseline`); story versions moved by one, briefings added.
- A6 live: the nine bound groups show the badge on an adolion-fresh lane (plus the kind finding above).
- A7 content review by an independent model: v2.8 01 O15 (CL).
- Campaign branch `v2.7-upkeep` is not merged to its main branch; the pin names a commit on that branch.
