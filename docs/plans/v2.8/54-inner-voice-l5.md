# Plan 54 — Inner voice L5 spike: the carried thought

**Status (2026-10-14): built on `v2.8-a13-l5` (queue A13, backlog D3). Deterministic gates in the Gate record; CL leg
run below; RP legs owed.** Source: `v2.7/37-character-life.md` §L5 ("inner voice, promoted"), `v2.6/06-inner-voice.md`
B2 and C, `v2.8/01-v27-carry-over.md` §F M2/M3.

## Why a spike, and why this one

L5's own text has no design: it promotes the reasoning harvest (B2) and the inner beat (C) once their measurements pass.
Since 2026-10-09 both are on by default (owner: every built feature on), so promotion of the switches is moot; what L5
can still add is the piece the two leave open. The beat is the only thing that writes "Your intent this turn", and it is
missing whenever the prediction missed and the draft-time beat did not land within `INNER_DRAFT_WAIT_MS` (3 s), the call
was unusable, or the beat went stale. Meanwhile the drafted member's own previous reply usually carries native
reasoning (thinking is on), which already states what that character is after, and B2 only uses it as extraction
evidence. Stepped Thinking's second value, "that want persists across turns", is the gap.

## L5 as built (decided before the first run)

- **Spike** `spikes.thoughtCarry`, install-wide, on unless literally `false` (owner rule). Lazy: the picker lives in
  `runtime/spikes/thoughtCarry.ts` (spike chunk), installed as the `carry` seam by `runtime/spikes/index.ts`.
- **When:** at draft time, inside the beat host (`runtime/innerBeatHost.ts` `beatFor`), only when `takeBeat` found no fresh
  beat, the inner beat is on, the reasoning harvest is on (it reads `message.extra.reasoning`, which B2's switch guards),
  and the seam is installed. A fresh beat always wins; when the draft-time beat lands, the re-apply replaces the carry.
- **What:** the drafted member's own newest reply in the last 8 rows and after the active checkpoint's start message,
  never the member's in-progress draft row. From its reasoning: the first labelled aim (`goals:`, `aim:`, `wants:`,
  `motivation:`, … with an own possessive or none), else the latest sentence whose subject is the member (name, first
  name, he/she/they; `I` until the fix below) followed by an aim verb (`wants`, `needs to`, `intends`, `plans to`, `hopes to`, `is determined
  to`, …). Refused: meta-commentary (`isMetaCommentary`) and writing instructions (write, narrate, describe, tone, reply,
  scene, prose, persona, the user, the story, …), lines whose subject is the player (story personas plus the chat's user
  names) or another character, under 12 characters; clipped at 200.
- **Picker fix (2026-10-14, after the CL miss; coordinator request):** the `I` subject and the `my` label are gone, and any
  line with first-person author voice (`I need/should/will/…`, `me`, `my`, `we`, `let's`) is dropped; the player match is by
  token (every persona and user-row name, plus each name word of 3+ letters), refusing a line whose subject segment (the words
  before the aim verb, or a labelled aim's first three words) names the player; more direction markers are refused (`react to`,
  `show how`, `reconcile`, `determine if`, `remember`, `impersonate`, `maintain`, `ensure`, `character`, `player`, a trailing
  colon, …). An NPC aim that names the player as object ("Kael wants Max to hand over the map") is still carried.
- **Line:** `(carried from your last thought) <aim>`, rendered by the existing path as `- Your intent this turn: …` in that
  member's private block only. It rides the beat channel, so the held-secret drop (`keptFrom`) applies unchanged, the
  narrator view never sees another member's carry, and the resting block stays empty.
- **No model call, nothing stored.** The line is a pure function of the chat rows at draft time: rollback ≡ replay holds
  by construction (a swipe, edit or delete changes the rows and so the line). No census row (no async write).
- **Journal** (status): `Inner thought carried for <name>` (`from message N`) or `No thought to carry for <name>` with
  `no-reply`, `no-reasoning`, `no-aim`. Counters on `storyOrchestratorSpikes.thoughtCarry.stats()`.

## Floors (predeclared, never retuned)

- **D (deterministic, jest):** 0 model calls on the carry path; 0 carried text from another member's reasoning; the line
  only in the drafted member's block (resting block and other members' blocks clean); a line restating a kept-from
  secret dropped; every meta/writing negative control refused (22 lines); player-subject and other-character-subject
  lines refused; rollback ≡ replay over every cut of a grown chat, and a swipe changes the line.
- **CL (offline, real Artemis v1.1 reasoning from a recorded private session, rater Sol `openai/gpt-6.1-sol`, ≤ 100
  calls):** each reply with reasoning is replayed as a draft of that member right after the player's next line.
  - L5-CL1 precision: ≥ 0.80 of carried lines rated "a standing aim of that character, in character" (not a writing
    instruction, not the player's action, not a step already performed in that reply);
  - L5-CL2 meta leak: ≤ 0.05 of carried lines rated a writing/narration instruction;
  - L5-CL3 player: 0 carried lines rated as stating what the player character does or decides;
  - L5-CL4 yield: ≥ 0.25 of replies with reasoning produce a carried line;
  - at least 20 carried lines rated, else INCOMPLETE; the rater runs twice over the same picks and both runs must pass.
- **RP (owed, Artemis on the 3090 or a pod):**
  - L5-RP1 coverage: on drafted group turns, the private block holds an intent line (beat or carry) on ≥ 90 %;
  - L5-RP2 quality: 20 paired replies on beat-miss turns (carry on vs `spikes.thoughtCarry: false`, same seed), blind
    second-model rater: carry arm preferred or tied on ≥ 12 of 20, and repeating the member's previous action rated no
    more often than control;
  - L5-RP3 privacy: `so-ui assert-player-clean` and the J5 block-scoped privacy check green with the spike on.
- Below a floor: the miss is recorded; the spike stays on (owner rule) unless the owner switches it off.

## Runner

`node scripts/debug/so-l5-carry.mts pick --chat <chat.jsonl> --out <items.json>` (deterministic picks, the shipped picker
bundled with esbuild), `rate --items <items.json> --out <ratings.jsonl> [--batch 10] [--max-calls 50]` (Sol through
`opencode run`, calls counted), `score --items <items.json> --ratings <ratings.jsonl>` (floors, exit 1 on a miss). The
corpus and ratings hold campaign text: they stay in the debug dir or the private so-sessions repo, never here.

## Gate record

2026-10-14, branch `v2.8-a13-l5` from master `a302b65e` (unmerged, not pushed).

- Built: `runtime/spikes/thoughtCarry.ts` (picker + counters, spike chunk), `carry` seam (`runtime/spikeSeams.ts`), beat host fallback (`runtime/innerBeatHost.ts`), flag `spikes.thoughtCarry` (on unless `false`), `storyOrchestratorSpikes.thoughtCarry.stats()`, guide topic `inner-voice` (story guide, compact twin, Characters page, Studio Roster tab), registry feature `thought-carry` (experiments now name their four flags), session baseline key. No UI component changed, so no Storybook run.
- D floors: green. `thoughtCarry.review.test.ts` (13 cases: picker, 22 meta negatives, player/other subject, window/checkpoint/draft row, rollback ≡ replay over every cut + swipe, off switch, host: carry on miss, fresh beat wins, harvest/beat/seam off, 0 model calls) and `innerVoiceInjection.review.test.ts` (+2: drafted block only, resting block empty, kept-from secret dropped).
- Commands: `npm run gates -- --no-storybook --jobs=2 --skip=test` all green in 369.7 s (typecheck, typecheck:test, lint, debug:typecheck, build, test:replay 32/32 killed, test:debug 1271/1271, test:plugin, test:release); jest run separately `npx jest --maxWorkers=4`: 722 suites passed, 1 skipped; 8307 tests passed, 1 skipped. `gates:quick` per change. First full jest run caught `codeHealth` S3 (guideTopics.ts at 606 effective lines, budget 600): topic shortened, diagnostic map rows packed, now 600.
- Main bundle `dist/index.js` 1,265,358 B (budget 1,300,000, not raised). Architecture budgets unchanged (no coordinator touched); no async write, so no ownership census row.
- CL (corpus: one recorded private Artemis v1.1 thinking session, 106 replies with reasoning; picks and ratings in the private evidence tree `test/sessions/evidence/a13-l5-2026-10-14/`, archive owed via `npm run sessions:archive`): yield 41/106 = 0.39 (pass); rater Sol, 5 calls per run, **10 calls total**. Run 1: precision 0.732, meta leak 0.171, player lines 2 → **FAIL**. Run 2: precision 0.756, meta leak 0.171, player lines 2 → **FAIL**. Floors not retuned; the spike stays on (owner rule). Diagnosis (counts only): 5 of the 7 meta lines are first-person author voice ("I need to …" accepted through the `I` subject); 2 player lines slipped through a name variant the user rows did not carry. A fix (drop the `I` subject, word-level player match) needs a fresh corpus to measure; none of ≥ 20 rated lines exists yet (the RP leg collects one).
- No-model scenario `test/scenarios/v28-a13-thought-carry.json` (debugResponse plumbing only; schema and requires validate): **not run, owed**. Creating a private ST copy under `C:devso-lanes` was refused by the session permission policy, and the owner ST, lane 0 and the real extension slot were left untouched.
- RP legs L5-RP1..3: owed (no GPU work in this pass).
- Campaign: install-wide spike, no authored field, so Adolion needs no change and no pin bump.

### Addendum 2026-10-14: picker fix

- Merged master (`4c2232c8`); plan renumbered 42 → 54 (42 is witness filter v2); references updated (queue A13, backlog D3, plan 37 L5, scenario note).
- Fix as described in §L5 as built; 3 new jest cases from synthetic counterexamples (8 author-voice lines, 6 player/persona variants with 2 controls that must still carry, 10 direction markers with 1 control); each family holds lines the old picker carried (checked by bundling the previous file).
- Re-score, **informational only: same recorded corpus, not fresh** (the fix was designed after reading its misses, so this is not a floor test). Picks 32/106 (yield 0.30), Sol 4 calls (batch 8), one run: precision 0.906, meta leak 0.000, player lines 0. Files `items-fix.json`, `ratings-fix.jsonl` in the same private evidence dir. Total Sol calls for A13: 14. The CL verdict stays the recorded FAIL ×2 on the as-built picker; a floor verdict on the fixed picker needs a fresh corpus (the RP leg).
- Gates on `3858d07e`: `npm run gates:quick` green; `npm run gates -- --no-storybook --jobs=2 --skip=test`: 8 of 9 steps green (build, test:replay 32/32 killed, test:debug, typecheck, typecheck:test, debug:typecheck, lint, test:release); test:plugin red once on a harness timing test outside this change (`agent.test.mjs:512`, "create: the setup call is pending"), green alone on re-run (288/288). `npx jest --maxWorkers=4`: 725 suites passed, 1 skipped; 8336 tests passed, 1 skipped. Main bundle 1,265,358 B (picker is in the spike chunk). No UI changed, no Storybook.

## Folds from v2.9 triage (applied 2026-10-25, owner)

- A06.
- Source: `docs/plans/v2.9/01-triage-sol.md`. Not built; each item is scheduled with this plan's next build pass.
