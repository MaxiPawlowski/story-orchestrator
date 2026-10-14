# Extension pattern harvest 2026-10-14 — summary

## Method

- Corpus refresh of `C:/dev/st-extensions-research` (2026-09-20 scrape). Discord `#📦・extensions` re-listed 2026-10-14: 392 threads
  visible (447 before). 16 threads newer than the last pass + Subscriptions (old thread, newly active) cloned, `post.md` condensed.
  Jeved unchanged (`fec4a2d`, reviewed in v2.4).
- `git fetch` of all 56 clones: 12 changed (old head = branch `pre-refresh-2026-10-14`). 3 trivial (BetterSimTracker now abandoned,
  VectHare mirror 7 lines, Lorebook Ordering one fix: see H-facts), 9 reviewed.
- One Opus reviewer per repo, brief `_brief.md`, against current SO code (v2.8), plans 42–59 and `32-queue.md`. 27 reports: 9 updated,
  16 new (bb-enhance-gen folded into bb-interactive-map; nemo-plotlight / persona-sync / booru-autocomplete one reviewer), 4 second looks
  (st-gamemaster, recast, rpg-companion, timeline-memory).
- Claimed SO defects re-checked by one adversarial verifier: `_verification.md`. Ideas below are reviewer claims, NOT verified unless
  the verification list says so.
- Licences: most are AGPL/GPL/none = ideas only. MIT: writers-workbench, worldinfo-workspace, tokensavingplugin, persona-sync,
  booru-autocomplete (+ tag data). Apache-2.0: characterbench.

## Suspected SO defects

Verdicts, evidence, fixes: `_verification.md` (read-only adversarial pass 2026-10-14, code + ST source, nothing run). None is high
severity; all fixes are S.

- **Confirmed**: B1 self-test 512-token budget + no role effort vs 2048 real read (`selfTest.ts:174`); B2 substring needles in
  self-test and `scripts/debug/lib/liveSuiteScore.mts`; B3 install-wide setting lost silently on reload inside ST's 1 s debounce;
  B5 harness echoes requested model, refusal returns ok (claude/codex routes only); B9 unguarded `crypto.subtle` (plain-HTTP LAN only);
  B10 pacing hint + check-outcome block not withheld on quiet/impersonate (also guide line 222 drift); B11 `fillChatInput` no
  leading-`/` guard; B12 profile tool bridge classifies by wrapper message, not `cause` (reason shown wrong, fallback still fires);
  B13 **doc error** in `gotchas.md`: a user stop sets `isFinished` true, only an errored stream leaves it false; B15 curator
  `rewrite` has no content baseline (patch is fine); B16 quest reward `{add}` unclamped vs `step_rule` min/max.
- **Confirmed host fact, plausible impact**: B14 global WI save debounce (medium when it hits: an author's pending edit of another
  book lost).
- **Partial**: B6 cast writes leave ST's own member list stale (our requirements watch and sprites are covered).
- **Plausible, unmeasured**: B4 harness auth/quota text matching; B7 `Number(messageId)` in `replyEffortLive.ts`; B8 sampler overlay
  listener order; B17 third-party send lock past the flush window.
- **Refuted**: B18 (plan 53 is a draft, faction rows not built); B19 (SO never removes scan entries).

## Top ideas (not defects)

Value/effort as the reviewer scored. "→ plan" = where it lands.

- **H1. Prepare world facts before contact** (simulation-blackboard P1, 4/L). Boundary pass fixes contents, who-knows-what, planned NPC
  lies ahead of the player, scaled by narrative distance; held facts ride the member's private block only. Separate pass (Artemis can't
  tool-call in play). Gate it on **H2**. → living director (22), NPC commitments (55), complications (49).
- **H2. Quantum-ogre probe** (simulation-blackboard P4, 4/S–M, RP tier). Swipe the same moment N times, ask about something never
  narrated, score agreement. Measurement that decides H1.
- **H3. Stepped history window** (tokensavingplugin P1, 4/M). Advance the context cut only at a high-water mark so ST never front-trims
  one message per turn; this, not summaries, is where their cache gain comes from. Pair with the front-trim cache A/B (P5, 3/S).
  → prompt-cache work (lorePlacement, B1-PFX).
- **H4. Public sheet reaches the narrator** (st-gamemaster P1, 4/S). `display.public` items/meters are never injected; only check
  outcomes are. Plus a "just happened" line for quest closes and public moves (P2, 3/S) and warn bands (P4). → 18, 46, 53.
- **H5. "Here now" scene card** (rpg-companion P1, 4/M). One player card: location, time label, who is present, relationship badge,
  standing, keepsakes. Reopens plan 51's "no interim surface" decision: **owner call**. Time-change chips per reply (P2, 3/S) → 50.
- **H6. Card-mistake review on every agent-proposed card** (creative-studio P1, 4/S). `reviewTutorialCard` exists but only the
  tutorial runs it. Plus lore activation preview + key lint on provisioning cards (P2, 3/S–M).
- **H7. Per-kind lore-entry content templates** (writers-workbench P1, 4/S). Location/item/faction/history/concept/scenario sections;
  keep a patchable "Current state" paragraph, secrets out of shared lore. → new guide topic, wizard prompt, `st-lorebook-authoring`.
  Character behaviour prompts "When X, they do Y" (P2, 3/S) → Build a character.
- **H8. Grader hygiene + adversarial probes** (characterbench P1–P3). Word-boundary matching (see B2), false-memory / persona-pressure
  extractor fixtures (the player-claim guard covers only `evidence_from` qualities, not facts; 4/M), noise-aware arm-vs-arm
  (stable/flaky/new) reporting (3/S). → 24/35 test plans.
- **H9. Curator write safety** (worldinfo-workspace P2–P3). Content baseline on `rewrite` (see B15) and an auto-mode guard sending a
  rewrite that removes >50% of words to review (3/S). Idempotency receipt on written entries so a resumed write lands once
  (st-memory-books P2, 3/M).
- **H10. Withhold per-turn blocks on quiet/impersonate** (copilot P1, see B10); compaction accepted only if it parses and is shorter
  than its inputs (copilot P2, 3/S); swipe-back reuses the stored read instead of re-reading (P3, 2-3/M).
- **H11. Fresh-beat guard on relationship steps** (bb-vne P1, 3/S). Drop a repeated cause within N messages so a lingering mood
  doesn't step an axis every read; author-only per-axis breakdown (P2). → 51, life.
- **H12. Harness transport** (subscriptions). Status-code-only error classification (B4), served-model + refusal-is-final (B5), quota
  meters from in-stream events never login files (P2, 3/M). Their plugin copies CLI login files: anti-pattern for us.
- **H13. Recall/promise design gaps** (timeline-memory P1–P3, 3/S each). Quote lines carry `m=<id>` (a pledge said twice matches two
  spans); recalled spans get a time label; a message hidden at query time is not recall-eligible. → 42, 43, 47, 55.
- **H14. Meanwhile due on elapsed story time** (multihog P1, 3/S) → fold into plan 50 B1a. "Lasting identity, not scene events" rule
  for curator creates and the plan 52 codex (P3, 2/S).
- **H15. "Your move" HUD chip** (dynamic-response P1, 3/S). Derived from the talk decision that hands the turn back + objectives that
  need the player's act; derive, never store (P3).
- **H16. Small ones**: possession rules "omission is not loss" (bb-map P3); accepted-uncertainty memo keyed by identity
  (bb-map P2); pause ST Summarize while a secret is held via getter/`toJSON` trick (dooms P1, 3/S; not Vector Storage); structural
  name fold for ledger/epistemic keys (dooms P2); anti-limbo line in `CHECK_OUTCOME_HEADER` (filigree P2); chance-ramp pressure
  trigger (filigree P1 → 49 G17); last-word request rewrite via payload `toJSON` (nemopresetext P1, see B8); Nemo rows in
  `extensionConflicts.ts` (Nemo ≥6.0.9 rewrites multiword WI keys to regex); director tag canonicalisation vs Danbooru vocabulary
  (booru P1, measure first); read-back after wizard creates + "host ok, readback unavailable = unconfirmed" (nemo-plotlight P1,
  tavernary P1); stale-tab settings overwrite detection (creative-studio P3, worldinfo-workspace P7, writers-workbench P3).

Anti-patterns confirmed: Private Turns that audit before publishing (breaks "judge never blocks"); choice-bound "FORCED OUTCOME"
steering (breaks agency); game-owned opaque state blobs (valkyrie); popup/quiet-gen game bridges.

## Host facts learned (verify before relying)

- Lorebook Ordering v2.2.4: an entry removed from the scan's `entriesMap` for budget during recursion re-entered later passes and looped;
  fix sets `disable = true` on the scan-local clone. SO never removes scan entries, so unaffected (B19 refuted).
- WI save debounce is one global timer; any immediate save cancels it (worldinfo-workspace, B14).
- `saveSettingsDebounced` 1 s, no flush on unload (probablytoomanytabs, B3).
- Connection Manager `sendRequest` wraps failures as "API request failed" with the real error in `cause` (st-memory-books, B12).
- `generateRaw` mutates the prompt array it is given (characterbench). With `jsonSchema`/`json_schema` + `extractData`, unparsable
  output becomes `{}` silently (creative-studio, bb-vne). SO uses neither.
- Dry-run `Generate` skips interceptors (`script.js:4562`): payload goldens never see interceptor-side changes (chapter recall/fold,
  lore forcing). Coverage gap (simulation-blackboard).
- `generateRawData` fires prompt-ready events with `dryRun:false` and no GENERATION_STARTED; ST's EventEmitter swallows listener throws
  (copilot).
- ST skips `syncMesToSwipe` on swipe back, so a foreign rewrite is lost on swipe-left; ours syncs (recast).
- Click-to-edit: any click inside `.mes_text` opens the editor (an edit is a rollback for us); inline hosts on `.mes_block` are safe.
  Worth a guard test (rpg-companion).
- `updateChatMetadata` replaces the `chat_metadata` object: identity is no staleness check (bb-map).
- `setExtensionPrompt` position 0 = IN_PROMPT, depth ignored; branches copy `chat_metadata` at its current value (valkyrie).
- `stopGeneration()` always emits `GENERATION_STOPPED` with no args (filigree; our handling correct).
- `/api/chats/recent` silently drops unreadable chats (multihog).
- `is_system` is set by both `/hide` and summarizers; fingerprints can't tell them apart (timeline-memory).
- On a streamed reply the text is on screen before `MESSAGE_RECEIVED`; changing `mes` alone leaves it visible (dynamic-response).
- `doChatInject` loops 10000 depths; depth 9999 lands before the oldest sent message (tokensavingplugin).

## Leads not in the corpus

- Summaryception — github.com/Lodactio/Extension-Summaryception (named in Tavernary's data).
- Old threads below the cutoff that look relevant and were never cloned: Mnemosyne (context virtualization), Canonize, Inline Summary,
  CharMemory 2.0, StatefulLore, InnerLore, Mimir Engine, Merged World Tracker, Story Tracker, Smart Director for group chats.
  Metadata in the 2026-10-14 forum listing; no clone yet.

## Per-repo reports

Updated: st-memory-books, dooms-enhancement-suite, multihog-dnd-framework, nemopresetext, probablytoomanytabs, smart-memory, tavernary,
tunnelvision, danganronpa-sillytavern. New: simulation-blackboard, worldinfo-workspace, sillytavern-copilot-p3dra, bb-interactive-map,
bb-visual-novel-engine, characterbench, creative-studio, tokensavingplugin, dynamic-response, sillytavern-subscriptions, filigree,
writers-workbench, valkyrie-crusade-rebuild, nemo-plotlight, persona-sync, booru-autocomplete. Second look: st-gamemaster, recast,
rpg-companion, timeline-memory.
