# v3.0 31 — Outward narration and swipe contrast

**Status: PLANNED 2026-10-30** (harvest 2026-10-30, index `30-harvest-index.md`). Nothing built. Size: S build, M rating.

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
