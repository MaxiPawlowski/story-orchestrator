# Additions harvest 2026-10-21 — summary

## Method

- Ask (owner 2026-10-21): look at current SO features for nice player-experience additions; lead idea Recast-style polish
  configured per character; plus a scout outside the ST ecosystem.
- Feature inventory: `src/features/*` registry (≈120 features), plans 42–78, triage `61-harvest-triage-2026-10-14.md`.
- Corpus refresh (`C:/dev/st-extensions-research`): 6 forum threads since 2026-10-14; cloned scene-archivist, castward, lattice,
  languagetool, vectfox (missed last round). 10 clones changed (branch `pre-refresh-2026-10-21`); Recast unchanged.
- 13 Opus reviewers with a player-experience lens (`_brief.md`), one design deep dive (`per-character-polish.md`), one
  non-ST niche scout (`niches.md`). Nothing run; claims are code reads, unmeasured unless stated.
- Licences: MIT = lattice, castward, languagetool; the rest AGPL/none = ideas only.

## 1. Per-character polish (owner idea) — design ready, owner decisions open

Full design: `per-character-polish.md` P1–P3. Five reviewers converged on it independently (creative-studio P1,
nemopresetext P1, dooms P4, lattice P1–P2, simulation-blackboard P2, castward P4, languagetool P1–P2).

- **Prevention first (S):** a "How you speak / Words that are yours / Never" line from `roster[].polish` in the drafted
  member's private block (next to `renderOwnAims`). Zero extra calls, no shared-tier leak. Measure alone as an arm.
- **Per-speaker tics in code (S):** `mineRepetition` today pools every member (`stagecraft/repetition.ts:65-84`); split it by
  speaker and merge each member's `banned_tics`. Free trigger and an author readout. Avoid lists go in the prompt: ST's
  `{{banned}}` bans single tokens on llama.cpp (castward host fact).
- **Polish pass (L):** runs when the reply arrives, after thought-leak repair; the reply's pending boundary waits (cap 45 s), so
  the rewrite lands before commit like the leak repair (no rollback/recommit). In a group round boundaries already wait for the
  round, so polishing member k overlaps member k+1's generation. One sectioned call (voice / rhythm / repetition) on a new
  `polish` role, harness sol by default; triggered by code signals, not every reply.
- **Safety (code, not prompt):** only the member's own spans may change (lattice window-and-anchor guard: everything else
  byte-identical, truncation refused); no new proper nouns or numbers, quotes frozen unless `dialogue: "voice"`, no narrated
  player act (agency clause), length band, repetition must not rise; any failure keeps the original. The pass sees only the
  reply, the member's polish block, card examples, its last 3 replies and the last 2 public messages: never memory, secrets,
  lore or the inner beat. Thinking and inner voice untouched; `extra.reasoning` survives (in-place write).
- **Optional checks:** judge "which member said this line?" swap test as the drift signal (nemopresetext P1);
  LanguageTool only as a before/after guard, never the rewriter (it would erase voice).
- **Measure:** blind pairwise vs unpolished on real play, floors informational.
- **Owner decisions:** (a) sol as the polish default (AGENTS.md lists sol for authoring/wizard/Ask/rating only);
  (b) trigger `signals` vs `every`; (c) group: land polish k after k+1 already read the raw text, or hold k+1;
  (d) the visible swap after streaming (or an arm with streaming off; lattice offers the rewrite as a new swipe instead);
  (e) Adolion polish blocks after the prevention arm is measured.

## 2. Other additions (player experience), not covered by triage 61

- **Player-declared attempt** (dooms P1, 3/M): mark the next message as an attempt; a seeded draw keyed to that message
  settles it; swipes and regenerates keep the result; the outcome block narrates it with a margin word and whose roll (P2).
- **Player-safe character diary at chapter seal** (scene-archivist P1, 3/M): an NPC's diary page built from the resting view
  and what the player witnessed only. Owner call (new player surface).
- **Slow-burn relationship pacing** (lattice P5, 3/M): per-story-day cap, settle toward baseline over story time, diminishing
  returns on repeats. → 51 / character life.
- **Weighted outcome tables on an authored trigger** (lattice P4, 3/M): "the wand misfires 10%, from this list". → 49 G19.
- **Story-time span on chapter cards and the away recap** (scene-archivist P2, 3/S): `timeLabel` exists (`clock.ts:57`), unused
  outside clock.ts. → 50.
- **Player authors their own feelings and thoughts** (simulation-blackboard P1, 3/S): agency clause bans narrated acts only.
  Raise with the owner first (inner voice 54).
- **"Why did I…" causal recall** (vectfox P4, 3/M) → 43. **Relative-age labels on recent memory lines** (vectfox P5, 2/S).
- **Test quality:** range and no-change fixtures for the live extraction suite (castward P1, 4/M); fixture prose written by the
  real play model with a holdout set (P2, 3/M).
- **Decide what a user-stopped partial reply is** (st-memory-books P1, 3/S): today it commits a boundary and can fire a
  transition; no policy recorded. Owner decision, then pin in `so-turn-types-check.mts`.

## 3. Suspected SO defects

- **Chapter fold leaves interior IGNORE holes on Chat Completion** (vectfox P1). Spot-checked: ST `setOpenAIMessages`
  assigns `messages[i]` only for non-ignored rows (`public/scripts/openai.js:584-587, 644`), so an ignored row with kept rows
  on both sides leaves a hole; `[...messages].reverse()` (`:948`) yields `undefined` → `new Prompt(undefined)` → "Message role
  not set". SO's fold flags every chapter range minus `keep_tail` (default 6) (`src/runtime/chapterKit.ts:324-345`), so two sealed
  chapters give interior holes. Text Completion (Artemis play) unaffected; any CC route (DeepSeek, harness?) affected.
  Not reproduced. Fix: fold one leading block only; plan 63's cut needs the same rule.
- VectFox blocks are a transcript copier: add `3_vectfox*` to the `transcript-copiers` check (vectfox P2, S).
- Image upload trusts the returned path (bb-vne P3, S) → 69 bundle.

## 4. Outside ST (niche scout, `niches.md`)

18 sources: storylets/QBN, Valve Ruskin + Mímir, Hades, Façade, Versu, Talk of the Town, Felt/Winnow, Loose Ends, CK3, RimWorld,
Wildermyth, AI Dungeon, NovelAI, NovelCrafter, Hidden Door, Disco Elysium, Citizen Sleeper, Pentiment. Clones in
`C:/dev/st-extensions-research/niches/` (felt, winnow: no licence; mimir, centrifuge: permissive). Its top 10:

1. **Per-member voice sheet + generation-time bias** (Versu, Façade, NovelAI): agrees with §1 prevention; adds per-mood notes and
   a logit bias only on that member's own generation. Caution: token bans damage prose on llama.cpp (castward host fact), so
   any bias must be small and measured.
2. **Story sifting threads** (Felt/Winnow): typed microstory patterns matched over the boundary log; SO records history but
   nothing notices patterns. Feeds recap (46), chapters, director. V5, M–L.
3. **Grounded "What could I do?"** (Loose Ends): suggestions ranked by the threads they advance; dormant threads resurface. S after 2.
4. **Per-member remark bank, most specific rule wins** (Ruskin/Mímir/Hades): characters notice specifics once each, delivered
   as a cue in the private block, not a scripted line. M.
5. **Hot-button topic tiers** (Façade): asking a character about the same thing again unlocks a deeper cue. S–M.
6. **Player whispers / passive checks** (Disco Elysium): seeded perception lines on the player's own surface. M.
7. **Delayed echoes** (CK3): authored consequences that land days later if still valid. S–M → 46/50.
8. **Stakes preview** (Citizen Sleeper): show which visible things would help a pending check before acting. S.
9. **Role-cast set-pieces** (Wildermyth): authored scenes whose roles go to whoever fits in the present cast. M.
10. **Codex "replaces" + post-story rumor trail** (NovelCrafter, Talk of the Town). S.

Disagreement settled: the scout says a polish rewrite after `MESSAGE_RECEIVED` would count as an edit and roll back. Not so if
it runs where the deep dive puts it: `TurnBridge.enqueueBoundary` already awaits `manager.fireAfterSpeak()` before marking the
pending boundary ready (`src/runtime/turnBridge.ts:163-172`), and `rewriteReplyText` emits no `MESSAGE_EDITED`. So the rewrite
lands before commit, as §1 says. Still to prove with a spike: the fingerprint recorded at commit is the polished text.

## Host facts (new this round)

- `{{banned "phrase"}}` bans each token separately on llama.cpp; quoted bans never reach llama.cpp (castward).
- Within one depth, system-role injections land after user/assistant ones (dooms; `script.js:3309, 5628`).
- A message hidden from the prompt by IGNORE is still scanned by World Info (`script.js:4624`) (vectfox).
- `generateQuietPrompt` is a full `Generate('quiet')`; prompt-ready events fire for quiet generations too (tokensavingplugin).
- `WORLDINFO_SCAN_DONE` args are editable in place (`world-info.js:5175`) (scene-archivist).
- Card/preset-scoped regex runs only when allow-listed (`regex/engine.js:108-131`) (nemopresetext).
- In a group round `this_chid` is the drafted member only during that member's `Generate`; resolve a speaker from the row's
  `name`, never `characterId` (per-character-polish).
- `/api/images/upload` silently overwrites a same-named file (bb-vne).

## Reports

per-character-polish, lattice, castward, scene-archivist, languagetool, vectfox, dooms-enhancement-suite, simulation-blackboard,
nemopresetext, creative-studio, bb-visual-novel-engine, st-memory-books, tokensavingplugin, small-updates (tavernary,
probablytoomanytabs, valkyrie), niches.
