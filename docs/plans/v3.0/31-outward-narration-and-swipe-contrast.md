# v3.0 31 — Outward narration and swipe contrast

**Status: BUILT 2026-10-30** on `v3.0-34-grounding` (see Gate record); rating rows owed. Harvest index `30-harvest-index.md`. Size: S build, M rating.

## Problem (player)

- The narrator voices what characters privately hold: thought reports, motive explanations, decoded gestures. A secret
  can stay unsaid and still be spoiled by "she hides her fear of him". Prose reads omniscient instead of observed.
- A swipe often returns a near copy of the reply the player just threw away. Nothing tells the model what was rejected.

## Evidence

- Harvest: `extension-research-2026-10-30/lattice.md` P1 (outward-only narrator spec, interiors persisted but never wired
  to guidance), `nemopresetext.md` P2 (ReSwipe: rejected reply as a one-shot fenced negative), `tavernos-hud.md` P3
  (stale copy vs placeholder when re-feeding model output).
- Ours: narrator header `src/memory/innerRender.ts:96` gives the cast's `hiding/intends/knows` rows with "use this to
  foreshadow"; no clause forbids narrator interior reports for NPCs; `PLAYER_MIND_CLAUSE` covers the player only
  (`src/engine/agency.ts:26`). Swipe path: `cueSwipe` first in `talkControlInterceptor` (`src/runtime/wiring/talk.ts:84-86`),
  lore select drops the swiped reply (`src/runtime/loreSelect.ts:92`); nothing quotes it. Host fact: on a swipe ST drops the
  rejected message from the prompt copy before interceptors, but `chat.at(-1).mes` still holds it (harvest SUMMARY §Host facts).

## Recommendation

Two prompt changes, rated in one blind window (shared corpus build, one Sol run). Each adopts on its own floors.

- **S1 Outward clause (narrator).** One fixed sentence appended to `NARRATOR_HEADER`'s block: narrate only what the player
  could observe; NPC interiors reach prose through speech, action and choice; no thought reports, motive explanations or
  named emotions as fact; "no feeling owes a visible tell". The narrator still receives the rows (foreshadowing stays;
  only the voicing changes). Static text, so the prefix head does not churn (13). Drafted members' own aims unchanged
  (`renderOwnAims`): the inner voice is untouched.
- **S2 Swipe contrast (loud swipe only).** After `cueSwipe`, for a loud `swipe` generation in the story chat, append one
  tail message: "The reply below was rejected by the player; write a different reply. Not part of the story:" + the
  rejected `mes`, fenced, clipped (~600 chars). Never `extra.reasoning`. Quiet/impersonate/regenerate excluded. Same
  member's visible text that was in the shared transcript a moment ago, so no new privacy channel; tail placement keeps the
  cacheable head (13). New `INJECTION_REGISTRY` entry; `carry: WITHHOLD` only governs quiet/impersonate inheritance, so the
  lifetime is explicit: cleared on render, abort, failure, chat switch and before any nested generation (test each). A
  second swipe quotes the newest rejected reply only.
- **S0 Measure first (no build).** Copy-rate audit (tavernos P3): over recorded swipes, shared 5-gram rate between the
  rejected and the replacement reply; over recorded turns, count narrator interior-report sentences (regex + Sol label on a
  sample). Decides whether S1/S2 are worth the rating window. If the S0 baseline is already low (interior < 1 per 10
  narrator replies; swipe 5-gram overlap < 10 %), record and stop that slice.

## Invariants touched

- Prompt layout is quality-rated: neither ships before the blind rating (owner decision 4, 2026-10-26).
- Thinking and inner voice stay on; S1 changes narrator wording only, S2 adds no reasoning.
- Held secrets: the narrator's holdings are an omniscient channel by design: `memberAimsBlock` gets epistemic rows through
  a scope/budget selector, not the resting filter (`src/runtime/memoryInjector.ts:125-133`, `src/memory/innerRender.ts:168`).
  S1 is a wording clause, **not** a secrecy guarantee; the floor counts secret restatements, it does not prove absence.
  S2 quotes visible text only.
- Prefix stability (13): S1 static, S2 at the tail; payload goldens + `so-payload-golden prefix` must show divergence at
  or after the per-turn boundary.
- Engine purity: both live in `memory/innerRender.ts` / runtime interceptor; no engine change.

Overlap: rate S1 against the existing narrator sheet and inner-voice behaviour (v2.8 54, v2.9 02 voice prevention) so the
clause does not contradict them.

## Floors (predeclared, informational, never retuned)

Positive-case counts and labels are frozen from S0 before any arm runs; a percentage floor applies only when the control
has >= 10 positives, else the slice records counts and stops.

- S1: Sol blind pairs on >= 25 recorded narrator turns: no category below -0.2, flags <= control + 2, thinking closure no
  worse than control; interior-report sentences per 10 narrator replies down >= 50 % vs control; secret restatement 0.
- S2: >= 25 recorded swipe points: "differs from rejected" (Sol, pairwise) better in >= 60 % of pairs; quality categories
  no lower than -0.2, flags <= control + 2, thinking closure no worse than control; quoted-phrase copy (>= 8-word span
  from the rejected reply) in <= 2 of 25.

## Tests and gates

- jest: narrator header text pinned; S2 registry entry only on loud swipe in the story chat (quiet, impersonate,
  regenerate, other chat refused); clip length; `extra.reasoning` never read; cleared on render, abort, failure, chat
  switch, nested generation.
- Payload goldens: new swipe case + narrator case; `prefix` check green.
- `npm run gates`; live gate on a model lane: one swipe, applied block present once, absent on the next send.

## GPU / rating (owner-gated)

- Corpus build: recorded turns exist (end-batch sessions); swipe points need a lane run, est. ~30 min GPU for 25 swipes
  x 2 arms (TO ESTIMATE on the adopted controller).
- **Blind Sol rating is owner-gated: ask before running.**

## Unresolved questions

- S2 on regenerate (not swipe): same rejection semantics? Default no.
- Should S1 also cover drafted members' replies about other NPCs (member narrating someone else's interior)?

## Gate record 2026-10-30 (v3.0 build, branch `v3.0-34-grounding`)

Scope per the owner brief 2026-10-30: both prompt changes built behind settings that ship off; blind-rating arms prepared.
Thinking and inner voice untouched. S0 not run (see Owed).

- **S1 outward clause (built, OFF).** `NARRATOR_OUTWARD_CLAUSE` (`memory/innerRender.ts`) appended last to the omniscient
  narrator's block (`renderNarratorBlock`/`memberAimsBlock` `outward`), static text, holdings unchanged; drafted members'
  own aims and private blocks byte-identical (test). Read from `memory.settings.outwardNarration` in `MemoryInjector`.
  Setting `memory.outwardNarration` default **off** until ARMS-31S1; control `#so-outward-narration`.
- **S2 swipe contrast (built, OFF).** `runtime/swipeContrast.ts` (pure) + lazy `swipeContrastHost.ts`, armed in the talk
  interceptor after the talk decision (an aborted generation never arms), loud `swipe` in the story chat only; quotes
  `chat.at(-1).mes` (never `extra.reasoning`), fenced, clipped to 600 characters at a word, under "The reply below was
  rejected by the player; write a different reply. Not part of the story:". Registry entry `swipeContrast` (depth 0,
  WITHHOLD; depth-0 allowlist extended). Explicit lifetime: cleared on non-dry GENERATE_AFTER_DATA (the prompt took it),
  MESSAGE_RECEIVED, GENERATION_STOPPED, GENERATION_ENDED, CHAT_CHANGED and any later GENERATION_STARTED (nested or next);
  re-arming clears first, so a second swipe quotes the newest reply only. Setting `talk.swipeContrast` default **off**
  until ARMS-31S2; control `#so-swipe-contrast`. Regenerate excluded (plan default).
- Tests: `outwardNarration.test.ts` (5), `swipeContrast.test.ts` (13).
- Payload goldens not extended (the swipe path does not run on dry runs); the clause is static, so the prefix check rides
  the arms' recorded requests.

### Rating arms (prepared, not run: GPU owed)

`scripts/debug/so-prompt-arms.mts` + `lib/promptArms.mts` (node tests `scripts/debug/promptArms.test.mts`, 8): gates `outward`
(31 S1), `swipe` (31 S2), `notes` (34 S1). Fixtures `test/measurements/v3.0/prompt-arms/{outward,swipe,notes}.cases.json`, 25
synthetic cases each (invented text, toy cast Arin + DM Narrator), built from pools (`build`), frozen in `freeze.json`. Per case
and arm a sandbox scenario imports the case story, posts the transcript (notes: `setQuality` moves place and time mid-way),
switches only the gate's setting (read back; reset in the last step and again after the run) and drafts the measured speaker
(swipe: swipes the posted rejected reply); it records the request, raw and visible reply and reasoning length. Pairwise blind
pack (sides seeded, key apart); Sol (opencode `openai/gpt-6.1-sol`) labels both replies: four 1-5 categories, flag, interior
sentences, restates, contradicts, differs; code counts 8-word span copies, echo and closure. Floors as this plan and 34
declare them (a percentage only when the off arm has >= 10 positives). Deviation: synthetic cases, not recorded turns
(recorded sessions are private campaign text).

Owed rows (GPU queue ARMS-31S1, ARMS-31S2, ARMS-34S1), after this branch is merged and staged, model lane 45, images off,
toy group present:

```
node scripts/debug/st-lanes.mts run 45 -- scripts/debug/so-prompt-arms.mts record --gate <outward|swipe|notes> --arm both --out C:/dev/so-lanes/45/debug/arms/<gate>
node scripts/debug/so-prompt-arms.mts pack  --gate <gate> --out C:/dev/so-lanes/45/debug/arms/<gate> --seed v30-arms-<gate>
node scripts/debug/so-prompt-arms.mts rate  --gate <gate> --out C:/dev/so-lanes/45/debug/arms/<gate>
node scripts/debug/so-prompt-arms.mts score --gate <gate> --out C:/dev/so-lanes/45/debug/arms/<gate> --json C:/dev/so-lanes/45/debug/arms/<gate>/score.json
```

Also owed: S0 baselines (not built), 31 live gate (one swipe: block present once, absent on the next send). Lane checks: NOT
run (no staging, brief).

Gates (branch tree `b2c47f1d`, shared by plans 31 and 34):

- `npm run gates:quick`: RED first (expected fixture and census updates: injection registry, reply-repair order, show-me rows,
  ownership census, session baseline, worldInfo settings), fixed, targeted jest 228/228 green, `typecheck:test` clean.
- `npm run gates -- --no-storybook` (run 1): RED at `debug:typecheck` (two type errors in `lib/promptArms.mts`), fixed (`b2c47f1d`).
- `npm run gates -- --no-storybook` (run 2, no `--resume`): typecheck, typecheck:test, build, lint, test, test:replay (32 of 32
  killed), debug:typecheck, test:plugin, test:release ok; **test:debug FAIL** on `scripts/local/orphans.win.test.mjs` "a
  hard-killed controller leaves no text server behind" (controller reaper timing, untouched by this branch, machine saturated
  by parallel builders). Rerun alone: 3/3 pass. `npm run gates -- --no-storybook --resume`: "gates: all green in 239.2s (8
  step(s) reused)", test:debug ok.
- Storybook alone on port 6234 (`npm run storybook:build`, then the http-server + test-storybook pair, `--maxWorkers 2`):
  168/169 suites, 1024/1025 tests; the one failure `Studio/StudioModal › Seeded` timed out at 15 s in a tab loop (274 s
  suite under load, file untouched). Rerun alone (`--maxWorkers 1 src/studio/StudioModal.stories.tsx`): 13/13 pass.
- Main bundle 1,270,115 B (budget 1,300,000): history notes and swipe contrast ride lazy chunks; pins load lazily too.
- `node --test scripts/debug/promptArms.test.mts`: 8/8.
- Lane checks and real-LLM gates: NOT run (no GPU, no staging, brief 2026-10-30).
- UI-rework-zone files touched: `src/components/settings/PlayGroups.tsx` (CharacterStateGroup trial rows, lore-pins state),
  `src/components/settings/WorldInfoGatingGroup.tsx` (`#so-wi-lore-pins` row), `src/studio/mutations.ts` (`setRequirements`
  keeps the bindings).
## Rating record 2026-10-30 (GPU G1, lane 41)

Rows ARMS-31S1, ARMS-31S2, ARMS-34S1 on the staged master build (restaged by the peer at 21:29Z, between outward and swipe), lane 41 (local controller, Artemis, thinking on), images and
sprites off, group "Group: Arin, DM Narrator". Recipe as above with `C:/dev/so-lanes/41/debug/arms/<gate>`; rater Sol
(opencode `openai/gpt-6.1-sol`), 25 pairs each, 0 failed, 0 incomplete. Floors informational, not retuned.

- **outward (31 S1): PASS.** Preference on 13 / off 12. Categories on minus off: character +0.04, scene +0.12, prose -0.04,
  agency -0.04. Flags 4 vs 6. Closure 25/25 both. Interior sentences 2 vs 4 (off < 10 positives: counts only). Secret
  restatements Sol 0 (needle 1, not counted by the floor).
- **swipe (31 S2): FAIL** on the one floor that measures the feature: "differs from the rejected reply" won by on in 2 of
  25 (share 0.08, floor 0.6); a hand tally from labels + key agrees (on 2, off 19, tie 4). Everything else passed:
  preference 13/12, categories +0.24/+0.36/+0.08/+0.48, flags 23 vs 24, closure 25/25, copied 8-word spans 0/0. Read: quoting
  the rejected reply makes the new swipe resemble it more, not less (anchoring). Sol's notes on both arms flag the cast's
  gender and invented player names (case material, not arm-specific).
- **notes (34 S1): PASS.** Preference on 25 / off 0. Categories +0.28/+3.04/+0.12/+0.08. Flags 1 vs 19. Closure 25/25.
  Echo 0. Place/day-part contradictions 2 vs 20 (down 0.90, floor 0.5).

Defaults (rule: off only until the rating passes): branch `v3.0-g1-defaults` flips `memory.outwardNarration` and
`memory.historyNotes` to on (tests, feature status `shipped`, copy, guide, settings reference, session baseline, arm reset);
`talk.swipeContrast` stays off, the miss recorded, the floor not retuned. Still owed: S0 baselines, 31 live gate (one swipe), 34 S2 live gate.
