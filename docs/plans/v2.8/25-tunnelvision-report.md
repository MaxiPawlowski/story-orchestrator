# Plan 25 report — TunnelVision re-harvest (upstream @ `a01d7ee`)

**Run 2026-10-07, docs only.** Plan: `25-tunnelvision-pattern-harvest.md` (all Recommended answers). Nothing in `src/`
changed; every candidate row below is a proposal that changes a consumer plan only by the user's decision.

## Pins

| What | Value |
|---|---|
| Upstream | `Coneja-Chibi/TunnelVision` @ `a01d7ee` (2026-08-20, "Merge pull request #49 … sidecar-referer-origin"), 117 commits, `main` |
| Corpus clone | `C:\dev\st-extensions-research\tunnelvision-fully-autonomous-and-easy-lorebook\source` (shallow, 101 files, ~31k lines JS) |
| Baseline | `source-mirror/` @ `da28e58` (2026-03-06), untouched |
| Provenance | **resolved**: `da28e58` is an ancestor of upstream `a01d7ee` (`git merge-base --is-ancestor`), so the v2.4 mirror was the author's own history, not a re-upload. Repo URL matches the forum post |
| Commit log | read from a blob-less bare clone in the session scratchpad (not kept); long bodies quoted by hash below |
| Licence | AGPL-3.0 (`source/LICENSE`), same as ours. **Patterns only**; no code was or should be copied without a named decision in a consumer plan |
| Derivative | `ExtensionMuncher/TheLibrarian` @ `c012a0f` (2026-07-07), cloned to `…\thelibrarian-source`; **no LICENSE file** (all rights reserved by default): patterns only |
| ST host checked | `C:\dev\SillyTavern-MainBranch` @ `7c3994196` (2026-09-14) |
| Open PRs | not read (decision 3) |

## Mirror → upstream diff (`git diff --no-index source-mirror source --stat`: 112 files, +35,349 / −1,086)

| Class | Modules |
|---|---|
| New: sidecar (own LLM endpoint) | `llm-sidecar.js` (368), `sidecar-retrieval.js` (656), `sidecar-writer.js` (1381) |
| New: post-turn background | `post-turn-processor.js` (1697), `world-state.js` (770), `memory-lifecycle.js` (1153), `arc-tracker.js` (194), `smart-context.js` (1685) |
| New: lore quality | `entry-protection.js`, `entry-scoring.js` (436), `embedding-cache.js` (350), `world-info-attribution.js` (33), `conditions.js` (230) |
| New: summaries | `summary-runner.js`, `summary-hierarchy.js`, `summary-collapse.js` |
| New: turn handling | `turn-classification.js` (89), `message-identity.js` (225), `background-events.js` (345) |
| Refactor of v2.4 files | `index.js` (now 1251), `tool-registry.js`, `tools/*`, `tree-builder.js`, `tree-store.js`, `ui-controller.js` (2729), `prompt-injection-service.js` (split out), `feed-ui/` |
| Tests | `tests/` 37 vitest files + ST module mocks via `resolve.alias` (`vitest.config.js:7-25`) |

Commit themes worth reading (bodies are design notes): `cd2538b` OOC read-only turns; `839f683` stop cancels a
pre-gen retrieval *and* the reply; `4928978` swipe tail excluded from pre-gen reads; `5bbac2c` dedup metric/threshold
mismatch; `1fbce48` circuit breaker that latched off; `19596c7` swipe detection by type, UID 0 falsy, writer
re-entrancy; `adab03c`/`ac9c7ed`/`4f22134` summaries as constant entries, collapse, group-greeting floor; `d5db4cf`
four subsystems were dead code until settings were wired; `d67b7f0` sidecar leaked the user's ST origin to OpenRouter.

## Thesis check

v2.4 called TV "philosophically opposite" (main model writes mid-generation). Upstream now has **both** shapes:

- The v2.4 shape is still there and still the default product: eight function tools, mandatory "you MUST call a tool"
  injection (`index.js:1097-1126`), keyword suppression at `WORLDINFO_ENTRIES_LOADED` (`index.js:696-733`).
- **Sidecar retrieval runs ON the reply path.** It is awaited inside `GENERATION_STARTED` (`index.js:1088-1094`) with a
  90 s timeout (`constants.js:591`). ST awaits every listener (`public/lib/eventemitter.js:144-152`) before building
  the request (`public/script.js:4299`), so retrieval latency is reply latency. It is read-only.
- **Sidecar writer, post-turn processor, world state, lifecycle run AFTER the reply** on `MESSAGE_RECEIVED`
  (`index.js:222-236`, `1167-1235`), non-blocking for that reply, but they write lorebook entries **immediately**,
  not at a later boundary, and the next generation reads them.
- So: closer to ours than in v2.4 (an off-path writer, per-turn snapshots, swipe guards), but it keeps two things we
  refuse: a model call that blocks the reply, and writes that apply before the turn is settled.

## v2.4's eight ideas, re-checked

| v2.4 # | Then | Upstream now | Our state now |
|---|---|---|---|
| 1 scan-time WI gating | TV splices at `ENTRIES_LOADED` | unchanged (`index.js:696-733`), plus "native injection" books pass through (`:713-716`) | built: v2.4 05 scan spike, `storyLore.ts`, `requirementsRead.ts` |
| 2 exclusive lore-select | idea | unchanged | built: v2.5 08 L5 `loreExclusive.ts` |
| 3 tool-call turns | TV makes every turn one | now counts recursion depth (`index.js:1024-1036`), strips tools on the final pass in `CHAT_COMPLETION_SETTINGS_READY` (`:942-966`; ST emits it with the mutable request, `openai.js:3146`), clears orphan `tool_invocations` (`:834-862`) | open: v2.7 15 (SP10) |
| 4 foreign scan-filter Repair | idea | still splices non-constant entries of TV books | **absent**: `grep -i tunnelvision src` = 0 |
| 5 trigram near-dup | TV warn-only 0.85 | **TV abandoned it as broken** (`5bbac2c`, see P6) | we shipped the broken version (`createCandidate.ts:5`) |
| 6 category digest | tree | tree (+ TheLibrarian's simpler two-tool index) | no change; no |
| 7 main-model tool writes | present | present, plus OOC suppression (`turn-classification.js:72-89`) | we avoid |
| 8 global host mutations | `RECURSE_LIMIT`, `/profile` swap, `hideChatMessageRange` | `RECURSE_LIMIT` still overwritten (`index.js:1237-1246`, ST `tool-calling.js:255` static); **`/profile` swap gone** (grep 0; now `generateRaw`/sidecar); hide still used, now with a collapse UI (`summary-collapse.js`) | we avoid |

## New patterns (rubric)

| # | Pattern | kind | our area | our state | invariant fit | value | effort | destination | evidence (TV @ `a01d7ee` / ST @ `7c3994196`) |
|---|---|---|---|---|---|---|---|---|---|
| P1 | Near-dup metric must match its threshold: trigram Jaccard 0.85 never fires on reworded duplicates; split thresholds (cosine 0.85, trigram 0.6), prefer embeddings, `redirect` mode returns the match instead of writing | anti-pattern (ours) → fix | stagecraft | **present, broken** | curator proposes only (strengthens review) | 5 | S | **v2.8 11** (near-dup warning row; fixture rev 2 gets a reworded-dup case) | `5bbac2c` body ("one book grew from 16 to 31 entries"); `tools/remember.js:196-240`; ours `src/stagecraft/createCandidate.ts:5,71-92` |
| P2 | Swipe tail excluded from pre-generation reads: on `Generate('swipe')` the rejected reply is still `chat[last]`; ST drops it only from its own `coreChat` | host-integration | lore scan, talk director, scene read | **likely defect, verify** | rollback ≡ replay (a swipe should read what a fresh turn reads) | 4 | S | **v2.7 02** carry-in (a jest case on `recentWindow` for type `swipe`) | `4928978`; `sidecar-retrieval.js:118-150`; ST `script.js:4497-4499`, `10318-10319`; ours `src/runtime/index.ts:129-135` reads `getContext().chat`, used by `wiring/lore.ts:66,113-116`, `wiring/judgeScene.ts:35`, `wiring/talk.ts:26` |
| P3 | OOC turns read but never write: marker classifier (first token `OOC`, wrapped forms, bare brackets excluded), pending `#send_textarea` checked because `GENERATION_STARTED` precedes the copy into `chat`; four write paths suppressed | pattern | turn bridge, extraction, memory | **absent** (`grep -i ooc src` = 2 unrelated files) | reply path never writes (adds a "this turn writes nothing" class) | 4 | S | **new seed** (v2.7 or v2.8 01): OOC turns skip extraction deltas/facts, boundary still commits; judge use only for unmarked asides and only behind a measured floor | `cd2538b`; `turn-classification.js:17-53`; `index.js:1038-1046`, `1171-1186`; ST `script.js:4299` vs `4401-4403` |
| P4 | Stable message identity on the message object + full-content fingerprint, three-valued origin lookup (`valid / invalid / ambiguous`, ambiguous is **kept**, never guessed) | pattern | turn bridge, rollback | partial (we key by index + `{lastMessageId, chatLength}`) | rollback (catches `/cut` and edits without an event) | 3 | M | v2.7 15 (tool turns shift indexes) or no; candidate only | `message-identity.js:1-9,103-118,180-225`; ST swipe keeps top-level fields, copies only `send_date/gen_*/extra` (`script.js:6787-6809`) |
| P5 | Static (constant) entries refused by every background writer; explicit tool calls exempt | pattern | stagecraft (C13) | partial (we refuse checkpoint-gated entries + `so:protect` spans) | curator proposes only | 3 | S | **v2.7 02 C13** (author decision: should a curator op on a `constant` entry default to review even in `auto`?) | `2916301`; `entry-protection.js:15-17`; `entry-manager.js:69-76`; `memory-lifecycle.js:485,681,742,802,898` |
| P6 | A second background writer on the same book (TV memory-lifecycle consolidate/compress) ignores our content markers and could rewrite a `{{// so:protect}}` span | host-integration | repair / health | absent | curator tiers | 3 | S | **v2.7 04** health check: a story book TV-enabled (`extension_settings.tunnelvision`) → `degrades` finding naming both scan suppression (v2.4 #4) and foreign rewrites | `memory-lifecycle.js:1-17,681-760`; v2.4 report #4 |
| P7 | Origin stamp on a created entry so cleanup can find it from the book itself (chat-scoped id + message id + fingerprint) | pattern | stagecraft create | partial (`extras.stagecraft.created` only; mirror books carry `so-owner`) | rollback | 3 | S | **v2.8 11** (stamp a create with a `{{// so:created <chat>:<boundary>}}` content marker, ST strips it before any prompt; never a fake key, which TV uses and which scans as text) | `message-identity.js:126-128`; `sidecar-writer.js:343-455` |
| P8 | Per-turn snapshot + revert of background writes on swipe/delete/chat-change, persisted in `chat_metadata`, cap 20, **blind restore** (no compare-and-set), keyword-scan fallback | anti-pattern (partial) | stagecraft, effects | we do better (ledger CAS, `revertAppliedSince`) | rollback | 2 | — | v2.8 11 confirms its design (delete under CAS); no new row | `sidecar-writer.js:66-283`; `post-turn-processor.js:1516-1560` (last run only) |
| P9 | Stop during a blocking pre-gen read cancels the read **and** the reply via `generate_interceptor` `abort(true)`; a cancel never counts as a breaker failure | host-integration | lore select, judge | partial (`loreAborted.review.test.ts`) | judge never blocks | 2 | S | v2.7 15 (record the host facts); no new row | `839f683`; ST `script.js:4299-4304` (controller replaced after the emit), `extensions.js:2024-2048`, `script.js:4563-4569`; `eventemitter.js:144-152` swallows listener throws |
| P10 | Circuit breaker that latched for the page session; fixed with cooldown + half-open probe; cancel ≠ failure | anti-pattern → fix | extraction | **we do better** (`extraction/breaker.ts`, backoff probe `scheduler.ts:348-362`) | — | 1 | — | no | `1fbce48`; `llm-sidecar.js:55-95`; `constants.js:569,578` |
| P11 | Rolling world state as one free-text markdown doc (Current Scene / Off-Screen / Pending with deadlines / World Pressures / Momentum), validated by header presence, one-level `previousText` undo, written by `generateQuietPrompt` | anti-pattern (store); checklist (content) | director, memory | we avoid (typed blackboard, ledger, canon) | rollback, reply-path quiet nesting (v2.4 01 T6) | 2 | S | **v2.8 22** + v2.7 37 L3: use the section list as an input checklist (off-screen actors, pending obligations, pressures) for the director/agenda read models; never the doc | `world-state.js:31-110,113-140,497-503,748-770` |
| P12 | LLM-evaluated conditional keys on WI entries (`[mood:tense]`, `[!location:x]`) judged by the sidecar before each reply | anti-pattern (blocking) / authoring vocabulary | lore scan | we avoid (gates over typed qualities in code) | reply path never blocks | 2 | — | no; v2.7 37 L2 mood as a typed enum covers the need | `d6cba9e`; `conditions.js:18-60`; `sidecar-retrieval.js:153-256` |
| P13 | Smart context: pre-gen local scoring with a re-injection cooldown, regex "phase" (combat/dialogue/…, English-only word lists), and a "was the entry referenced in the reply" feedback map in `chat_metadata` that never rolls back | pattern (cooldown) / anti-pattern (feedback) | lore select | partial | rollback (feedback is unrollbackable and self-reinforcing) | 3 | M | **v2.8 21** (smart-context harvest): take cooldown, refuse feedback-by-substring and regex phase | `smart-context.js:300-360,860-930,1292` |
| P14 | Summaries as `constant` entries (a keyword summary that fails to fire loses the scene); group floor = first user message so every greeting survives; `keepRecent ≥ 1` so a summary never covers the live scene | pattern | chapters (v2.6 07) | partial (we never hide chat; compaction stops at `readCoverageEnd`) | rollback | 2 | S | v2.8 01 §F (chapter seals): add "every group greeting outside the first sealed range" to the seal input test | `adab03c`, `4f22134`; `summary-runner.js:20-60` |
| P15 | Hide summarized chat (`is_system = true`) and fold it behind the summary marker so screen matches prompt | anti-pattern (for us) | — | we avoid (never mutate chat) | — | 1 | — | no | `ac9c7ed`; `summary-collapse.js:1-30`; ST `chats.js:147-169`, `script.js:1821-1824`, `4496` (`coreChat` filters `is_system`) |
| P16 | Background task registry with cancel and "retry failed" from the feed | UI | author view / health | partial (pipeline signal, journal) | — | 2 | S | v2.7 04 (a retry action on a failed-pass finding) | `background-events.js:210-260` |
| P17 | Scoped WI attribution stack for scans caused by background generations | pattern | lore evidence | **we do better** (`LoreEvidence` counts loud scans only via `innermostType`); TV's stack has **no reader** outside tests (grep) | — | 1 | — | no | `world-info-attribution.js:10-33`; callers `post-turn-processor.js:785,861,1033`, `world-state.js:501` |
| P18 | Sidecar = direct browser `fetch` to a provider with the API key in `extension_settings` (plain, page-readable); leaked the ST origin as Referer to OpenRouter until `d67b7f0` | anti-pattern | judge / models | we do better (keys only in the judge plugin / CM profiles) | privacy | 1 | — | no | `llm-sidecar.js:97-112,153-255`; `d67b7f0` |
| P19 | Group chat writer debounced 800 ms after the last `MESSAGE_RECEIVED` | anti-pattern | extraction cadence | we do better (boundary per rendered reply, cadence) | — | 1 | — | no | `index.js:1199-1215` |
| P20 | SECRET tag in entry content (`[SECRET — X is unaware]`) + a guard line, documented as **not** privacy control | pattern (honest) | memory privacy | we do better (per-member private blocks, `heldSecrets.ts`) | privacy per member | 1 | — | no | `145c500`; `shared-utils.js:282-305` |
| P21 | Four subsystems shipped dead because their settings keys were never written (`d5db4cf`) | testing lesson | registry | present (our feature registry + `checksRegistry.test.ts` catch it) | — | 1 | — | no | `d5db4cf` body |

### TheLibrarian (15-minute skim)

Two read-only tools (`librarian_view_index`, `librarian_read_entries`) over an LLM-built folder index; ST keyword
scanning untouched; index built through `ConnectionManagerRequestService.sendRequest` (`llm/connections.js:62`). One
pattern worth naming for v2.8 11 / v2.7 02 C13: each index summary carries `fp` (fingerprint of title+content),
`userEdited` ("NEVER overwritten") and `staleSummary` (the entry changed after a hand edit), so a derived artifact over
an authored entry is **flagged stale, never rewritten** (`data/indexStore.js:5-19`, `llm/indexBuilder.js:105-155`).
That is the right rule for any curator-maintained summary of an author's entry. No licence file: patterns only.

## Questions the plan asked

- **Sidecar on the reply path or after?** Retrieval: on it, blocking, up to 90 s (`index.js:1088-1094`,
  `constants.js:591`). Writer + post-turn + world state + lifecycle: after it, on `MESSAGE_RECEIVED`, writing at once.
- **Writes on swipe/edit/delete?** Swipe and delete: `revertInvalidSnapshots` + `cleanInvalidSidecarMemories`
  (`index.js:222-250`); edit has no listener, but the content fingerprint no longer matches, so the next scan (swipe,
  delete or chat change) reverts it (`message-identity.js:191-197`). Restore is blind, capped at 20 snapshots
  (`sidecar-writer.js:69,177-181`); world state keeps one previous version; the feedback map has no rollback.
- **Is world state typed?** No: a markdown document checked for nine headers (`world-state.js:113-140`).
- **How is OOC decided; would a judge do better?** A regex on the first token (`turn-classification.js:17`).
  Deterministic and explainable; a judge would only add value for unmarked asides, which TV deliberately does not
  catch ("suppressing writes on ordinary roleplay would be a worse failure", `cd2538b`). Recommend the marker first,
  no judge use.
- **`entry-protection` and `so:protect` on one book?** They coexist without conflict in our writes (ours refuse spans,
  theirs refuse whole constant entries), but TV's lifecycle compress/consolidate on a non-constant entry can drop our
  markers; that is P6's health check, not a code merge.

## Copy / avoid

Copy (as patterns):
- P1 metric-matched near-dup + `redirect` (return the match, write nothing) for the curator create card.
- P2 read what the next prompt will read: drop the swiped tail in every pre-generation window.
- P3 OOC as a read-only turn class.
- P7 origin stamp a created entry carries; TheLibrarian's `userEdited`/`staleSummary`.
- P13 cooldown on repeated injections; P14 group-greeting floor.

Avoid:
- Blocking model calls in `GENERATION_STARTED` (retrieval, conditional keys).
- Immediate background writes, blind snapshot restore, a fixed snapshot cap.
- Free-text state documents; substring "was it referenced" feedback loops; regex phase detection.
- Keys in page-readable settings; direct provider fetch from the page; time debounce for group rounds.
- Overwriting `ToolManager.RECURSE_LIMIT` (still done) and hiding chat to save tokens.

## ST host facts learned (new or re-verified)

- `GENERATION_STARTED` is awaited (`script.js:4299`); ST then replaces `abortController` unless a `signal` was passed
  (`:4302-4304`), and `EventEmitter.emit` catches listener throws (`lib/eventemitter.js:144-152`). Aborting ST's
  controller or throwing from the listener therefore cannot stop the request; only a `generate_interceptor` calling
  `abort(true)` does (`extensions.js:2024-2048`, `script.js:4563-4569`).
- On a swipe, `coreChat.pop()` drops the swiped message (`script.js:4497-4499`) after `GENERATION_STARTED`; the
  global `chat` still holds it, so any extension reading `getContext().chat` at that point reads the rejected reply.
- `Generate` copies `#send_textarea` into the chat after `GENERATION_STARTED` (`script.js:4401-4403`; v2.4 had `:4311`).
- `MESSAGE_DELETED` carries `chat.length` after the deletion, not the deleted index (`script.js:1611,1699,4411,11734`).
- Swipe bookkeeping copies only `send_date`, `gen_started`, `gen_finished`, `extra` into `swipe_info`
  (`script.js:6787-6809`); unknown top-level message fields stay on the message across swipes.
- `hideChatMessageRange` sets `message.is_system` and saves (`chats.js:147-169`); `coreChat` drops `is_system` messages
  unless they carry `tool_invocations` (`script.js:4496`); hidden non-system messages still render markdown
  (`script.js:1821-1824`).
- `CHAT_COMPLETION_SETTINGS_READY` passes the live request object (`openai.js:3146`), so `tools`/`tool_choice` can be
  edited per request. `WORLDINFO_ENTRIES_LOADED` still emits at `world-info.js:4604`.

## Candidate rows per consumer (proposals)

| Consumer | Row |
|---|---|
| v2.8 11 curator create | (a) replace the 0.85 trigram warning: ST vectors bands where present (we already read 0.82 / 0.55 in consolidation), else trigram with a threshold declared on fixture rev 2 before any run; (b) a `redirect`-style refusal card "this looks like X: patch X instead?"; (c) a reworded-duplicate case in fixture rev 2; (d) a `so:created` content stamp on applied creates |
| v2.7 02 carry-in | P2 swipe-tail jest case for `recentWindow` (lore select, scene read, talk director); fix if it fails |
| v2.7 02 C13 | P5 author decision: constant entries default to review in `auto` mode |
| v2.7 04 health center | P6 "story book managed by TunnelVision" `degrades` check (scan suppression + foreign rewrites); P16 retry action |
| v2.7 15 SP10 | record TV's recursion handling and the interceptor-abort facts as host facts; P4 if indexes shift under tool turns |
| v2.8 21 smart context | P13 cooldown in, feedback/phase out |
| v2.8 22 director, v2.7 37 L3 | P11 section checklist as read-model inputs (off-screen, pending, pressures) |
| v2.8 01 §F chapters | P14 greeting floor case |
| new seed | P3 OOC read-only turns |

## Run record

See plan 25 §Run record.
