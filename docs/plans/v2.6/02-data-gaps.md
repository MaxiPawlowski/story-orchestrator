# Plan 02 — Data gaps: where Adolion falls short, and what to build

**Status: step 0 built and gated, step 1 audit committed (`02-audit.md`), 2026-09-30.** Nothing else built; D1 is a measurement for the lead to schedule (overview rule 13).

The user's request (2026-09-30): where the campaign does not cover a measurement, create more data. The lab already
covers SP1–SP9 and four judge uses. Each lab README ends with "What it cannot measure", and those sections are this
plan's starting list.

## Step 0: `adolion-fresh` (overview rule 14)

- Script it: seed a lane fresh, run the campaign installer at the pinned commit, take a `so-assets` baseline, and select
  the Adolion lorebooks the stories require.
- Then run an inventory check against the campaign manifest: counts of stories, cards, books and groups, and
  `requirements.ready` on every story.
- Output: `scripts/debug/adolion-fresh.mts seed <lane>` plus its node:test.
- Gate: two consecutive seeds produce identical inventories, and a planted missing book fails the check.

## Step 1: audit (before any data is built)

The audit is written to `v2.6/02-audit.md` as one table. Each row is one measurement from v2.6 plans 01, 03, 04, 06, 07 and 10, with these columns:
- the data it needs;
- whether Adolion covers it: yes, partial or no, citing the lab or campaign path;
- the toy fallback, if any;
- the gap;
- the smallest artifact that closes the gap.

A row is closed only by a citation, never by a claim.

## Known gaps (from the lab READMEs and the v2.5 gate records; the audit confirms or removes each)

| # | Gap | Who needs it | Candidate artifact |
|---|---|---|---|
| D1 | **No real Adolion play corpus.** Every lab row is authored or seeded, and no archived lane run of the real stories exists. | SP3 A1 (natural alias rate), J6a intent mining, SP1 swipe rate, J2 (≥ 100 warden calls), v2.5 plan 04 K0 cosine column, soak, 07 Q-M runs, 06 intent-lapse K | **A machine playthrough corpus.** Drive `adolion-adventurer`, `adolion-academy` and the Saga on lanes with a scripted player that runs a per-act turn list the campaign already has (`tests/routes-*.json`, `make_saga_routes.py`). Judge uses stay on. Archive the chat, journal, audits and payload captures under `test/corpora/adolion/<story>/<run>/`, outside `public/` once A2 lands. Target ≥ 300 player turns per story. |
| D2 | **Needles on the real story.** SP4's fixture imports one open checkpoint, so nothing transitions and no lore loads. | SP4 T3, v2.5 plan 05 memory rows | Needles planted in a D1 route of `adolion-academy`, with `needed_by` read by a live step at the checkpoint that uses the fact |
| D3 | **Tool-call turns.** Nothing exists for SP10. | SP10 Q1–Q3 | 20 turns with ST function-calling on a CC profile, recorded both folded and unfolded. Built: W3 re-evaluates all ten spikes. |
| D4 | **Spanish slices** are missing for SP8 W3 and SP9. The judge rule wants ≥ 1 Spanish slice, and decision C1 is still open. | SP8, SP9, v2.5 plan 05 F3 | 8 Spanish W3 lines on the Chronicle; a Spanish variant of the Nightriver witness transcript |
| D5 | **Memory contradictions on Adolion.** v2.5 plan 04's N1/J1 ran on toy seeds, and J1 Phase A met no floor. | v2.5 plan 04 N1, K0, J1 | ≥ 40 contradiction pairs drawn from the Chronicle and card facts (polarity, negation, low-overlap), 8 in Spanish, each labelled |
| D6 | **Ledger tier.** The F2 ledger scored 0.5 against a 0.8 floor on toy fixtures, and 14 fixtures' facts checks are vacuous (C2). | v2.5 plan 05 F2 | Extractor fixtures built from D1 transcripts where Adolion's ledger qualities change (debts, wounds, pacts), with real phrases in `mustContain` |
| D7 | **Lore contradictions.** Nothing exists for v2.5 plan 08 L7. | L7 (v2.6 04) | Chronicle rows vs player-stated contradictions, drawn from D1 |
| D8 | **Warden volume.** J2 needs ≥ 100 warden calls. | v2.5 plan 06 J2 | Counted from D1 once the warden is on (a judge default under overview rule 5) |
| D9 | **Features added after `544975fb`.** The image director cue, sprites, openings, the commit guard, chained voices and the GPU broker have no measured cadence (plans 15–19 name these "unmeasured"). | v2.6 01 rows for 14–19, v2.6 09 | D1 runs carry the image/sprite/voice switches on, with the cadence and cue landing read from the journal |
| D10 | **Lore select at scale.** A 263-entry book costs 5 judge requests per turn (C11), and there is no live token measurement. | C11 (v2.6 04) | the token column from D1 payload captures |
| D11 | **Structural limits** that are design questions, not data: C12 (onEnter replies bury the gating reply), C13 (guidance secrets reach every drafted member), and the swipe rate under real play. | SP1, SP2, SP9 | none; these go to v2.6 04 as design calls |

## Rules

- **Data lives in the campaign when it is story content**, and here when it is a plugin fixture. The formats are the
  plugin's own (the lab's convention). Every set has a `check.py` or jest case that fails on drift from `build/`.
- **Generated data is labelled as generated.** A model-written player line is marked, and a measurement that needs
  human judgement keeps the lab's "one labeller" note.
- **D1 is the expensive item.** Size it once the audit has run, not before. A lane at the current backend speed does
  roughly 100 turns an hour, so D1 at its target size is about 9–10 lane-hours.

## Gate

The audit is committed. Each confirmed gap either has an artifact, with its check green in both `check_all.sh` and the
plugin's gates, or a signed "not built" line with the reason.

## Resolved 2026-09-30 (review)

| Question | Answer | Why |
|---|---|---|
| Who plays D1: scripted routes or an LLM player? | **Both, kept as separate sets.** The scored corpus is the route lists (`tests/routes-*.json`, `make_saga_routes.py`). One LLM-player run per story is a labelled extra set, never pooled with the routes. | The routes are reproducible, which a ×2 needs. The LLM player finds paths nobody scripted, which plan 09 and SP1's swipe rate want. Pooling them would hide which kind of play a number came from. |
| Where does corpus text live? | **In the campaign repo** (`adolion-campaign/corpora/<story>/<run>/`), with a hash manifest. The plugin repo holds only fixtures derived from it. | It is chat text, and v2.5 plan 12 P3 keeps chat text out of anything ST serves. The campaign repo is outside `public/`, and the corpus is story content (rule 2 of this plan). |

## Unresolved questions

None. The D1 size gets fixed after the audit, and the user is not asked for it.

## Gate record

### 2026-09-30: step 0 (`adolion-fresh`) and step 1 (audit)

**Built.**
- `scripts/debug/adolion-fresh.mts` has three commands:
  - `seed <lane> [--commit] [--headed] [--stop]`
  - `check <lane> [--drop-book <name>]`
  - `diff <a> <b>`
- The pure half is in `scripts/debug/lib/adolionFresh.mts`: the manifest from the pinned build, the strip plan, the inventory, the check and the diff.
- Its node:test is `scripts/debug/lib/adolionFresh.test.mts`, with 8 cases.
- The pin is `scripts/debug/adolion-fresh.pin.json`: campaign commit `5e2974bdfa534af1fc99b011db7c4944bf40d0df`, on the campaign branch `v26-adolion-fresh`, not merged.
  - That commit adds only `ADOLION_ST_URL` to `install_st.py`, which lets the installer target a lane.
  - The campaign's master working tree carried another session's uncommitted sprite work, and the pin never reads it: `git archive` exports the commit.
- The audit is `02-audit.md`.

**What a seed does.**
1. `git archive` the pin (build/lorebooks, cards, story, st-groups.js, scripts).
2. `st-lanes stop` + `seed --fresh`.
3. Strip the copy of the real install:
   - 16 books, 147 cards and their chat dirs, 9 `Adolion - ` groups and 28 group chats;
   - the 9 library records, their bindings and the global selection.
4. **Switch `image.enabled` and `sprites.enabled` off in the lane's settings before the server starts.**
5. `st-lanes start`.
6. Run the campaign installer. Any FAIL, SKIP or WARN line fails the seed.
7. Reload the page.
8. Wait until the page lists all 147 cards, then run `st-groups.js`.
9. Select exactly the 16 required books, deselecting everything else.
10. Import each story in its own group's chat through `openGroupById` (retried while ST refuses mid-save), and settle until the Adolion groups' `disabled_members` are stable for 4 s.
11. Restore the extraction settings.
12. Read `requirements` per story by reopening each group.
13. Take a so-assets baseline: `<lane>/debug/adolion-fresh-asset-baseline.json`, `trusted: true`.
14. Build the inventory from the lane's disk, check it against the manifest, and diff it against the lane's previous one.
15. Scan the lane's `server.log` for ComfyUI calls since the start.

**Unit gate.**
- Command: `node --test scripts/debug/lib/adolionFresh.test.mts`, 8/8 pass.
- Mutants were run by hand, each against one check:
  - dropping the `book missing` push fails case 3;
  - ignoring selection in `storyReadiness` fails case 4;
  - dropping the media check fails case 7.
- The planted-missing-book negative is case 3. It shows the missing book, the missing selection, and adolion-esha unready at both the install and the runtime layer.

**Live gate (no LLM, lanes 1 and 2).** Records are archived under `test/journeys/records/v2.6-02/adolion-fresh/`.

| Run | Result |
|---|---|
| lane 1 seed E (15:37 UTC) | problems `[]`; 16 books, 147 cards, 9 groups, 9 stories, 16 selected, **9/9 `requirements.ready`** (install and runtime) |
| lane 1 seed F (15:48) | problems `[]`, `sameAsPrevious: true`, drift 0 |
| lane 1 seed G (15:58) | problems `[]`, `sameAsPrevious: true`, drift 0; `adolion-fresh diff` E vs G: identical |
| lane 2 seed (16:06) | problems `[]` |
| lane 2 `check --drop-book "Adolion - Eshalanore"` | exit 1. Problems: the book missing; not selected; adolion-esha and adolion-saga unready at the install layer and at the runtime layer (`requirements.ready` false, `missingLorebooks` names it); 7/9 ready |

Gate met: consecutive seeds on lane 1 give identical inventories, and a planted missing book fails the check. Both lanes were stopped afterwards.

**Deviations and findings.**
- **Earlier seeds reached the shared ComfyUI.** Seeds 1a and 1b (14:32–14:39 UTC) ran before the media switch-off existed. With `image.enabled` inherited from the real install, story imports alone posted to `127.0.0.1:8188`; no turn was played. The lane log shows ECONNRESET, then ECONNREFUSED. This was reported to the lead the same day.
  - A seed now fails if its lane log shows any ComfyUI call.
  - The check fails if media generation is on.
  - The rule is in `.claude/rules/debug-scripts.md`.
- **Four earlier attempts failed; E, F and G ran on the fixed script.**
  - One: the page listed only part of the freshly installed cards when `st-groups.js` ran, so 7 of 9 groups were never made. Fixed with the wait-for-cards step.
  - Three: a group click was silently dropped by ST's own guards (`isChatSaving` / `is_send_press`). Fixed with `openGroupById` plus a retry and settle.
  - Before the settle, two seeds' inventories differed only in `disabled_members`: the reads raced the cast writes.
- **Lanes 1 and 2 disagree on the Saga group's cast.** The two lanes' inventories differ only in the Saga group's `disabled_members` (19 vs 17: Leila, Naomi). Lane 1 is stable across three seeds, so this is a cross-lane difference in the 125-member cast apply, not seed noise. It is open.
- The run header was not captured around the seeds. `adolion-fresh` records the campaign commit and pin; the bundle is the staged dev build at master.

**Overall gates.** Run in the worktree after merging master `5092b5e0`, in this order, all exit 0.

| Gate | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run typecheck:test` | exit 0 |
| `npm run lint` | exit 0 |
| `npm test` | 354 suites, 4722 tests pass |
| `npm run build` | exit 0 |
| `npm run test:debug` | 437 pass, 0 fail |
| `npm run build:dev` | exit 0 |
| `npm run test:release` | 77 pass, 0 fail |

- `test-storybook:ci` was skipped, per the brief.
- In a fresh worktree, `test:debug` needs `dist/manifest.json` and `test:release` needs `dist-dev/`. The first pass failed on exactly those two tests before `build` and `build:dev` had run. No source changed between the two passes.
- No LLM run.
- No `src/` change, so the bundle size is untouched.
