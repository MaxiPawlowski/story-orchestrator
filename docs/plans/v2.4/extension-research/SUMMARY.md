# Community extensions review — v2.4 input

## Method

- Corpus: 55 community extensions from `C:/dev/st-extensions-research` (forum posts + shallow clones; cutoff ≥50 upvotes / ≥400 messages, see that repo's `FORUM-INDEX.md`). Date 2026-09-23.
- One reviewer per repo. Each read the source (or `post.md` only where no source existed: character-style-customizer; blazetracker's clone is actually WTracker; vecthare reviewed from an unverified fork mirror) against `_baseline.md` (SO v2.3.0 capability inventory, 22 invariants, known seeds).
- Per repo: ideas with kind/area/value(1-5)/effort(S/M/L)/our state/evidence/invariant conflict, plus host facts found in ST source. Per-repo detail: `./<slug>.md`.
- This file dedupes ideas across repos into themes, ranks a top 20, maps onto `docs/plans/v2.3/v2.4-seeds.md`, and consolidates host facts.
- Synthesis spot-checks (read-only, 2026-09-23): `ST public/script.js:1611,1699` (MESSAGE_DELETED = post-delete `chat.length`), `public/scripts/extensions/shared.js:415,424` (`custom.signal`), `public/scripts/bookmarks.js:201` + `public/script.js:7406` (branch metadata merge), `src/runtime/runOwner.ts:60-62`, `src/runtime/turnBridge.ts:159-170`, `src/services/stHost/events.ts:11-12`, `src/runtime/persistence.ts:44-74`, `src/runtime/roster.ts:30-41`, `src/runtime/runtimeManager.ts:430-436`. All matched the reviewers' claims.
- Top ideas were adversarially verified in a separate pass (2026-09-23): 20/20 verified, 20 kept. See `## Verification`.
- **Added after the verification pass (2026-09-23):**
  - **Jeved** (`./jeved.md`): a source review of the only other ST client of TypeSafe Jev, the model behind our judge.
  - **Four Reddit threads on Jev/Jeved** (`./reddit-jev-threads.md`): 218 comments archived from `api.pullpush.io`. The two Jeved post bodies the archive lacked (1wl7uje, 1wmoluu) were supplied by the user's paste on 2026-09-23 (`C:/dev/st-extensions-research/_reddit-jev/user-pasted-2026-09-23.md`) and folded in. The paste also added one comment and one longer comment the archive lacked. Commenter and OP claims were checked against our `src/` and the v2.3 calibration docs, not against the network.
  
  These sources feed theme §11, `## Community signals (Reddit, Jev)` and T21–T25. **None of that was adversarially verified**, and the totals below exclude them.

## Verification

The adversarial pass ran on 2026-09-23 and verified all 20 top ideas, four per verifier. It was read-only: their source in `C:/dev/st-extensions-research/<slug>/source`, our `src/`, and the invariants in `_baseline.md` and `.claude/rules/architecture.md`. Result: **20 kept, 0 rejected.** Corrections were folded into the Top list below:
- Our state downgraded from absent to partial: T2, T9, T12.
- Scope or severity narrowed: T10, T14.
- Mechanism corrected: T3, T4, T5, T8.
- Source only half-supports the idea: T15.

Refuted claims in the per-repo reports carry a `> Verification note:` line at the top of the file: chat-top-info-bar, multihog, rememory, prome, flowchart, st-copilot, st-gamemaster.

T21–T25 (Jeved + Reddit) were added after this pass and are **not** in the table below. Each carries its own "unverified" line. T21 was later verified separately and CONFIRMED (see its entry).

| id | title | source claim holds | already have | invariant conflict | kept | notes |
|---|---|---|---|---|---|---|
| T1 | Decode MESSAGE_DELETED correctly | yes | no | none. Restores inv 11. The snapshot is in-memory, so no blob change | yes | Every ST emitter passes the post-delete `chat.length` (`script.js:1611,1678-1699,4411,11734`). A middle splice can span tool-call messages, so count>1 is real. st-memory-books `memoryRollback.js:65-140` is confirmed; the UIE diff handles only a single delete. Ours: `turnBridge.ts:56,159-170` → `rollback.ts:35`, and the turnKeys purge at `:165` uses the same wrong key. The stable id must include `is_system` + `swipe_id`. Refresh the snapshot on render/edit/swipe and on CHAT_CHANGED keyed by chatId. An ambiguous diff takes today's path and is journaled |
| T2 | Story follows an ST branch/checkpoint | yes | **partial** | Adoption stays explicit (V5). No blob bump, because `main_chat`/`integrity` are ST keys. The slot unbind is a host write, so it needs a WriteResult (16) and ownership (10) | yes | A branch merges the full metadata (`bookmarks.js:201,230-233`, `script.js:7406`, `group-chats.js:2370`); a checkpoint does the same at `bookmarks.js:284`. The fresh mirror on adoption ALREADY exists (`memoryMirror.ts:82-88,122`). Missing: the parent mirror stays bound in an unadopted branch; no rollback to the branch tail on adopt (`runtimeManager.ts:524-543` has no chat-length reconcile); no "continue from branch point"; the wrong doc line `docs/plans/v2.3/03-async-ownership.md:2715`. Verify that `main_chat` string-equals our `blob.chatId` stamp (solo `sessionName` vs group `chat_id`) |
| T3 | Content fingerprints of consumed messages | yes | no | Blob bump + migration (13). Hash in the runtime (1). Legacy boundaries are unknown, not a mismatch | yes | `messageEditMove` (`script.js:8353-8395`) and `hideChatMessageRange` (`chats.js:147-169`) emit nothing. `engine.ts:11-14` has no content identity, and `runOwner.ts:20-22,100-104` is a counter, not a hash. The proposed hash (mes+is_user+name+swipe_id) **misses `/hide`**: add `is_system`, or drop /hide from the claim. The continue path (`turnBridge.ts:24-29`) must re-fingerprint rather than read as a mismatch. Sequence after T1 |
| T4 | Abortable, time-bounded memory-model calls | yes | partial | None, if the RunToken check stays at every write edge (10) and a lapsed abort never pauses extraction | yes | Evidence: `shared.js:411,420,458,478`, also in 1.18.0 (a7d48b1ae, 2025-03-26); errors are wrapped at `:487-489`. Only `stHost/judge.ts:46-63` wires abort, and extraction has no timeout at all. **`RunOwner.signal()` aborts only on `bump()`** (`runOwner.ts:80-83`) and `noteMutation` (`:100-104`) aborts nothing, so cancelling on rollback needs a per-read controller. A TimeoutError counts as failed, an AbortError as lapsed. `runWithRetries` (`scheduler.ts:213-224`) must short-circuit on abort. The backlog has no cancel (`DrawerTabs.tsx:256`, `extractionCoordinator.ts:383`) |
| T5 | A transient read failure never disables extraction install-wide | yes | partial | None; it removes an inv-13 smell. Events go through `events.ts` keys (2). Keep the breaker out of the manager (676/700, 18) | yes | `runtimeManager.ts:432-439` writes `extraction.enabled=false` after 3 attempts (`scheduler.ts:176-181,213-224`). There is no auto-resume, and `repair.ts:28` misses a dangling profile id. **Content failures mostly do not throw** (parse rejects lines; the only throw is `client.ts:13`), so the split is transport vs config vs code bug. Sources confirmed: bettersimtracker `extractionFailurePolicy.ts:13-15`, statsuite `api.ts:13-56`, roadway `index.ts:111-118` |
| T6 | One-turn blocks survive foreign/nested/quiet generations | yes | no | None. Enforces 16 at the lifecycle level and keeps 15 | yes | A nested `generateQuietPrompt` ENDS (`script.js:3532-3536,7075-7079`) before the outer prompt is assembled (STARTED `:4299`, AFTER_COMMANDS `:4321`). Ours: `runtime/index.ts:189` runs unconditionally; a quiet STARTED clears the epistemic block (`runtimeManager.ts:635`, `memoryCoordinator.ts:482-484`); every ENDED clears private/nudge/warden (`:636`); the warden op is marked applied at STARTED (`stagecraftCoordinator.ts:456-466`); a `{source}` payload spends the note; a nested force_chid sets `pass.forced` (`talkControl.ts:87-89`); capturePayload and the talk hook do not skip dry runs |
| T7 | Extraction window hygiene | yes | no | None, if the prompt, `evidenceInWindow` and the stored evidence all read the SAME cleaned text (4). The regex seam is a new capability-probed `stHost/regex.ts` (2). Re-run the live suite and goldens | yes | `chatWindow.ts:6-14` passes raw `mes`; `scoreContext.ts:13` and `stagecraftCoordinator.ts:61-62` also read raw text. `stripReasoningBlocks` applies to output only. `/sd` posts can be visible (`stable-diffusion/index.js:4982-4985`); the `extension` type is dropped from boundaries only. Stripping `<details>` can remove author content, so the cleaner needs its own fixtures |
| T8 | Save evidence for install-wide writes + self-healing save watcher | yes | no | None; extends 17. It lives in `stHost/persistence.ts` + the stores, not the manager | yes | `saveSettings` swallows errors (`script.js:8052-8114`), and SETTINGS_UPDATED fires only on ok. src never uses SETTINGS_UPDATED or settings/get. **The watcher loss is a race, not constant.** It happens only if our lazy first install lands inside a peer's wrap window (DES around `generateRaw`, near the first boundary persist). Then the outcome is `unsaved` and sticky (`saveEvidence.ts:44-51`, `saveHealth.ts:22-31`), and `effectsApplier.ts:185` refuses every effect |
| T9 | Request-size bound: token chunker + whole-scene summaries | yes | **partial** | None blocking. Each chunk needs its own derived range (11). Map-reduce fits summaries, **not DELTA reads** (4: only memorize:full may move the blackboard; latest-wins; evidence per chunk window) | yes | The backlog is already windowed by message count (`extractionCoordinator.ts:383-414`, windowSize 8). Only the final `memorize:full` is unbounded (`:428`). The scene summary reads only the detecting window (`:288-306`). `countTokens` exists (`stHost/tokenizer.ts:3`) but is unused for requests. An unknown limit should fall back to a declared default and be reported, **not fail closed**. This is seed D |
| T10 | Active speaker skips system/comment/image messages | yes | no | none | yes | `/comment` posts as `Note` with `is_system:true` (`slash-commands.js:6113-6129`); group `/sd` posts use `systemUserName`. **Solo is unaffected** (`roster.ts:10-21` returns null there anyway), and drafted members bypass the bug (`memoryCoordinator.ts:457-463,486-497`). Real impact: the group public facts block without the capability profile (`:448` → `inject.ts:27`), the `onMemberDrafted` fallback `:494`, the `story_epistemic` macro and `getEpistemicBlock` (`:405-406`), and the preview (`:503`). A live probe is still needed |
| T11 | Downgrade guard + declared host minimum | yes | no | None. Completes 13 and reuses the V5 detached read | yes | `persistence.ts:44-56` → `persistenceMigration.ts:20-23` returns null, and `createBlob()` is written over it (`:69-72`). ST enforces `minimum_client_version` (`extensions.js:580-590,658-660`), and the README declares 1.18.0. The library and wizardSessions have no schema version, so stamping them is a follow-up. The host evidence is ST `extensions.js`, not probablytoomanytabs |
| T12 | WI activation evidence | yes | **partial** | A new stHost module plus a WORLD_INFO_ACTIVATED key in `events.ts` (2). Author-only (9), trimmed on rollback (11), never writes WI (14/6) | yes | ST emits only for non-dry, non-empty scans (`world-info.js:900-903`). Forced entries still pass probability/budget (`:4885-4888,5043-5064`). `resetExternalEffects` runs at the end of every scan, dry ones included (`:5275`). The product has no subscriber (`worldInfoActivate.ts:18-26` returns `wrote()` on emit); the probe logic already exists in the harness (`scripts/debug/so-lore-probe.mts:10,20,37`). Forced≠landed matters only with judge loreSelect on. Flag only constant/forced misses, because keyword gating often legitimately does not fire. Repair is player-visible, so use player-safe wording |
| T13 | Spike: checkpoint WI gating at scan time | yes | no | None hard, but the inv-14 wording needs revising (path replay is kept). Two gaps: (1) reproduce the release for chats playing NO story (disable every library gated set at scan time; today `runtimeManager.ts:231,546,607`); (2) normalise once the flags already written to files | yes | ST builds shallow per-call copies (`world-info.js` ~4535), the scan honours `disable` (`:4801`), and the result is cloned (`:4639`). The vectors extension sees the same view (`vectors/index.js:1629`), and so does our LoreSelector (`worldInfoActivate.ts:10-13`). WORLDINFO_ENTRIES_LOADED is typed but unsubscribed (`events.ts:32`) |
| T14 | Mirror book lifecycle and hygiene | yes | no | Reaping is destructive, so it needs a confirm + WriteResult (16). Giving scene rows keys would double-inject | yes | Payloads confirmed (`script.js:1354,1401,10884`, `group-chats.js:1334,2269,2308`, `world-info.js:4160`); there is no reaper. **The leaked book is NOT global/active**: `ensureLorebook` does not activate it (`worldInfo.ts:116`) and only the chat slot is bound (`memoryMirror.ts:122`), so it is an inert orphan file (clutter). Scene history is already injected (`injectionRegistry.ts:17` memorySceneHistory), so **stop mirroring scene rows** rather than keying them. Citations fixed: chatsplus :2920-2960 is character delete; rememory keyed entry `:113-128`, name strip `:283-288` |
| T15 | Speaker-aware evidence + "player writes attempts" clause | yes, steering half only (the evidence rule is ours) | no | Tightens 4. `evidence_from` is a schema addition, so it needs a storyDiff row + DIAGNOSTIC_CONSEQUENCES. A default-on clause is a C4 behaviour change, so ship it off | yes | st-gamemaster `prePass.js:79` and `injection.js:109-114` rewrite the attempt for the main model; they do not gate evidence. `chatWindow.ts:12` loses `is_user` when a name is set. `evidenceInWindow` (`evidence.ts:46-60`) returns a bool and must return the matched message. Apply the rule to `judge/extraction.ts` too, or gates diverge by path |
| T16 | Default checkpoint objective block + AN-inheritance diagnostic | yes | partial | A registry entry (so the preview sees it) that refreshes its own injection (16) and has a depth-collision allowlist entry. Default-on doubles the objective where the AN already restates it, so decide the default | yes | superobjective `index.js:464-478`. The macro reaches the model only if the author places it (`macros.ts:7-11,42`). There is no objective registry key (`injectionRegistry.ts:12-23`). The pacing hint appears only when drifting (`pacingCoordinator.ts:99`, `steering.ts:47-56`). **`checkpoint.guidance` has NO runtime consumer**, whether authored (`schema.ts:156`) or generated (`merge.ts:29`). The AN is inherited unless explicitly null (`effectsApplier.ts:55-70,222`). There is no such diagnostic (`diagnostics.ts:13-35`) |
| T17 | Curator hardening bundle | yes | partial | None. Inv 6 is untouched (`isCuratorWritable` at `stagecraftCoordinator.ts:278`) | yes | The prompt shows 400 chars but allows a full `[rewrite]` (`prompt.ts:3,13,32`), and `previewCuratorOp` never compares lengths (`proposal.ts:53-57`). The prefix fallback retargets (`parse.ts:15-20`). The uid is recorded after resolution (`stagecraftCoordinator.ts:291-294`) but never used to address the entry. There is no rejected-op memory (`:137-187`) and no diff (`StagecraftPanel.tsx:92-96`). The patch is already case/whitespace tolerant (`proposal.ts:3,13-20`), so "auto stays exact" means keeping today's tolerance |
| T18 | Per-pass profile routing | yes | no | None. Install-wide (13), per-request and never a global switch; the judge (7) is unaffected | yes | The single `extraction.profileId` (`settingsStore.ts:30`) feeds the director, curator, copilot, memory, extraction, expansion/critic and the live suite. Each role needs its own self-test (`selfTest.ts:158`) and Repair row (`repair.ts:28`). The live suite scores extraction only, so the director/curator/wizard need their own calibration, with no floor retuned. UIE is a weaker analogue (an endpoint, not a CM profile) |
| T19 | Author observability: next-turn cost/fate + provenance navigation | yes | partial | None. Author-only (9) and snapshot-fed (18); other extensions' prompts are read via stHost (2); `/chat-jump` goes through the slash seam | yes | `/chat-jump` exists (`slash-commands.js:3449-3490`). The preview shows characters only (`nextTurn.ts:23`). The `story_` filter hides other extensions' blocks (`promptInspector.ts:10,21`), despite the `nextTurn.ts:71-74` claim. `dropped` is discarded (`budget.ts:78-79` → `inject.ts:29`). The astraprojecta budget is CC-only; textgen needs its own verified max-context/response host facts. Build together with replan V19 |
| T20 | Host interop fixture corpus | yes | partial | None. Harness only (20); the live rows fold into queue L5 | yes | Coverage today: `so-turn-types-check.mts:10-21` plus 9 fault shapes, none of them a silent edit or reload. Delete-at-0 and a real edit are covered (`plan03a-*-rollback.json:71`); the null-id shape is already in live-v4-turn-identity. The event guard is preventive (all 17 subscribed keys exist today) and must accept keys OR values (`runtime/index.ts:198` subscribes the value `extension_settings_loaded`). Each shape needs a verified host fact first; the live rows are more than S effort |

## v2.3 carry-over (decided 2026-09-23)

**Decision (user, 2026-09-23): v2.3 is finished as planned. Nothing from this research goes into v2.3; every finding folds into v2.4.** No file under `docs/plans/v2.3/`, `.claude/`, `src/` or `test/` was edited for this research.

Some findings are defects against claims v2.3 certifies. They form the **first v2.4 bucket, "Carry-in"**, to be fixed before any new v2.4 feature. Until then, **read v2.3's acceptance claims with these caveats**. The v2.4 plan owns the corrections.

| Carry-in | Defect (see the T entry) | v2.3 claim it contradicts | What carries in |
|---|---|---|---|
| **T1** | MESSAGE_DELETED carries the post-delete `chat.length`, which `turnBridge.ts:56,159-170` decodes as the deleted id | **Plan 04, `rollback ≡ replay`.** The property test (`src/memory/rollbackReplay.property.test.ts`) proves the reversal is correct *for the id it is given*. On a middle delete or `/cut`, the host decode hands it the wrong id, so the certified invariant fails end to end: the tail is rewound and later provenance ids shift | The fix (T1, 5/S) |
| **T10** | After our own transition `/comment` (`is_system`, name `Note`) in a group, `activeSpeakerId` returns null (`roster.ts:30-41`) | **Plan 05, the per-member epistemic/facts block.** J5.6 was measured on the drafted-member path (`onMemberDrafted`), which bypasses the bug. Unmeasured and affected: the group public facts block without the capability profile, the `onMemberDrafted` fallback, the `story_epistemic` macro / `getEpistemicBlock`, and the next-turn preview | The fix (T10, 4/S) + the live group probe it names |
| **T6** | A quiet, nested or foreign GENERATION_STARTED/ENDED clears the private block (`runtimeManager.ts:636-637` at HEAD `fcc33cc`; T6's `:635-636` predates a one-line shift; `memoryCoordinator.ts:482-484`) and spends the warden note, which is marked applied at STARTED (`stagecraftCoordinator.ts:456-466`) | **Plan 05's private-block claim** (staged per drafted member, green live on J5.6) and **the warden-note claim** (one loud generation, carried once, J8.5/J8.6 green). Both hold only when no other extension generates inside the turn: Stepped Thinking, Guided Generations and any `generateQuietPrompt` user break them | The fix (T6, 4/M) |
| **T21** | The lore spike ranked the Score arm after `Math.round`, which manufactured its tie rate of 1.00; the raw Score ties 0.04 (verified, see T21) | **Plan 10's recorded lesson** that "a coarse Score scale ties more than a probability", and the seed "a finer scale". The verdict "Noul stays" survives on nDCG | Correcting every location already recorded under T21: `docs/plans/v2.3/10-judge-seeds.md:160-161,169-174`; the `.claude/CLAUDE.md` plan-10 paragraph; `.claude/rules/architecture.md:97`; `docs/plans/v2.3/v2.4-seeds.md:23-24`; `docs/plans/v2.3/11-acceptance.md:809`; `docs/plans/v2.3/recommended-config.md:38`; `src/judge/loreRelevance.test.ts:54` (asserts the artifact); the `src/judge/loreScore.ts:56` comment; and `_baseline.md:175-176` (**corrected 2026-09-23**, the one in-folder edit this decision allows) |
| **T4** | The comments at `src/runtime/runOwner.ts:56-62`, `src/judge/types.ts:65-68` and `src/runtime/epochAbort.review.test.ts:8-11` say `ConnectionManagerRequestService.sendRequest` "takes no signal (shared.js:423)" | **Plan 03's claim** that extraction calls "cannot be cancelled at the host at all". ST honours `custom.signal` (`shared.js:415,424,463,483`), in the pinned 1.18.0 too | Correcting the three comments and the plan-03 statement. Wiring the abort itself is ordinary T4 work |
| **T2** | `docs/plans/v2.3/03-async-ownership.md:2715` says "a branch does NOT copy our blob (`bookmarks.js:201`)" | **Plan 03 V5's** reasoning about foreign blobs. ST branches and checkpoints save `{...chat_metadata, main_chat, integrity}` (`bookmarks.js:201,284`, `script.js:7406`), so the blob and the chat lorebook slot do travel into the branch | Correcting the doc line. The branch feature itself stays an ordinary T2 item |

Everything else in this file (T3, T5, T7–T9, T11–T20, T22–T25, §11 and the Reddit ideas) is a normal v2.4 candidate, not a carry-in.

## Repo index

| Repo | One-line | Relevance | #ideas | Best idea |
|---|---|---|---|---|
| [AstraProjecta (Alpha)](./astraprojecta-alpha.md) | Mobile-first replacement frontend; exposes that no-op edits/revision switches rewind SO | medium | 6 | Consumed-message fingerprints for content-aware mutation handling |
| [BetterSimTracker v2](./bettersimtracker-v2-custom-stats-support.md) | Per-message stat tracker, off-path extraction, clamped deltas, good failure/cancel UX | medium | 11 | Failed read ≠ disabled: classify, back off, player Try again |
| [BlazeTracker (clone = WTracker)](./blazetracker-opinionated-roleplay-state-tracker.md) | JSON-schema scene tracker on a CM profile; shows `sendRequest` takes `custom.signal` | medium | 6 | Cancel in-flight memory-model calls via epoch AbortSignal |
| [Character Creator (CREC)](./character-creator-crec.md) | Field-by-field LLM card writer, zod-checked structured output, revise chat with snapshots | medium | 8 | Pass epoch AbortSignal into CM calls |
| [Character Style Customizer](./character-style-customizer.md) | Cosmetic per-character CSS; repo withdrawn, post only | low | 2 | Never ship presence-scoped page-wide CSS |
| [Chat Top Info Bar](./chat-top-info-bar.md) | Chat chrome: switcher, search, connection strip | low | 4 | Reap orphaned mirror lorebook on chat delete |
| [ChatsPlus](./chatsplus-recent-pinned-and-folders-for-chats.md) | Cross-chat recent/pinned/folders | low | 4 | "Your playthroughs" Continue list via `/api/chats/recent` |
| [CSS Snippet Manager](./css-snippet-manager.md) | Scoped custom-CSS snippets + `/csss*` | low | 3 | Author-gated enumProvider autocomplete for `/cp`, `/so-mem` |
| [CYOA Extension](./cyoa-extension.md) | Archived `/cyoa` option menu posted as fake user message | low | 4 | Extraction window hygiene: drop foreign UI messages, strip markup |
| [Dialogue Colorizer](./dialogue-colorizer.md) | Per-character quote/bubble colours | low | 2 | Roster accent colour in author panels |
| [Doom's Enhancement Suite](./dooms-enhancement-suite.md) | RPG tracker suite + tension-streak "knives" | medium | 10 | One-turn injections cleared only by their own generation's end |
| [Flowchart](./flowchart-automate-your-things-create-custom.md) | Node-graph STscript replacement; run traces | medium | 8 | Cancel off-path LLM calls via `custom.signal` |
| [Guided Generations](./guided-generations.md) | Player prompt toolbox; foreign-shaped generation events | medium | 9 | Ignore foreign-shaped GENERATION_STARTED/ENDED/STOPPED |
| [Improved memory and summarization (qvink)](./improved-memory-and-summarization.md) | Per-message summaries, short/long tiers, interceptor trimming | high | 12 | Append-only short_term per-window summaries |
| [LALib](./lalib.md) | ~120 STscript utility commands | low | 6 | Per-boundary consumed-chat stamp for silent mutations |
| [Landing Page](./landing-page.md) | Cosmetic no-chat landing screen | low | 2 | Stories in progress: cross-chat Continue list |
| [MCP Client](./mcp-model-context-protocol.md) | MCP tools via server plugin | low | 4 | Per-request sampler overlay at `*_COMPLETION_SETTINGS_READY` |
| [Moonlit Echoes Theme](./moonlit-echoes-theme.md) | Theme-as-extension | low | 4 | Use as plan 09's community theme axis in `so-responsive` |
| [More Flexible Continues](./more-flexible-continues.md) | Continue undo/regenerate tree | low | 3 | Record read text per boundary, check at next boundary |
| [Multihog D&D Framework](./multihog-d-d-framework-modular-rpg-platform-with.md) | Heavy RPG sim; branches, swipe memo, WAL for settings | medium | 10 | Story follows an ST branch |
| [NemoPresetExt](./nemopresetext-presetnavigator-world-info-and.md) | CC prompt workstation, directives, reasoning capture | low | 5 | Reasoning-safe extraction window |
| [Polyceph](./polyceph-custom-multi-model-multi-prompt.md) | Replaces reply generation with multi-model pipelines | medium | 11 | Abortable, time-bounded memory-model calls |
| [Presence](./presence.md) | Group witness tracking via `is_system` hiding | medium | 5 | Witness-filtered transcript per drafted member (interceptor) |
| [ProbablyTooManyTabs](./probablytoomanytabs.md) | Layout manager + WI-fired status bar | low | 7 | WI activation evidence via WORLD_INFO_ACTIVATED |
| [Prome Visual Novel](./prome-visual-novel-extension.md) | VN-mode styling | low | 5 | Active speaker skips system/comment/image messages |
| [Quick Persona](./quick-persona.md) | Chat-bar persona picker | low | 3 | Re-evaluate requirements on PERSONA_CHANGED |
| [Recast](./recast-st-post-processing-for-better-prose.md) | In-place multi-pass reply rewriting | medium | 6 | Re-commit newest reply's boundary after third-party rewrite |
| [ReMemory](./rememory-more-memory-management.md) | Manual summarize-to-WI, chunked map→reduce | medium | 11 | Scene summary spans the whole scene (chunked) |
| [Rewrite extension](./rewrite-extension.md) | Selection rewrite, silent `mes` splice | low | 9 | Silent-edit drift detection via rollback |
| [Roadway](./roadway-let-llm-decide-what-you-are-going-to-do.md) | "What could I do next" option cards | low | 4 | Survive unpaired foreign GENERATION_STARTED |
| [RPG Companion](./rpg-companion-sillytavern-extension.md) | Tracker panels, per-swipe state, plot buttons | medium | 10 | Branch-aware adoption rolled back to branch tail |
| [Silly Sim Tracker](./silly-sim-tracker-gamify-your-rp-sessions.md) | Main-model ```sim blocks rendered as cards | medium | 7 | Transcript hygiene for memory-LLM windows |
| [CHUB Search](./sillytavern-character-hub-search.md) | chub.ai search/import popup | low | 3 | Requirement provenance + Repair "Import from source" |
| [Quick Image Gen](./sillytavern-quick-image-gen-one-click-image-gen.md) | 18-backend image gen with well-tested host lib | medium | 8 | Save evidence for install-wide settings writes |
| [Timelines](./sillytavern-timelines.md) | Loom graph over chat files, branch from any node | medium | 7 | Branch-aware hydrate: rewind inherited state |
| [Smart Memory](./smart-memory.md) | Multi-tier memory SO's tiers were vendored from | high | 12 | Branch/checkpoint adoption reconciles to branch point |
| [Sorcery](./sorcery.md) | Main-model marker → mid-stream script | low | 5 | Validate authored cue regex at parse/Studio |
| [ST CharacterLibrary](./st-characterlibrary.md) | Standalone card/lorebook manager + AI generator | low | 8 | AbortSignal into CM sendRequest |
| [ST-Copilot](./st-copilot-smart-roleplay-assistant-advanced-ai.md) | OOC assistant with reviewable edit proposals | medium | 9 | Branch/checkpoint chat = fork at branch point |
| [ST Gamemaster](./st-gamemaster-minimal-injection-gm-with-tracking.md) | Pre-pass router + post-pass tracker, code dice | medium | 9 | Speaker-aware evidence (player line = attempt) |
| [ST Generation Locks](./st-generation-locks.md) | Profile/preset locks per char/chat/member | low | 4 | CC preset adapter via `/preset` + exact read-back |
| [ST Lorebook Ordering](./st-lorebook-ordering.md) | Scan-time WI reorder/trim/member scope | medium | 5 | WI activation evidence: verify ours landed |
| [ST Memory Books](./st-memory-books.md) | Mature scene→lorebook memory; best host edge cases | high | 8 | Decode MESSAGE_DELETED via identity snapshot diff |
| [Stat-us Maximus](./stat-us-maximus.md) | Hand-edited per-character status blocks | low | 6 | Author-view typed inline blackboard editors |
| [StatSuite](./statsuite.md) | Fine-tuned 2B per-stat tracker | medium | 7 | Transport-aware extraction backoff with auto-resume |
| [Stepped Thinking](./stepped-thinking.md) | Nested quiet generations for thoughts | medium | 6 | One-turn blocks survive a nested quiet generation |
| [SuperObjective](./superobjective.md) | Objective task tree injected every turn | medium | 7 | Default current-objective injection block |
| [Tavernary Companion](./tavernary-org-a-github-website-to-find-st.md) | Catalog extension manager | low | 6 | Downgrade guard for newer-build blobs |
| [Timeline-Memory](./timeline-memory-an-agentic-memory-system.md) | Chapter summaries + agentic raw-range recall | medium | 8 | Same-chat CHAT_CHANGED = reconcile, not reload |
| [Tracker (kaldigo)](./tracker.md) | Blocking pre-reply scene tracker | medium | 5 | Treat `owner_extension`/`is_thoughts` messages as non-turn |
| [TunnelVision](./tunnelvision-fully-autonomous-and-easy-lorebook.md) | Main-model lore tools + ENTRIES_LOADED suppression | medium | 8 | Checkpoint WI gating at scan time via WORLDINFO_ENTRIES_LOADED |
| [Universal Immersion Engine](./universal-immersion-engine.md) | Huge jQuery RPG overlay | low | 7 | Detect mid-chat delete by fingerprint diff |
| [VectHare](./vecthare-a-rag-and-vector-foundational-overhaul.md) | RAG engine in generate_interceptor | medium | 10 | Clean transcript text before extraction |
| [World Info Recommender (WREC)](./world-info-recommender-wrec.md) | Author-side WI suggest/revise with snapshots | medium | 6 | Curator uid addressing / rejected-op memory |
| [Danganronpa ST (DRST)](./your-ultimate-killing-game-rp-experience-begins.md) | Genre total-conversion kit | low | 9 | Story-owned scenario via `chat_metadata.scenario` |
| [Jeved](./jeved.md) *(added after verification)* | Sensor → rule → action layer over TypeSafe Jev (same wire format as our judge); rerolls, nudges, lists, STscript | medium (high for the judge) | 14 | Read Score answers raw: our lore spike rounded them, which manufactured the "Score ties more" lesson |
| [Reddit threads on Jev/Jeved](./reddit-jev-threads.md) *(added after verification)* | 4 threads, 218 comments + the 2 Jeved post bodies (user paste): practitioner use, criticism, provider claims; no accuracy measurements | medium-low (design pressure, no evidence) | 16 | Record judge `usage` + key readiness by model (the cost column is empty because we drop `usage`) |

Totals: 55 repos, 391 ideas; relevance 3 high / 26 medium / 26 low. (Excludes the two rows added after verification: +26 ideas.)

## Themes

Value/effort are the max value and typical effort across source repos. "Conflict" = invariant numbers from `_baseline.md` §2.

### 1. Rollback correctness against real host mutation shapes (largest cluster)
- **MESSAGE_DELETED payload is post-delete `chat.length`, not the deleted id** — middle delete (`deleteMessage` splice, `/cut`) rewinds the tail instead of the deleted message; later provenance ids shift. Fix: identity snapshot diff (WeakMap + send_date/name/mes fallback). Sources: st-memory-books (`memoryRollback.js:65-140`), universal-immersion-engine (`stateTracker.js:2463-2495`), mcp, roadway, st-gamemaster, st-copilot. Ours: `src/runtime/turnBridge.ts:56,159-170`. 5/S. Conflict: none, restores 11.
- **Content fingerprints of consumed messages** — rewind only on real text change (no-op edit, Astra revision switch, swipe back to the consumed swipe = no-op); detect eventless changes (ST `messageEditMove`, `/role-swap`, `/hide`, third-party `chat[i].mes =` + `saveChat`, `reloadCurrentChat`, edits made while SO was off) at next boundary + hydrate. Sources: astraprojecta, lalib, more-flexible-continues, rewrite-extension, st-memory-books (`pendingProgress.js:8-41`), polyceph, timeline-memory, QIG, recast. Ours: absent (`src/engine/engine.ts:12-13` records ids only). 4/M. Conflict: blob bump (13); hash in runtime (1).
- **Same-chat CHAT_CHANGED** (`reloadCurrentChat`) treated as full switch: drops pending queue, lapses runs. Sources: timeline-memory, QIG. Ours: `turnBridge.ts:149-152`, `runtimeManager.ts:524-549`. 4/M.
- **Append-only edit = continue; shrink keeps evidence-matched rows** (more-flexible-continues). 3/M.
- **Re-commit newest reply after a third-party rewrite** (recast emits MESSAGE_EDITED on every accepted rewrite). 4/M.
- **Swipe back to an existing swipe** emits only MESSAGE_SWIPED, no render → state lags a boundary and re-reads cost an LLM call. Cache keyed by (messageId, text hash, scope hash, story id+version). Sources: dooms, multihog, rpg-companion, statsuite, improved-memory, bettersimtracker. 3/L. Conflict: 3, 11 (key must be text hash, never swipe index — MESSAGE_SWIPE_DELETED reindexes).
- **Hidden ≠ deleted** — `/hide` flips `is_system` with no event; our window drops `is_system`, so re-reads of consumed ranges see holes; facts from now-hidden messages stay live. Sources: st-memory-books, flowchart, presence, rememory, st-copilot. 3/S-M.

### 2. Chat identity: branches, deletes, downgrades, renames
- **ST branches/checkpoints copy the whole `chat_metadata`** (`bookmarks.js:201,284`, `script.js:7406`): our blob (stamped for the parent) and the chat lorebook slot (parent's mirror book) travel into the branch. Today: V5 reads "no story"; explicit select adopts the parent's tail state with no chat-length reconcile; parent mirror rows keep firing in the unadopted branch. Fix: detect `main_chat === stampedFor` + fresh `integrity`, offer "continue from branch point" = adopt + `runRollback(chat.length)`; unbind inherited mirror while unadopted. (Fresh mirror book on adoption already exists, `memoryMirror.ts:82-88,122` — verified.) Sources: sillytavern-timelines, st-memory-books, smart-memory, rpg-companion, st-copilot, multihog, vecthare. 5/M. Also corrects `docs/plans/v2.3/03-async-ownership.md:2715` (claims branches don't copy the blob) and `multihog…md:85`.
- **Replay from a past checkpoint via an ST branch** (timelines) — save-slot semantics without our own snapshot store; answers seed "out-of-horizon history". 3/M.
- **Orphaned per-chat mirror book on chat delete** — CHAT_DELETED(name)/GROUP_CHAT_DELETED(id) are typed payload-less in `src/services/stHost/events.ts:11-12`. Reap owned-name books (prefix + exact chat-id suffix) behind confirm / Repair. The book is an inert, chat-slot-bound orphan file, not a global/active lorebook (verified: `ensureLorebook` does not activate, `memoryMirror.ts:122`). Sources: chat-top-info-bar, vecthare, DRST (chatsplus only as a negative example). 4/S.
- **Downgrade guard** — a blob with `version > 4` falls to `migrateMetadataBlob` → null → fresh v4 blob written over it (`src/runtime/persistence.ts:44-74`). Read as detached, refuse automatic writes, journal. Source: tavernary (`state-migrations.ts:18-19`). 4/S.
- **`minimum_client_version` 1.18.0 in manifest** (probablytoomanytabs, tavernary). 2-3/S.
- **Stamp with `chat_metadata.integrity`** as well as chatId (vecthare) — survives rename/import, distinguishes branches. 3/M.
- **Cross-chat "your playthroughs" Continue list** via `POST /api/chats/recent {metadata:true}` (one header-only request; derived, no new config home). Sources: chatsplus, landing-page, chat-top-info-bar. 4/M. Conflict: 9 (checkpoint names only), 13 if an index is persisted (don't).
- **Key cross-chat records by avatar/group id + file, never by `characters[]` index** (chatsplus anti-pattern). Present.

### 3. Off-path LLM call hygiene (cancel, failure, size, shaping)
- **AbortSignal**: `ConnectionManagerRequestService.sendRequest` honours `custom.signal` (`shared.js:415,424,463,483`, since 2025-03, also in 1.18.0). Our `runOwner.ts:60-62`, `judge/types.ts:66-68`, `epochAbort.review.test.ts:9-10` say it does not; `connectionProfiles.ts:43-50` passes none. Pass `RunOwner.signal()` (+ `AbortSignal.timeout`) through. The epoch signal aborts only on chat switch/load/restart, so a rollback cancel needs a per-read controller (verified, `runOwner.ts:80-83,100-104`); classify `cause.name === 'AbortError'` (ST wraps as "API request failed", `shared.js:487-490`) as lapsed, not a failed read. Sources: blazetracker, CREC, flowchart, QIG, multihog, polyceph, st-characterlibrary, improved-memory, st-memory-books, bettersimtracker. 4/S. Stop control for memorize backlog (improved-memory).
- **Transient failure ≠ disabled** — one failed read writes install-wide `extraction.enabled=false` (`runtimeManager.ts:430-436`) after ~750 ms of retries (`scheduler.ts:213-224`). Classify transport vs content; transport → breaker + backoff + profile probe + auto-resume + player "Try again"; re-arm on ONLINE_STATUS_CHANGED as a probe trigger only. Sources: bettersimtracker, chat-top-info-bar, statsuite. 4/M. Removes an inv-13 smell.
- **Dangling profile** — deleted CM profile reads as configured; subscribe CONNECTION_PROFILE_CREATED/UPDATED/DELETED, Repair step (roadway). 3/S.
- **Request-size bound (seed D)** — token chunker (greedy pack by tokens, bounded by output cap, map→reduce) for `memorize:full`, backlog, whole-scene summary; unknown limit → declared default + report, not fail closed (verified). Map-reduce for summaries only, never DELTA reads. Sources: rememory, st-characterlibrary, polyceph, timeline-memory. 4/M. Author preflight confirm for manual heavy passes (DRST, UIE). 3/S.
- **Scene summary spans whole scene**, not just the detecting window (`extractionCoordinator.ts:287-300`) (rememory). 4/M.
- **Truncation from `finish_reason`** (`extractData:false` + `ctx.extractMessageFromData`) instead of char heuristic (st-characterlibrary). 3/S.
- **Degenerate-loop detector** on memory replies (polyceph `loop-detector.js`). 3/S.
- **Input-proportional `maxTokens`** for text passes; several pass no maxTokens → 512 default (rewrite-extension). 3/S.
- **Stop overriding temperature/top_p on CC sources that constrain them** — `overridePayload` spreads last over ST's per-model rules (timeline-memory). 3/S.
- **Reasoning strip via profile's `reasoning-template`** as an extra pattern; keep our leading-block rules as authority (improved-memory, recast, smart-memory, timeline-memory, rememory). 2/S.
- **Rpm spacing** for side calls (rememory). 2/S.
- **Opt-in constrained decoding** (json_schema/GBNF) for copilot/wizard JSON; trap: CC json_schema returns parsed object and our seam returns `''` (`connectionProfiles.ts:51-54`); llama.cpp ignores json_schema when a grammar is sent. Sources: blazetracker, CREC, flowchart. 3/M.
- **Per-pass profile routing** {read, synthesis, authoring, director, curator} falling back to `extraction.profileId`; per-request, never a global swap. Sources: polyceph, guided-generations, st-gamemaster, UIE, DRST. 4/M. Live suite re-run per role.
- **Community generation mutex** (GENERATION_MUTEX_CAPTURED/RELEASED string events) — defer off-path reads while a peer holds it. Sources: polyceph, tracker. 2-3/S-M.

### 4. Extraction input quality
- **Window hygiene** — strip HTML/CSS/script/`<details>`/display:none/code fences/inline `<think>`; drop foreign UI or extension-owned messages (`owner_extension`, `is_thoughts`, CYOA synthetic `is_user` with `extra.model 'cyoa'`, `/sd` prompt posts, QIG placeholders). Clean once in `getChatWindow` so prompt, evidence check and stored evidence agree. Sources: vecthare, silly-sim-tracker, UIE, cyoa, nemopresetext, rpg-companion, tracker, stepped-thinking, QIG. 4/S. Ours: `src/extraction/chatWindow.ts:6-14` raw `mes`.
- **Prompt-only regex parity** — `getRegexedString(mes, placement, {isPrompt:true, depth})` via new `stHost/regex.ts`, capability-probed (rememory, recast, rewrite, rpg-companion). 3/M. Conflict: 2, 4.
- **Speaker-aware evidence** — a player line proves an attempt/choice, not a world outcome; per-quality `evidence_from any|world` (st-gamemaster). 4/M. Tightens 4.
- **Current in-scope quality values in the shared-read prompt** — anchoring risk (tracker author reports stuck values); ship only past predeclared live-suite floor, opt-out per quality. Sources: blazetracker, rpg-companion, tracker. 3/M.
- **Signed values `+5`** — distinct reject reason first; relative op resolved at drain later (silly-sim-tracker). 3/M.
- **Bounded numeric step / min-max per quality** (bettersimtracker). 3/S.
- **Deterministic OOC exclusion** gives `sceneOoc` a floor or a reason to remove it (statsuite). 2/S.
- **Negative memory** — keep excluded text, suppress paraphrases via dedup bands, optionally list in read prompt (UIE). 3/S.
- **Full-restatement mode spike** for weak models (multihog). 3/M.
- **Epistemic `[intends]` tag** (stepped-thinking); **witness-scoped facts / per-message witness sets** (smart-memory, presence). 3/M.

### 5. Generation lifecycle interop (other extensions' generations)
- **One-turn blocks cleared by the wrong GENERATION_ENDED** — nested quiet generations (Stepped Thinking inside GENERATION_AFTER_COMMANDS), foreign emitters with `{source}` payloads (Guided Generations), unpaired foreign STARTED('impersonate') (Roadway) and quiet generations from any extension end our private epistemic block, author nudge and warden note before the real reply is assembled (note already marked applied → lost). Fix: shape predicate for ST-emitted events + track outermost loud generation; clear on its render/STOPPED; or `setExtensionPrompt` 7th `filter` arg. Sources: stepped-thinking, guided-generations, dooms, roadway, UIE, timeline-memory. 4/M. Ours: `src/runtime/index.ts:189-192`, `runtimeManager.ts:633-634`, `stagecraftCoordinator.ts:456-470`.
- **Skip payload capture + talk hook on dry runs** (`GENERATION_STARTED` 3rd arg) (rewrite-extension, dooms). 2/S.
- **Per-generation-kind carry policy** on INJECTION_REGISTRY (drop steering on impersonate / foreign quiet / guided `script_injects.instruct`) (dooms, rpg-companion). 3/S.
- **Tool-call turns** — pre-tool text renders (boundary), placeholder MESSAGE_DELETED, `is_system` tool row, recursive Generate with a second STARTED: 2+ boundaries per turn. Decide policy; test with `/tools-register` dummy. Sources: mcp, tunnelvision, timeline-memory. 3/S.
- **`/trigger` by member index** — ST `parseInt(arg)` first then Fuse fuzzy (guided-generations). 2/S. **CC `send_if_empty`** may fabricate a player turn on our `/trigger` paths (guided-generations). 2/S, verify.
- **Honour generation-replacing extensions** (Polyceph probe) and **third-party interference probes** in capabilities/Repair (Presence, Nemo reasoning capture, Stepped Thinking Separated, TunnelVision suppression). Sources: polyceph, nemopresetext, presence, tunnelvision, vecthare. 3/S.
- **Draft-window guard** — hold reads between GROUP_WRAPPER_STARTED/FINISHED (Presence hides most of the chat while a member is drafted) (presence). 3/S.

### 6. World Info: evidence, gating, mirror
- **WI activation evidence** — WORLD_INFO_ACTIVATED (non-dry, non-empty only; clear on GENERATION_STARTED) → per-generation ring; verify forced picks, gated enables and mirror entries actually landed. Forced entries still pass probability + budget; any `checkWorldInfo` incl. foreign dry runs clears pending force (st-gamemaster dry-scans from 10 engines). Sources: probablytoomanytabs, st-lorebook-ordering, st-gamemaster, bettersimtracker, QIG, tunnelvision. 4/M.
- **Scan-time gating via WORLDINFO_ENTRIES_LOADED** — apply `worldInfoPlan` to per-scan shallow copies; no file writes, no release step, per-chat by construction. Also enables an unbound mirror (no chat-slot competition, no branch leak) and member-scoped lore. Sources: tunnelvision, st-lorebook-ordering, st-memory-books. 4/M. Risk: vectors extension also consumes `getSortedEntries`; ST editor shows file state.
- **Foreign scan filter suppresses our books** (TunnelVision `enabledLorebooks`, STLO) → Repair check. 3/S.
- **Force lore from the interceptor** instead of GENERATION_STARTED to narrow the foreign-dry-scan window (bettersimtracker, st-gamemaster). 2-3/S.
- **Mirror key hygiene** — entity-name keys fire every turn; scene rows written keyless + non-constant are skipped by ST (`world-info.js:4898-4907`) → inert (rememory). Fix = stop mirroring scene rows (already injected via `memorySceneHistory`), not keying them (verified). 3/S.
- **Mirror WI budget share** (chat lore scanned first) (st-lorebook-ordering). 2/S.
- **Per-tier `scan:true`** (facts/scene/objective only; never epistemic) (improved-memory, bettersimtracker, tracker, stepped-thinking, superobjective). 3/S.
- **Requirements satisfied by chat/character/persona-bound books**, not only global selection (WREC, lalib). 3/M.
- **Ownership marker inside books we create** (top-level key survives) (st-lorebook-ordering). 2/S.
- `worldInfoCache` is an exported map with `.delete` — fixes seed D `so-assets` stale cache (multihog).

### 7. Memory & retrieval
- **Append-only short_term** per-window summaries rotated by budget (improved-memory). 4/M. Better rollback locality.
- **Context-horizon aware scoring** via `chat_metadata.lastInContextMessageId` (astraprojecta). 3/S.
- **Macro placement suppresses the depth injection** (smart-memory). 3/S. Not for epistemic.
- **Roster aliases + entity canonicalization + "same character?" queue card** (dooms, smart-memory; director name tolerance from st-copilot). 4/M.
- **Context-relative tier budgets / real tokenizer / context-relative compaction trigger** (improved-memory, smart-memory). 2/S.
- **Scene-source recall pass** (summary routes, raw range answers) off-path (timeline-memory). 3/L, spike.
- **Opt-in interceptor trimming** of consumed messages via `symbols.ignore` with stepped threshold (improved-memory); **witness-filtered transcript** per drafted member (presence). 3-4/L. Re-decide the "no message-level hiding" stance.
- **Embedding rerank** as consumer for dead `memoryRerank` (vecthare). 3/M. Token normalization for Jaccard (vecthare). 3/S.
- **Author ledger row edit** (statsuite). 3/S. **Presence-filtered ledger injection** (stat-us). 2/S.

### 8. Stagecraft / curator / effects
- **Curator hardening**: refuse `[rewrite]` when content > 400-char shown (`stagecraft/prompt.ts:13`) (rewrite-extension, 4/S); uid addressing + refuse ambiguous/prefix title (`stagecraft/parse.ts:18-19`) (WREC, 3/S); rejected-op memory (WREC, st-copilot, 3/S); word diff on cards (CREC, lalib, WREC, 3/S); fuzzy anchor in review mode only (st-copilot, 3/S); write tiers + protected spans (multihog, 3/S); keyring view to bound prompt (multihog, tunnelvision, 2/S); trigram near-dup on F5 create (tunnelvision, 2/S).
- **Checkpoint objective injection** default block + diagnostic "no author_note inherits previous AN; generated beats' guidance never reaches the model" (superobjective). 4/M + 3/S.
- **Story-owned scenario** via `chat_metadata.scenario` per-chat override through `withLedger` + path replay (DRST). 4/M. + Repair "roster cards' greetings/scenario compete" (DRST). 3/S.
- **CC preset seed**: per-request sampler overlay at TEXT/CHAT_COMPLETION_SETTINGS_READY (no global write, both backends) (mcp, 4/M) vs `/preset` + exact read-back + OAI_PRESET_CHANGED_BEFORE strip (st-generation-locks, polyceph, 3/M) vs prompt-toggle effect (nemopresetext, 3/L).
- **Live drift read of owned effects** on PRESET_CHANGED (st-generation-locks). 2/S.
- **Authored complication pool ("knives")** after N escalate boundaries, spent-ness derived from boundary log (dooms). 4/M.
- **Seeded chance gates** (multihog, st-gamemaster). 2-3/M-L. Needs RNG seam.
- **Post-reply agency check** (recast) propose-only judge use. 3/M. **Raised to 4/M by Jeved** (a tested Puppet rubric; delivered as a warden note; see §11 and T22). Unverified.
- **Judge-picked authored steering**: a Choice over a checkpoint's authored complication/beat snippets → one-turn block, never a reroll (Reddit u/typical-predditor; pairs with the dooms complication pool). 3/M. Conflict: 7, C4, schema row.
- **Adversity read as the complication trigger**: the Jeved OP's "cost to the user (positivity bias)" sensor. Ours has only a prompt clause (`engine/agency.ts:26-29`) plus drift-only escalation (`pacing/steering.ts:26-38`), so a story at target tension where nothing ever costs the player is invisible. The read only *releases* an authored complication as world pressure, never "the player loses X" (Reddit R13). 2/M, and only after the complication pool exists. Conflict: 7, C4.
- **Publish SO boundary/transition events** (player-safe names) for peers (rpg-companion). 2/S. **Narrow player-safe `globalThis` API** (guided-generations). 2/M.

### 9. Author/player UX and observability
- **Next-turn preview**: tokens per block + share of context (astraprojecta, probablytoomanytabs, 3/S); foreign extensions' blocks (guided-generations, 3/S); per-row memory fate trace (vecthare, improved-memory, 3/S); per-tier trim telemetry (smart-memory, 3/S); injection write log (dooms, 2/S); dry-run assembled prompt (rewrite, 3/M).
- **Provenance navigation**: "message N" → `/chat-jump N` (loads lazy history, scrolls, flash-highlights) (chat-top-info-bar, timelines, 3/S); source-message popup (prome, 2/S).
- **Per-message author inspector / flag this message** via `.extraMesButtons` (blazetracker, flowchart, improved-memory, 3/M). Exception to "never touch message DOM" needed.
- **Gate trace + live-path overlay, Studio dry-run** (flowchart). 3/M.
- **Tension/quality timeline chart** author-only (bettersimtracker, blazetracker). 2/S-M.
- **Typed inline blackboard editors**, `/cp get`, enumProvider autocomplete (stat-us, lalib, css-snippet-manager). 2-3/S.
- **Per-quality macro** `{{story_quality::<key>}}`: Jeved's per-NPC trust meter read by macro. We have the substance (authored qualities, ledger rows with `ledger_binding`, rolled back), but `story_blackboard`/`story_ledger` render whole blocks (`runtime/macros.ts:50,56`). Check that the legacy `MacrosParser` seam can take a parametric macro (Reddit R15). 2/S.
- **Wand-menu entry** (Astra hides top bar on mobile; superobjective) — `#extensionsMenu`. 3/S.
- **Player "what could I do?" options** pre-filling input, never sending (cyoa, roadway). 3/M. Conflict 9, agency.
- **Player-visible declared qualities** (silly-sim-tracker). 3/M. Needs user decision.
- **Persona**: re-evaluate requirements on PERSONA_CHANGED/WORLDINFO_SETTINGS_UPDATED/GROUP_UPDATED and apply hydrate effects on not-ready→ready (quick-persona, 4/S); actionable persona Repair via `/persona-set mode=lookup` (3/S); require a real persona not a `name1` string (2/S).
- **Active speaker skips system/comment/image messages** — our own transition `/comment` as last message makes `activeSpeakerId` return null (`src/runtime/roster.ts:30-41`), filtering character-scoped facts (prome). 4/S.
- **Transition announcement channel** comment|hud|off (VN single-message mode hides the reply) (prome). 3/S.
- **First-visit coach marks** (DRST). 3/M. **i18n via manifest map** (moonlit). 2/L.
- **Wizard**: per-field refine, discuss-only turn, per-turn draft snapshot diff/revert, author-picked reference cards, macro normalization `{{char}}/{{user}}`, requirement provenance + "Import from source", story bundle export (CREC, WREC, st-characterlibrary, st-copilot, chub-search). 2-3/S-L.

### 10. Harness/testing
- Interop fixture corpus in `so-turn-types-check` / scenarios: foreign emitter, nested quiet gen, out-of-band swipe append, CYOA synthetic message, Roadway smallSys push + middle delete, silent `mes` rewrite, `messageEditMove`, role swap, tool-call turn, same-chat reload, branch mid-story, post-processor rewrite. Sources: astraprojecta, guided-generations, cyoa, roadway, lalib, more-flexible-continues, rewrite-extension (as fault shape #10 `silentHostEdit`), stepped-thinking, mcp, timeline-memory, timelines, recast. 4/S each.
- Prompt-template fingerprint golden tied to calibration (dooms). 3/S.
- Guard: every subscribed event key exists in `eventTypes` (our `resolveEventName` falls back to raw string, `events.ts:48-52`) (silly-sim-tracker, timelines, st-gamemaster — all three shipped dead listeners). 2/S.
- Migration non-destructive property (smart-memory). 2/S. Fresh-state isolation test (superobjective). 2/S.
- Boot-smoke built bundle against fake host modules (QIG). 2/M.
- Dedicated ST user account for destructive journeys (tavernary). 3/M. Needs `enableUserAccounts` (user's call).
- Theme axis in `so-responsive` using Moonlit (plan 09 unrun row) (moonlit). 3/S.
- Fixture export from flagged reads (statsuite); shadow extraction arm (bettersimtracker). 2-3/M.
- Doc-contract tests + folder-scoped rule docs (astraprojecta). 2/S.
- **Judge-off control arm** as a standard column in live gates and human sessions, e.g. `so-lore-probe diff` (Reddit C6/R8). 2/S.
- **Over-steer probe for one-turn notes**: the reply after a warden/agency/house-rule note must not restate the note or swing (Reddit R9). 2/S.
- **Judge-vs-extractor disagreement record**: a judge-answered quality leaves the extractor's scope (`extraction/sharedRead.ts:34-39,94-95`), so the two never disagree on record. A shadow mode logs the diff author-only as calibration evidence (Reddit R16, u/curious_biped_dev; same shape as bettersimtracker's shadow arm). 2/M.

### 11. Judge (TypeSafe Jev) — added after verification, unverified
Sources: `./jeved.md` (ideas 1–14) and `./reddit-jev-threads.md` (R1–R16; R13 sits in §8, R15 in §9, R16 in §10). Conflict numbers refer to `_baseline.md` §2; inv 7 applies to every item: off by default, own fixture, predeclared floor, never retuned.
- **Read Score answers raw.** Our lore spike rounded the Score answer (`loreScore.ts:45,65`). Re-ranking the golden's own answers gives raw Score a tie rate of 0.04 and the Noul→Score tiebreak 0.00, with nDCG unchanged. So the recorded lesson "Score ties more than Noul" is wrong. Predeclare the raw arm and the hybrid arm, and score them on fresh rows. (jeved F1/idea 1) 4/S. → **T21**
- **Lore "relevant when" arm**: a Noul over a one-line trigger statement instead of 600 chars of content; a smaller state (Reddit u/DevGnoll, R6). 2/M. Run it with T21's arms.
- **Agency check via the warden**: the reply writes what only the player does, says or thinks → one-turn note. Never a reroll. (jeved idea 2) 4/M. → **T22**
- **Authored `house_rules`**, one Noul per rule in the warden's call. Each question sees the reply and the rule only. (jeved idea 3; Reddit u/majesticjg asked for exactly this) 3/M. → **T23**
- **Judge usage/cost** into `JudgeCallRecord` (`usage` is typed at `types.ts:62` and dropped) + author-view totals; fills `recommended-config.md`'s empty cost column (jeved idea 6, Reddit R1) 3/S. **Readiness keyed by the model it was measured on** (`readiness.ts` has no model; `settings.model` is configurable) (Reddit R2) 3/S. → **T24**
- **Plugin host table**: TypeSafe / NanoGPT / OpenRouter / local Jev-like, with a model-id map (`typesafe/jev-1.13` ≠ `jev-1.13.0`), the answering model recorded, and one calibration per host×model. Plus a token-based request guard: Jev's context is claimed at ~32k tokens, while the plugin refuses at 140k **chars**. (jeved idea 5, Reddit R3/R4) 3/S-M. → **T25**
- **Boundary judge bundle**: merge uses with identical `state` into one call; re-calibrate (jeved idea 4). 3/M.
- **Judge tension read** (raw Score) as an EMA source (jeved idea 7) 3/M. Reddit u/Zeeplankton cautions that numeric tension grading "still wasn't good". **Steering hysteresis**, N of the last M boundaries (jeved idea 8) 2/S. The Jeved launch body shows its core mechanism is exactly this kind of trend: an averaged Score that fires below a threshold (Reddit C14). Our pacing already trends: an EMA of extractor tension against the authored target (`pacing/tension.ts:21-25`, `steering.ts:48-56`).
- **Pre-reply player-message Choice** (intent/scene kind), within the 1500 ms reply-path budget (jeved idea 9; Reddit u/nerdswithfriends, u/FR-1-Plan; shipped as Jeved 0.4's Scene rules) **2/S-M**. The seam already exists: `loreSelect` waits for MESSAGE_SENT and steers the same reply (`runtime/index.ts:149-158`, Reddit C15).
- **Lore contradiction in the warden**: hold the reply to the story's authored lore as well as to facts and bound ledger rows (`runtime/continuity.ts:25-52`). Jeved 0.4's WI-reading "contradicts the lore" sensor is the prompt. Needs its own fixture (lore is prose, not one-line facts), a `sends` update, and T12 for "activated" lore (Reddit R14). 2/M.
- **Question design is confirmed, not changed**: the Jeved OP's own caution (objective compliance over the card + a few replies works; subjective whole-transcript questions do not) is the shape every use of ours already takes (Reddit C13).
- **Studio gate replay** over recorded blackboard history, no LLM (jeved idea 10) 3/M.
- **`memoryRerank` consumer spike** or remove it. Reddit claims a "~90%" history cut, with no method (R7). 2/M. Input to V19.
- Anti-patterns confirmed by both sources: auto-reroll / auto-swipe QA, judge-driven STScript or rewrite passes, a browser-held key, a judge probability deciding a state write (jeved 12–14, Reddit R11/R12). Multiplayer POV is out of scope (Reddit R10).

## Top recommendations for v2.4

Bucket key: **H** = host correctness / rollback; **X** = extraction & LLM hygiene; **W** = World Info; **M** = memory; **S** = stagecraft/story; **U** = author/player UX; **T** = harness; **J** = judge (T21+ only). **Carry-in** (`## v2.3 carry-over`) cuts across buckets and goes first: the T1, T6 and T10 fixes, plus the doc and comment corrections from T2, T4 and T21.

All 20 survived verification (see `## Verification`), so the numbering is unchanged. Where the verifier found we already partly have something, "Ours" is corrected below, and each item ends with a *Verified* line.

**T1. Decode MESSAGE_DELETED correctly (identity snapshot diff).**
- What: keep a message-identity snapshot. On MESSAGE_DELETED, diff it to recover `{start,count}` and roll back from the real start.
- Why now: every middle delete today rolls back the wrong range and shifts provenance ids, which silently breaks rollback ≡ replay.
- Sources: st-memory-books `memoryRollback.js:65-140`, universal-immersion-engine `stateTracker.js:2463-2495` (single delete only), mcp, roadway, st-gamemaster, st-copilot; ST `script.js:1611,1678-1699,4411,11734`.
- Ours: absent. `turnBridge.ts:56,159-170` uses the payload as the deleted id and passes it to `rollback.ts:35`; the turnKeys purge at `:165` is keyed the same wrong way.
- 5/S. Risk: none; restores inv 11. The snapshot is in-memory, so no blob change. Bucket H.
- *Verified:* the stable fallback id must include `is_system` and `swipe_id`. Refresh the snapshot on every render/edit/swipe and on CHAT_CHANGED keyed by chatId. An ambiguous diff falls back to today's path and is journaled; never guess.

**T2. Story follows an ST branch/checkpoint.**
- What: detect a branch (`main_chat` = stamped chat, fresh `integrity`). Offer "continue from branch point" = explicit adopt + `runRollback(chat.length)` / `boundaryBeforeMessage`. Unbind the inherited parent mirror while unadopted. Fix the wrong doc claim.
- Why now: branches are a core ST feature. Today the branch reads "no story", explicit select hydrates future state, and the parent's mirror rows fire in the branch.
- Sources: sillytavern-timelines, st-memory-books `branchLorebooks.js:335-460`, smart-memory, rpg-companion, st-copilot, multihog, vecthare; ST `bookmarks.js:201,230-233,284`, `script.js:7406`, `group-chats.js:2370`.
- Ours: **partial**. Detection reads the branch as a detached blob (`persistence.ts:34,59-75`), and adopt restamps (`:87-93`, `storySelection.ts:71-79`). **A fresh mirror book on adoption already exists**: `memoryMirror.ts:82-88` ensures a per-branch book, and `:122` rebinds the slot. Missing:
  - the unadopted branch keeps the parent's mirror bound;
  - no rollback to the branch tail on adopt (`runtimeManager.ts:524-543` has no chat-length reconcile);
  - no offer to continue;
  - the wrong doc line `docs/plans/v2.3/03-async-ownership.md:2715`.
  
  grep `main_chat|integrity` in src = 0.
- 5/M. Risk: explicit only (V5, no auto-adopt). No blob bump, because `main_chat`/`integrity` are ST's keys. The slot unbind is a host write, so it needs a WriteResult (16) and ownership (10). Bucket H.
- *Verified:* confirm that ST's `main_chat` (solo `sessionName`, group `chat_id`) string-equals our `blob.chatId` stamp before relying on `main_chat === stampedFor`.

**T3. Content fingerprints of consumed messages, reconciled at boundary/hydrate/same-chat reload.**
- What: store `{messageId, hash}` per boundary. Skip rollback on no-op edits and swipe-back. Roll back from the first mismatch on eventless changes. Treat a same-chat CHAT_CHANGED as a reconcile (keep the queue and runs).
- Why now: ST's own `messageEditMove` (`script.js:8353-8395`) and `/hide` (`chats.js:147-169`), `/role-swap`, and many extensions mutate without events, and no-op edits currently rewind and quarantine.
- Sources: astraprojecta, lalib, more-flexible-continues, rewrite-extension, st-memory-books `pendingProgress.js:8-41`, polyceph, timeline-memory, QIG, recast.
- Ours: absent. `engine.ts:11-14` BoundaryContext is `{lastMessageId, chatLength}` only. `turnBridge.ts:149-152,159-170` rolls back on any edit id, even for unchanged text. `runOwner.ts:20-22,100-104` is an in-session counter, not a hash.
- 4/M. Risk: blob bump + migration (13); hash computed in the runtime and passed as data (1); a legacy boundary counts as unknown, not a mismatch. Bucket H. Sequence after T1 (shared snapshot machinery).
- *Verified:* the lalib-style hash (mes+is_user+name+swipe_id) does **not** catch `/hide`, which flips `is_system` only. Add `is_system` to the hash, or drop /hide from the claim and decide whether hiding a consumed message should roll back at all. The continue path (`turnBridge.ts:24-29`) legitimately changes `mes` on the same id, so it must re-fingerprint rather than read as a mismatch.

**T4. Abortable, time-bounded memory-model calls.**
- What: pass an AbortSignal + timeout into `sendRequest` `custom.signal`. Abort = lapsed, not a failed read. Add Stop for the memorize backlog. Correct three wrong comments.
- Why now: the host supports it, and a lapsed read keeps the single-slot pod busy after a chat switch or rollback.
- Sources: blazetracker `src/index.tsx:249`, CREC, flowchart, QIG, multihog, polyceph, st-characterlibrary, improved-memory, st-memory-books, bettersimtracker; ST `shared.js:411,420,458,478,487-489` (also in the pinned 1.18.0, since a7d48b1ae 2025-03-26).
- Ours: partial. Only the judge wires abort + timeout (`stHost/judge.ts:46-63`). `connectionProfiles.ts:43-55` sends no signal, and extraction calls have no timeout at all. The false claims are at `runOwner.ts:56-62`, `judge/types.ts:65-68` and `epochAbort.review.test.ts:8-11`.
- 4/S. Risk: an abort must never trigger `pauseExtraction`; the RunToken check stays at every write edge (10). Bucket X.
- *Verified:*
  - `RunOwner.signal()` aborts only on `bump()` (`runOwner.ts:80-83`, a new epoch from chat switch/load/restart). `noteMutation` (`:100-104`) aborts nothing, so cancelling on rollback needs a per-read controller, aborted when a mutation reaches that read's window (`tokenMatches`' `lowestMutatedSince`).
  - The scheduler already refuses to pause for a job whose world ended (`scheduler.ts:174-181`). Classify AbortError (lapsed, e.g. rollback) separately from TimeoutError (a real backend failure, still counts as failed) via `cause.name` / `signal.reason`.
  - `runWithRetries` (`scheduler.ts:213-224`) must short-circuit on abort.
  - The backlog has no cancel today (`DrawerTabs.tsx:256`, `extractionCoordinator.ts:383`).

**T5. A transient read failure never disables extraction install-wide.**
- What: classify transport vs config vs code-bug failures. On a transport failure: breaker/backoff, profile probe, auto-resume, `stalled-rechecking` + a player "Try again". Use ONLINE_STATUS_CHANGED as a probe trigger. Add a Repair step for a deleted profile.
- Why now: a backend blip writes `extraction.enabled=false` for every chat until someone notices, which is the most common live-gate failure mode.
- Sources: bettersimtracker `extractionFailurePolicy.ts:13-15`, chat-top-info-bar `index.js:684`, statsuite `api.ts:13-56` + `stats-logic.ts:142-160`, roadway `index.ts:111-118`; ST `events.js:79,81-84`.
- Ours: partial. `runtimeManager.ts:432-439` pauses by calling `setGlobalSettings`, after 3 attempts with 250/500 ms waits (`scheduler.ts:176-181,213-224`). Nothing resumes it (grep resume/ONLINE_STATUS/CONNECTION_PROFILE = 0). `repair.ts:28` checks only `!enabled || !profileId`, so a dangling id is missed. `pipeline.ts:61-62` reports `lastError` as error/repair. Existing pieces: the V3 world-epoch guard and the pipeline's retry vocabulary.
- 4/M. Risk: removes an inv-13 smell (the runtime writing a user setting). New events go through `stHost/events.ts` keys (2). The breaker belongs in the scheduler or extraction coordinator, not the manager (676/700, 18). Bucket X.
- *Verified:* content failures mostly do not throw today (parse/validation reject lines; the only explicit throw is `client.ts:13`, no profile). So the split mainly separates transport from config and from bugs in `job.run`.

**T6. One-turn blocks survive foreign/nested/quiet generations.**
- What: recognize ST-shaped generation events (reject `{source}` payloads) and track the outermost loud generation. Clear the private epistemic block, nudge and warden note only at its render or STOPPED (or gate via a `setExtensionPrompt` filter). Skip dry-run captures.
- Why now: Stepped Thinking and Guided Generations are popular, and they silently strip the drafted member's private block and spend the warden note.
- Sources: stepped-thinking `engine.js:56,453`, guided-generations `llmClient.js:565-571,899-917`, dooms `characterWorkshop.js:2771-2807`, roadway `index.ts:672-674` (unpaired STARTED), UIE, rewrite-extension; ST `script.js:3084-3116,3532-3536,4299,4321,5336,7075-7079`.
- Ours: absent.
  - `runtime/index.ts:189` calls `onGenerationStarted`/`capturePayload`/`talk.onGenerationStarted` unconditionally.
  - A quiet STARTED clears the epistemic block (`runtimeManager.ts:635`, `memoryCoordinator.ts:482-484`).
  - Every ENDED clears the private injection, nudge and note (`runtimeManager.ts:636`).
  - The warden op is marked applied at STARTED (`stagecraftCoordinator.ts:456-466`), so a nested ENDED loses it.
  - A nested force_chid sets `pass.forced` on the real pass (`talkControl.ts:87-89`).
  - Only lore skips dry runs (`index.ts:156`).
- 4/M. Risk: none; enforces 16 at the lifecycle level and keeps 15. Bucket H.

**T7. Extraction window hygiene.**
- What: one pure cleaner in `getChatWindow` (markup, hidden HTML, code fences, inline reasoning) that also drops extension-owned and foreign UI messages. Optional prompt-only regex via a new `stHost/regex.ts`.
- Why now: tracker/HTML extensions are the most-installed class, and their blocks cost tokens and can be quoted as evidence.
- Sources: vecthare `text-cleaning.js:25-126`, silly-sim-tracker, UIE `chatLog.js:3-33`, cyoa `index.js:154-169`, nemopresetext, rpg-companion, tracker, stepped-thinking, QIG, rememory, recast `contextRegex.js:6-24`.
- Ours: absent. `chatWindow.ts:6-14` passes raw `mes` and drops only `is_system`/unfinished messages. `scoreContext.ts:13` and `stagecraftCoordinator.ts:61-62` also read raw `mes` and should share the cleaner. `evidence.ts:17-60` normalizes punctuation/case only. `stripReasoningBlocks` (`parse.ts:51`) covers model output only. `/sd` posts can be visible (`stable-diffusion/index.js:4982-4985`), and `extension` type messages are dropped from boundaries, not from windows.
- 4/S (+M for regex). Risk: the prompt, `evidenceInWindow` and stored evidence must read the same cleaned text (4). The regex seam must be capability-probed (2). Re-run the live suite and goldens. Stripping `<details>` can remove author content, so the cleaner needs its own fixtures. Bucket X.

**T8. Save evidence for install-wide writes + self-healing save watcher.**
- What:
  - await SETTINGS_UPDATED and read back `/api/settings/get` before "Saved X vN to the library";
  - re-check the fetch wrapper on each observe, and re-wrap it if a peer restored `fetch`.
- Why now: the library is the S12-loss store, and `saveSettings` never rejects (`script.js:8052-8114`). DES and ST-Copilot restore `fetch` per call, which can blind chat-save evidence and make `withLedger` refuse all effects.
- Sources: QIG `host-persistence.js:32-137`, st-memory-books `stmbProgress.js:49-71`, multihog, tavernary, dooms `responseExtractor.js:75-109`, st-copilot `index.js:14449-14558`.
- Ours: absent/partial. `storyLibrary.ts:69,110,119`, `wizardSessions.ts:44,49` and `settingsStore.ts:135,161` call `saveSettingsDebounced` unverified. `persistence.ts:57-73` installs once and never re-checks.
- 4/M. Risk: none; extends 17. It lives in `stHost/persistence.ts` + the store modules, not the manager. Bucket H.
- *Verified:* the watcher loss is a **race, not constant**. It happens only if our lazy first install lands inside a peer's wrap window (plausible for DES around replies, near our first boundary persist). The result is `unsaved` ("no save request went out", `saveEvidence.ts:44-51`), sticky (`saveHealth.ts:22-31`), and `effectsApplier.ts:185` refuses every effect.

**T9. Request-size bound: token chunker + whole-scene summaries.**
- What: a pure chunker (greedy by tokens, capped by output capacity, map→reduce, each chunk with its own derived range) for summary passes: `memorize:full` summaries, backlog summaries, scene summary. The scene summary covers `[prevBreak+1, to]`. Add a pre-send budget and an author preflight confirm on manual heavy passes.
- Why now: seed D is open, and the privacy report names the whole-chat request.
- Sources: rememory `memories.js:290-351`, st-characterlibrary `lorebook-manager.js:3628-3641`, polyceph `token-budget.js:7-19`, DRST `index.js:1487-1533`, UIE `apiClient.js:442-480`.
- Ours: **partial**. `runMemorizeBacklog` already reads window by window, but by message count (`extractionCoordinator.ts:383-414`, windowSize 8), not by tokens. Only the final `memorize:full` pass is unbounded (`:428` `getChatWindow(0, chat.length-1)`). `runSceneBreakPass` summarises only the detecting window (`:288-306`). `countTokens` exists (`stHost/tokenizer.ts:3`) but is used only by `entryTokens.ts`, never for pass requests.
- 4/M. Risk: 11 (a derived range per chunk). Bucket M. This is seed D (`_baseline.md:191`).
- *Verified:*
  - Map-reduce fits summaries, **not DELTA reads**. `memorize:full` is the one pass allowed to move the blackboard, so chunking it changes the meaning (latest-wins across chunks; evidence must sit in each chunk's own window, inv 4).
  - An unknown context limit must fall back to a declared default and be reported, **not fail closed**. Otherwise extraction stops on any CM profile whose context size cannot be read.

**T10. Active speaker skips system/comment/image messages.**
- What: `activeSpeakerId` ignores `is_system` and `extra.image` entries, matching `chatWindow.ts:8` and `scoreContext.ts:13`.
- Why now: in group chats, our own transition `/comment` (name `Note`, `is_system:true`, `slash-commands.js:6113-6129`) or a group `/sd` post (`systemUserName`) as the last message makes it return null.
- Sources: prome `utils.js:8-13`.
- Ours: absent. `roster.ts:30-41` skips only `is_user`.
- **Scope, corrected:**
  - Solo is unaffected: `enabledCharacterIds` returns `[]` without a group (`roster.ts:10-21`), so the speaker is always null in solo.
  - Drafted members bypass the bug via `onMemberDrafted` (`memoryCoordinator.ts:457-463,486-497`).
  - Real impact: the public facts block in groups without the capability profile (`:448` → `inject.ts:27`), the `onMemberDrafted` fallback (`:494`), the `story_epistemic` macro / `getEpistemicBlock` (`:405-406`), and the preview (`:503`). The resting group epistemic block is already `''` (`:466`).
- 4/S. Risk: none; needs a live group probe (it depends on an `updateInjection` running after the note posts). Bucket M.

**T11. Downgrade guard + declared host minimum.**
- What: a blob with `version > 4` is read as detached (no automatic writes, journaled) and never replaced. Add `minimum_client_version: 1.18.0` to `manifest.json`, asserted against the README by `test:release`.
- Why now: pinned-version installs make downgrades ordinary, and v2.4 will bump the blob (T3).
- Sources: tavernary `state-migrations.ts:18-19` + `manifest.json:9`; ST `extensions.js:580-590,658-660` (the real host evidence).
- Ours: absent. `persistence.ts:44-56` sends unknown versions to `persistenceMigration.ts:20-23`, which returns null, so `createBlob()` is written over the blob (`:69-72`). The V5 foreign-stamp path (`:57-67,75-80`) is the mechanism to reuse.
- 4/S. Risk: none; completes 13. Bucket H.
- *Verified:* the library (`storyLibrary.ts:35-47`) and wizardSessions carry no schema version. Guarding them means first introducing a stamp, so that is a follow-up, not part of this item.

**T12. WI activation evidence.**
- What: a new stHost seam on WORLD_INFO_ACTIVATED feeding a per-generation, chat-scoped ring, self-cleared on GENERATION_STARTED. LoreSelector reports forced≠landed; constant/forced entries are flagged when they did not land. Add a Repair check when a foreign scan filter (TunnelVision/STLO) suppresses a story book.
- Why now: `force()` returns `wrote()` on emit, which is not evidence, and foreign dry scans clear forces.
- Sources: probablytoomanytabs `context-status-bar.js:244-273`, st-lorebook-ordering, st-gamemaster, bettersimtracker `index.ts:472-503`, QIG, tunnelvision `index.js:115-144`; ST `world-info.js:900-903,4885-4888,5043-5064,5275`.
- Ours: **partial**. The product has no subscriber (`worldInfoActivate.ts:18-26`; `events.ts:30-32` lacks the key). The debug harness already records activated uids per event (`scripts/debug/so-lore-probe.mts:10,20,37`), and that logic can be lifted.
- 4/M. Risk: author-only display (9); the ring is trimmed on rollback (11); it never writes WI (14/6). Bucket W.
- *Verified:*
  - forced≠landed matters only when the judge `loreSelect` is on (off by default);
  - flag only constant/forced misses, because keyword-gated or mirror entries not firing is often legitimate and would be noise;
  - Repair (settings EntryPoints) is not author-only, so its wording must be player-safe.

**T13. Spike: checkpoint WI gating at scan time (WORLDINFO_ENTRIES_LOADED).**
- What: apply the pure `worldInfoPlan` to per-scan shallow copies instead of writing flags into lorebook files. The same seam allows an unbound mirror and member-scoped lore.
- Why now: it removes the whole cross-chat leak/release class that inv 14 exists to contain, and fixes mirror chat-slot competition and the branch leak.
- Sources: tunnelvision `index.js:80-81,115-144`, st-lorebook-ordering `index.js:237,1350`, st-memory-books `index.js:12978-13015`; ST `world-info.js:~4535,4604,4639,4801`, `vectors/index.js:1629`.
- Ours: absent. `effectsApplier.ts:95-103,219` writes the flags. `storySelection.ts:27` `releaseGatedWorldInfo` runs at `runtimeManager.ts:231,546,607`. The event is typed but unused (`events.ts:32`). Our own LoreSelector reads `getSortedEntries` (`worldInfoActivate.ts:10-13`), so it would see the gated view too.
- 4/M. Risk: the vectors extension shares `getSortedEntries` (arguably desirable); the ST editor shows file state (the author view must show effective state); no-op while requirements are not ready; keep the file path as a capability fallback. Bucket W.
- *Verified:* two gaps.
  - Today's release step also protects chats that play NO story. A scan-time design must disable every library story's gated set at scan time when no story is loaded, or file state leaks checkpoint lore into non-story chats.
  - Files already carry flags written by the old path, so they must be normalised once.
  
  The inv-14 wording ("rebuilt from the chat's path, never toggled in place") needs rewording; the path-replay semantics are kept.

**T14. Mirror book lifecycle and hygiene.**
- What:
  - fix the CHAT_DELETED / GROUP_CHAT_DELETED / WORLDINFO_UPDATED payload typing;
  - reap owned mirror books on chat delete via confirm/Repair;
  - **stop mirroring scene rows** (they are keyless and inert, and scene history is already injected via `INJECTION_REGISTRY.memorySceneHistory`, `injectionRegistry.ts:17`);
  - strip roster/persona names from mirror keys;
  - cap the budget share.
- Why now: every deleted story chat leaves an orphan mirror book behind for real players, and mirrored scene rows do nothing today.
- Sources: chat-top-info-bar `index.js:677-679`, vecthare `index.js:323-340`, DRST `source/index.js:11540-11541`, rememory (`memories.js:113-128` keyed entries, `:283-288` name strip), st-lorebook-ordering; chatsplus is only a negative example (`:2920-2960` is `handleCharacterDelete`). ST `script.js:1354,1401,10884`, `group-chats.js:1334,2269,2308`, `world-info.js:4160,4905-4908`.
- Ours: absent. `events.ts:11-12,30` types the events as `[]`, and there is no reaper. Scene rows carry `entities: []` (`extractionCoordinator.ts:300`), and `upsertWIEntry` sets keys only when present (`worldInfo.ts:204`). The mirror passes `entry.entities` as keys (`memoryMirror.ts:110`).
- 4/S. Risk: deletion is destructive, so it needs a typed WriteResult + confirm (16). Keying scene rows would double-inject. Bucket M.
- *Verified:* **the leaked book is not global/active.** The mirror uses `ensureLorebook` (`worldInfo.ts:116`, no activation) and binds only the chat slot (`memoryMirror.ts:122`), so the leak is an inert orphan file per deleted chat (list clutter), not live lore. Severity lowered. "Relationship keys fire every turn" is plausible but unmeasured.

**T15. Speaker-aware evidence + "player writes attempts" agency clause.**
- What: evidence from an `is_user` message satisfies only `read_as` choice/stated qualities unless the quality opts in (`evidence_from`). Add an optional `AgencyPolicy.player_attempts_only` steering line.
- Why now: a player can currently satisfy an outcome gate by declaring it ("I grab the Sun Idol").
- Sources: st-gamemaster `prePass.js:79`, `injection.js:109-114`. These back only the steering half (a rewritten attempt injected into the main model). **The evidence rule is our own derivation.**
- Ours: absent.
  - `chatWindow.ts:12` keeps the name only (`is_user` is lost when a name is set), and `contract.ts:37-41` has no speaker rule.
  - `evidenceInWindow` (`evidence.ts:46-60`) returns a boolean over plain strings. It must return the matched message to apply the rule.
  - `engine/agency.ts:20-35` covers model→player only.
  - `read_as` choice/stated/rating already exist (`schema.ts:38`).
- 4/M. Risk: C4 (absent = defaults, `agency.ts:3-10`), so the new clause ships default off or gets an explicit decision. `evidence_from` is a schema addition: it needs a storyDiff classification and a `DIAGNOSTIC_CONSEQUENCES` entry. Apply it to the judge typed-extraction path (`judge/extraction.ts`) too, or gates diverge by path. Live-suite fixtures needed. Bucket X.

**T16. Default checkpoint objective block + AN-inheritance diagnostic.**
- What:
  - an `INJECTION_REGISTRY.objective` block (checkpoint name, objective, guidance, last visited, agency clause), re-rendered on activate/hydrate/rollback/swap and suppressible per story;
  - a diagnostic when a checkpoint without `author_note` inherits the previous AN, and when guidance never reaches the model.
- Why now: today the objective reaches the main model only through a hand-written AN or macros, and **`checkpoint.guidance` has no runtime consumer at all**, whether authored (`schema.ts:156`, `validate.ts:344`) or generated (`merge.ts:29`).
- Sources: superobjective `index.js:437-492` (current task at `:464-478`; we deliberately exclude its upcoming-task lookahead).
- Ours: partial.
  - The `story_current_checkpoint` macro renders only if the author places it (`macros.ts:7-11,42`).
  - There is no objective key (`injectionRegistry.ts:12-23`).
  - The pacing hint appears only when drifting (`pacingCoordinator.ts:99`, `steering.ts:47-56`).
  - The AN is inherited unless explicitly null or empty (`effectsApplier.ts:55-70,222`).
  - There is no such diagnostic (`diagnostics.ts:13-35`).
- 4/M. Risk: no upcoming-checkpoint lookahead (C4). The block must be a registry entry (for the next-turn preview), refresh its own injection (16), and have an `INJECTION_DEPTH_COLLISION_ALLOWLIST` entry if it shares a depth. On by default it duplicates the objective in stories whose AN already restates it, so decide the default explicitly. Bucket S.

**T17. Curator hardening bundle.**
- What:
  - refuse `[rewrite]` when the entry content exceeds what the prompt showed;
  - uid addressing, and refusal of ambiguous or prefix titles;
  - rejected-op memory from the proposal ring;
  - a word diff on review cards (`record.before.content` is already stored);
  - fuzzy anchors in review mode only.
- Why now: the curator can overwrite text it never saw and retarget `Harbor Master` → `Harbor`.
- Sources: st-copilot `index.js:1133-1160,3788-3806`, WREC `constants.ts:97,104-109` + `CompareEntryPopup.tsx:11-30`, lalib `index.js:2958`, CREC, rewrite-extension (weak).
- Ours: partial.
  - The prompt truncates content to 400 chars but offers a full replace (`stagecraft/prompt.ts:3,13,32`), and `previewCuratorOp` never compares lengths (`proposal.ts:53-57`).
  - The bidirectional `startsWith` fallback retargets (`parse.ts:15-20`), and `CuratorEntryView` has no uid (`types.ts:45-51`).
  - `writeOp` records `before.uid`/`target.uid` (`stagecraftCoordinator.ts:291-294`) but never uses them to address or cross-check.
  - Rejected ops are never fed back (`:137-187`), and the review card has no diff (`StagecraftPanel.tsx:92-96`).
- 4/S. Risk: none; the allowlist re-check at the write edge is kept (6, `stagecraftCoordinator.ts:278`). Bucket S.
- *Verified:* `applyCuratorPatch` is already case- and whitespace-tolerant (`proposal.ts:3,13-20`). "Auto mode stays exact" therefore means keeping today's tolerance, not tightening to byte-exact. Value is for opt-in authors (the curator is off by default).

**T18. Per-pass profile routing.**
- What: optional install-wide profiles per pass family (read / synthesis / authoring / director / curator), falling back to `extraction.profileId`. Requests go per request through CM (`connectionProfiles.ts:43`), never through a global switch. Each assigned profile gets a self-test and a Repair row.
- Why now: the director and wizard share the extraction profile, and the slow-pod vs fast-read trade-off keeps coming up.
- Sources: polyceph `orchestrator.js:327-390`, guided-generations `runGuide.js:27-35,95`, st-gamemaster `connectionService.js:53-100`, UIE `apiClient.js:1049-1058` (weaker analogue: an endpoint, not a CM profile), DRST.
- Ours: absent. A single `extraction.profileId` (`settingsStore.ts:30`) is used by:
  - the director (`runtime/index.ts:174-178`);
  - the curator (`stagecraftCoordinator.ts:148`);
  - the copilot/wizard (`copilotCoordinator.ts:32-33`);
  - memory passes (`memoryCoordinator.ts:239,343`);
  - extraction passes (`extractionCoordinator.ts:296,328,352,369`);
  - expansion/critic (`generate.ts:30`, `critic.ts:75`);
  - the live suite (`liveSuite.ts:62`).
- 3/M. Risk: install-wide home (13); the judge (7) is unaffected. Bucket X.
- *Verified:* `selfTest.ts:158` and `repair.ts:28` key off the single id, so each role needs its own row. The live suite scores extraction prompts only, so the director, curator and wizard need their own calibration, and no floor may be retuned.

**T19. Author observability: next-turn cost/fate + provenance navigation.**
- What:
  - the next-turn preview shows tokens per SO block and its share of context;
  - it shows other extensions' injected blocks, read-only;
  - it shows each memory row's fate (quarantined / superseded / other speaker / over budget) and trim telemetry;
  - every "message N" citation opens that message via `/chat-jump N`.
- Why now: cheap, author-only, and it is the gap behind several "empty block" gotchas.
- Sources: astraprojecta `chatContextUsage.ts:227-248` (CC-only budget), probablytoomanytabs, guided-generations, vecthare `search-debug.js:48-135`, improved-memory, smart-memory `trim-stats.js:79-110`, chat-top-info-bar, timelines `tl_utils.js:66-89` (the DOM-click counter-example); ST `slash-commands.js:3449-3490`.
- Ours: partial.
  - The preview reports characters only (`nextTurn.ts:23`).
  - `readInjectedPromptBlocks` filters to the `story_` prefix (`promptInspector.ts:10,21`), despite the claim at `nextTurn.ts:71-74`.
  - `selectWithinBudget` returns `dropped` (`memory/budget.ts:78-79`), but `inject.ts:29` discards it; the only fate signal is a pinnedOverflow count (`DrawerTabs.tsx:224-226`).
  - `ConflictQueue.tsx:17-19` prints "message N" as plain text.
  - `stHost/tokenizer.ts:6-7` already exists.
- 3/S-M. Risk: author-only (9), snapshot-fed (18), host reads via stHost (2); SO never touches message DOM. Bucket U.
- *Verified:* our live backend is textgen, so the budget must come from ST's textgen max-context/response settings, each a verified host fact before it is vendored. Overlaps replan V19 ("next-turn open owning editor"); build them together.

**T20. Host interop fixture corpus.**
- What: no-backend scenarios and `so-turn-types-check` rows for each mutation/lifecycle shape above. These are written first, as the failing spec for T1–T3, T6 and T7:
  - middle delete, no-op edit, `messageEditMove`, `/hide`;
  - silent `mes` rewrite (fault shape #10), same-chat reload, branch mid-story;
  - nested quiet generation inside GENERATION_AFTER_COMMANDS, foreign `{source}` emitter, unpaired STARTED;
  - out-of-band swipe append, CYOA/Roadway synthetic messages, tool-call turn, post-processor rewrite.
  
  Also a guard that every subscribed event name exists in ST's `eventTypes` **as a key or a value**.
- Why now: none of these shapes is exercised by the current corpus, which covers ST turn types only.
- Sources: rewrite-extension `index.js:1462-1471`, lalib `index.js:6285-6301`, timeline-memory `agentic-timeline-fill.js:939-956`, cyoa `index.js:142-143`, astraprojecta, guided-generations, roadway, more-flexible-continues, stepped-thinking, mcp, timelines, recast, silly-sim-tracker.
- Ours: partial.
  - `scripts/debug/so-turn-types-check.mts:10-21` covers /sd, one reply, greetings, reopen, greeting swipe and event identity.
  - `test/findings/faultMatrix.json` has 9 shapes, none of them a silent edit or reload.
  - `plan03a-delete-rollback.json:71` and `plan03a-edit-rollback.json:71` cover delete-at-0 and a real edit.
  - The null-id MESSAGE_DELETED/EDITED case is already in live-v4-turn-identity (not re-proposed).
- 4/S for no-backend rows; the live rows are more. Risk: none (harness only, 20); the live rows fold into queue L5. Bucket T.
- *Verified:* `resolveEventName` falls back to the raw string (`stHost/events.ts:48-52`), and all 17 subscribed keys exist today, so the guard is preventive. It must accept a value too: `runtime/index.ts:198` subscribes `extension_settings_loaded` (`stHost/context.ts:33`). Each shape needs a verified host fact before its row is written.

### Added after the verification pass (T21–T25)

These come from `./jeved.md` and `./reddit-jev-threads.md`. **Each is unverified (added after the verification pass)**: no adversarial verifier re-read the sources or our code for them. Numbering continues after T20 and does not rank them against T1–T20. Every item is a judge use or judge plumbing, so inv 7 binds each one: off by default, never flipped by a plan, own fixture, predeclared floor, no floor retuned after seeing a score.

**T21. Read Score answers raw + a predeclared hybrid lore arm.**
- What:
  - rank calibration arms on `answer.score` and keep `scoreToLevel` for labels only;
  - predeclare three lore arms and score them on ≥20 fresh rows labelled blind per the fixture's `labellingRule`: raw Score, Noul primary with raw Score as tiebreak (the hybrid), and optionally the "relevant when" trigger arm (Reddit R6);
  - declare reachable floors (precision@4 is capped at 0.5 by construction);
  - correct the recorded lesson "a coarse Score scale ties more than a probability" in `10-judge-seeds.md`, `.claude/CLAUDE.md` and `_baseline.md` §3B.
- Why now: `loreSelect` is a reply-path use whose known weakness is ties (`recommended-config.md:38`). Plan 10 refused the Score rebuild partly on a tie rate of 1.00 that our own rounding produced.
- Sources: Jeved reads Score raw (`src/sensor-types.js:115-119`, fractional thresholds `src/defaults.js:266,279`). jeved.md F1 re-ranked the golden's recorded answers read-only: raw Score gives nDCG@4 0.9197 with tie rate 0.04; the hybrid gives 0.9272 with tie rate 0.00; shipped Noul gives 0.9272 with 0.08.
- Ours: partial. `scoreToLevel = Math.round` (`loreScore.ts:45,65`), sort on the level (`loreRelevanceCalibration.ts:106`). The golden keeps the raw values (1600 answers, 1591 non-integer). The hybrid was listed as unmeasured (`10-judge-seeds.md` §Audit).
- 4/S (measurement) + M (if the hybrid clears its floor: questions per chunk double from 64 to 128, still one call). Risk: the re-rank is post-hoc on seen data, so it is exploratory only (inv 7). `pickLore` changes only past a floor, and the doubled state must still fit the 1500 ms budget (p50 509 ms today). Bucket J.
- **Verified 2026-09-23 (independent recompute, real ranking code, no judge calls; `.debug/lore-raw-rerank.ts`): CONFIRMED.** All four arms reproduce exactly: Noul 0.49/0.9272/tie 0.08; rounded Score 0.49/0.886/1.00 (boundary 0.64); raw Score 0.48/0.9197/0.04 (boundary 0.00); Noul→raw-Score tiebreak 0.49/0.9272/0.00. Golden: 1600 Score answers, 257 distinct, 1591 non-integer, range 0–4.14.
  - Rounding was NOT predeclared: `10-judge-seeds.md:59-61` Build says "sorts by level then score", which equals the raw arm. `loreScore.ts:56` comment ("raw scale value") is wrong.
  - Caveat: the fixture's labelling rule was violated. Unlabelled top-4 entries count as irrelevant: 3 in rounded Score, 2 in raw Score. Upper bound for raw Score even if all are relevant: nDCG 0.9208 < Noul 0.9272, so "Noul stays" holds.
  - The hybrid changes no top-4 set on this data (Noul boundary tie is already 0.00). Its only gain is the cosmetic tie rate, and it doubles the questions.
  - Docs stating the wrong lesson, to correct:
    - `10-judge-seeds.md:160-161,169-174`
    - `.claude/CLAUDE.md` plan-10 paragraph
    - `.claude/rules/architecture.md:97`
    - `v2.4-seeds.md:23-24` (drop the "finer scale" seed)
    - `_baseline.md:175-176` (**corrected 2026-09-23**; see `## v2.3 carry-over`)
    - `11-acceptance.md:809` (misleading by omission)
    - `recommended-config.md:38`, which attributes tie 1.00 to the shipped **Noul** arm and is wrong under any reading
    - `src/judge/loreRelevance.test.ts:54` asserts the rounding artifact.
  - Revised value: the correction itself is worth doing now. A raw-Score rebuild is not worth pursuing: no nDCG gain, and the fresh-row measurement is optional.

**T22. Agency check through the warden.**
- What: a warden-family Score question, "does `reply` write what only the player does, says, decides or thinks?", over the same `reply` state the continuity check already sends. Past its floor it produces a one-turn depth-0 note (`INJECTION_REGISTRY.continuityNote` path), `review|auto`, lapsed by a newer reply and withdrawn on rollback. Never a reroll.
- Why now: agency is prompt-only today. `DEFAULT_AGENCY.never_narrate_player_action` only adds a clause (`engine/agency.ts:8,34`, `pacing/steering.ts:24`), and `agencyRecovery` detects only a *refused* route (`runtime/agencyRecovery.ts`). Narrating the player's compliance is the defect C4 exists to prevent, and nothing measures it.
- Sources: Jeved Puppet, a tested rubric separating perception, restating and small reactions from choices (`src/defaults.js:97-109`, threshold > 2.85 on 0–4, `:266`). The recast seed (§8). Reddit: "follow the card / ruleset" sensors named as the value (u/GasSmooth7439, u/FromSixToMidnight). Reddit also criticises OOC over-steer, so the note must be measured for over-correction (R9).
- Ours: absent. grep `puppet|player_attempts` in `src/` = 0. The delivery path exists: `stagecraftCoordinator.ts:384-470` (warden run, lapse, `onGenerationStarted` note), `judge/curators.ts:11-17` (`buildContinuityRequest`).
- 4/M. Risk:
  - inv 7: own ≥20-case fixture with a Spanish slice, own floor, a `judge.uses` key off by default;
  - inv 6: the warden's non-boundary note path, the one stagecraft exception;
  - inv 9: the note and its record are author-only;
  - a reroll variant would break 3/7/11;
  - overlaps T15's "player writes attempts" clause (the steering half), which should be decided together.
  Bucket J.
- *Unverified (added after the verification pass).*

**T23. Authored `house_rules`, checked in the warden's call.**
- What: an optional story-level (and possibly per-checkpoint) list of narrator rules. Each rule becomes one Noul, "`reply` follows this rule: …", in the warden's request, capped like `CONTINUITY_MAX_FACTS`. A broken rule, past its floor, yields a one-turn note that names the rule verbatim. Each question sees only the reply and the rule, not the preset.
- Why now: authors have no place for stylistic or behavioural constraints except the AN. Jeved users asked for exactly this check: u/majesticjg wanted to "isolate parts of my preset and ask Jev", and it shipped as per-sensor context isolation in 0.4.
- Sources: Jeved House rule / `house_rules` list (`src/defaults.js:206-218,408-419`; `releases.md` v0.4.0/v0.4.1); Reddit 1wltedh. The post bodies (user paste 2026-09-23) add the author's own rule that objective compliance questions over the card + a few replies work, while whole-transcript questions do not (Reddit C13). Scope unchanged.
- Ours: absent. There is no authored rule field (`engine/schema.ts`; grep `house_rules|rules|constraint` = none). The warden's request shape fits as-is (`judge/curators.ts:11-35`).
- 3/M. Risk:
  - a schema addition → a `storyDiff` classification + a `DIAGNOSTIC_CONSEQUENCES` entry;
  - rules are authored, so they live in the pinned story copy (inv 12), never in chat state as Jeved's lists do;
  - inv 7: the family's fixture must include rules the reply legitimately does not touch (a false "broken" there is the failure mode);
  - over-steer probe (R9).
  Bucket J.
- *Unverified (added after the verification pass).*

**T24. Judge usage accounting + readiness keyed by model.**
- What:
  - copy `usage` (input/output tokens, plus a host's `cost` if sent) into `JudgeCallRecord`, with per-session totals in the author view;
  - give each `JUDGE_READINESS` fact a `measuredOn` model;
  - have the panel read "not measured on <model>" when `settings.model` or the last answering model in the ring differs;
  - add a "costs N calls" confirm on bulk calibrate/backlog.
- Why now: `recommended-config.md:22-23` says cost "is not measured", yet Jev already returns `usage` and we drop it. Reddit's only numbers are cost anecdotes (u/Miserable_Store_3269: 47 h for $0.0017; u/Subushie: 650 requests for $0.04) that we cannot compare against because we record nothing. A user who changes the model today sees jev-1.13.0's rates.
- Sources: jeved.md idea 6 (Jeved reads `usage`, `src/classifier.js:191-193,238`); `reddit-jev-threads.md` R1/R2, C4.
- Ours: partial. `JudgeResponse.usage` is typed (`judge/types.ts:62`) and never read (grep `usage` in `src/runtime` = 0). `JudgeCallRecord` has no token fields (`types.ts:80-91`). `readiness.ts:15-40` carries no model, while `settings.ts:38,55,69` makes the model configurable.
- 3/S. Risk: inv 9 (author-only); ring cap 300 unchanged (the record grows by two numbers); inv 7 (a model mismatch reads `unproven`, never a re-floor). Bucket J.
- *Unverified (added after the verification pass).*

**T25. Plugin host table + token-based request guard.**
- What:
  - the server plugin gains a host table (TypeSafe, NanoGPT decisions, OpenRouter decisions, a local Jev-like at a configurable base URL + path) with a model-id map (`typesafe/jev-1.13` ↔ `jev-1.13.0`) and the key per host held server-side;
  - it records the answering model and treats an unreported one as unmeasured;
  - every host×model pair is its own calibration run;
  - add a request guard in estimated tokens beside the 140k-char refusal, once Jev's context limit and overflow behaviour are verified.
- Why now: hosted routes exist per vendor statements (NanoGPT confirmed against Jeved's exact request, per Reddit). Jeved routes through the browser with a plain-text key; we must not. A context of ~32k tokens is claimed by three sources, and 140k chars is ~35k tokens.
- Sources: jeved.md F3/idea 5; `reddit-jev-threads.md` §Provider/API claims, C5, C9, C10 (laya-multilingual reportedly works through Jeved's custom provider). The user paste (2026-09-23) narrows the local row, though the design is unchanged:
  - the same user later reports laya's context as ~1024 tokens, below every state we send;
  - openjev speaks an NLI contract, so it would need an adapter in the plugin;
  - a local Jev-like is therefore a host with no vendor, but not drop-in;
  - the OP's "ZDR on OpenRouter" is unlinked, so the per-host privacy row still needs the host's own terms (C17).
- Ours: partial. The `TYPESAFE_BASE_URL` override exists (`server-plugin/story-orchestrator-judge/index.mjs:22`), but the path is fixed to `/v1/systemone`, the model is `jev-1.13.0` (`:8`), and the refusal is by chars (`:10,96`). No current use approaches the cap (lore chunk ≤64 × 600 chars; warden ≤40 facts), so the guard is preventive.
- 3/S-M. Risk:
  - inv 7: per-host calibration, `modelMatched` via the map;
  - the privacy report needs a row per host, because a hosted route adds a second third party;
  - an `alpha` OpenRouter path may change;
  - all endpoints and ids are claims until probed.
  Bucket J.
- *Unverified (added after the verification pass).*

Next tier (not ranked, not verified):
- PERSONA_CHANGED requirements re-evaluation (quick-persona, 4/S)
- roster aliases/canonicalization (dooms, smart-memory, 4/M)
- append-only short_term (improved-memory, 4/M)
- cross-chat Continue list (chatsplus, landing-page, 4/M)
- complication pool (dooms, 4/M)
- story-owned scenario override (DRST, 4/M)
- CC sampler overlay at SETTINGS_READY (mcp, 4/M)
- re-commit after third-party rewrite (recast, 4/M)
- swipe-back cache (6 repos, 3/L)
- interceptor trimming / witness filtering (improved-memory, presence, 3-4/L)

### Rejected on verification

None. All 20 verdicts were `keep=true`. No item was demoted; T2, T9 and T12 were corrected from absent to partial, and T10/T14 were narrowed in scope/severity.

## Overlap with existing v2.4 seeds (`docs/plans/v2.3/v2.4-seeds.md`)

| Seed | Recommendation | Relation |
|---|---|---|
| A. CC preset adapter (build vs textgen-only) | next tier: SETTINGS_READY overlay (mcp); `/preset` + exact read-back (st-generation-locks, polyceph); prompt-toggle effect (nemopresetext) | Gives a third option: a per-request overlay needs no global write and no restore. Informs the decision; does not settle it |
| A. `player_summary` | T16 (objective block), silly-sim-tracker player-visible qualities | Adjacent; objective block is model-facing, not player-facing |
| B. WI curator `create` op (F5) | T17; tunnelvision trigram near-dup; WREC patterns | Reinforces: near-dup warning and uid addressing belong in F5's Phase A |
| B. `sceneOoc` / `memoryRerank` no consumer | statsuite deterministic OOC filter; vecthare embedding rerank | Gives each a candidate consumer or a reason to delete |
| B. plan-10 scene-break confirmation spike | timeline-memory model-chosen breakpoint; vecthare/rememory manual scene end | Fold in |
| C. Live-suite per-tier floors | statsuite fixture export; bettersimtracker shadow arm; multihog full-restatement spike; blazetracker/rpg-companion current values in prompt | Supplies more fixtures and A/B arms; floors still set from measurement |
| D. No request-size bound | **T9** | Replaces the seed with a concrete design |
| D. Out-of-horizon history ("re-read vs restart") | timelines replay-via-branch; T2 | Third option: branch from the checkpoint's start message |
| D. `so-assets` leaves `worldInfoCache` stale | multihog host fact: `worldInfoCache` exported with `.delete` (`world-info.js:882`) | Direct fix |
| D. `commitDecision` id-keyed restore | QIG durable transaction + `restorePropertyIfUnchanged` | Reinforces; copy shape, keep evidence-decided failure |
| D. Expansion `generating` marker wedge | T4 (abort on epoch change) | Partial: an aborted generation clears the marker path |
| E. Save-evidence asymmetry | **T8** | Extends evidence to install-wide store; keep asymmetry |
| V19 hide dead toggles | statsuite OOC / vecthare rerank | Wire-or-remove input |
| plan 09 community theme row (unrun) | moonlit theme axis in `so-responsive` | Direct candidate |
| Human-eval rubrics outstanding | flowchart per-message "flag this message" | Better-anchored flags for sessions |
| B. Lore-ranking rebuild via Score arm (refuted) | **T21** (unverified) | Qualifies the refutation. The Score arm was scored after `Math.round`, and the raw value ties 0.04, not 1.00. The verdict "Noul stays" survives on nDCG. The lesson "coarse Score ties more" and the seed "a finer scale" do not |
| B. Judge drift unmeasurable (`jev-latest` = `jev-1.13.0`) | **T24/T25** (unverified) | Adds the hosted-alias case (`~typesafe/jev-latest`, `typesafe/jev-1.13`) and a panel that says when a use runs on a model it was not measured on |
| B. `sceneOoc` / `memoryRerank` no consumer | §11 `memoryRerank` spike (Reddit R7) | A third candidate consumer, on a low-evidence claim; still wire-or-remove |
| Plan-11 cost/latency report not measured | **T24** (unverified) | The cost half is blocked on our own ring, not on a metered session alone: `usage` is dropped |

## Patterns to copy / anti-patterns seen (cross-repo)

Copy:
- Diff chat-identity snapshots to decode deletes (st-memory-books, UIE).
- Fail closed on uncertain host state (st-memory-books branch handling, polyceph token budget, statsuite breaker).
- Await the post-save event, then read back (QIG, st-memory-books) — the settings twin of our chat-save evidence.
- Durable transaction: mutate → persist → validate → roll back fields still holding our write (QIG `chat-transaction.js:49-77`).
- Scan-local WI shaping on per-scan copies (tunnelvision, STLO) rather than file writes.
- `custom.signal` + chat-scoped epoch for every side call (QIG, flowchart, polyceph).
- Per-swipe results keyed by content, not index (inverse of rpg-companion/bettersim bugs).
- Pin prompt text in a golden so calibration drift is visible (dooms).
- Resilient bootstrap: per-module try/catch + visible init failure (QIG `index.js:22625-22760`).
- Stop controls on long manual passes (bettersim, improved-memory, st-characterlibrary).

Anti-patterns (SO already avoids; keep on the review checklist):
- State written from main-model reply markers or tool calls mid-reply (DRST, sorcery, tunnelvision, mcp-reverse, silly-sim-tracker) — breaks 3/4/5/11.
- Blocking reply path: LLM work in awaited GENERATION_AFTER_COMMANDS / interceptors / MESSAGE_RECEIVED, send-button locking, stop-and-replay (guided-generations, tracker, statsuite, recast, bettersim, vecthare, improved-memory).
- Global profile/preset swaps with sleeps for side calls, DOM `#connection_profiles` change (polyceph, rememory, tracker, dooms, multihog, tunnelvision, rewrite `oai_settings` Object.assign).
- Mutating global prompts and restoring on a later event (sorcery — leaked permanently).
- `is_system` flips / chat splices / DOM-click deletion to shape prompts (presence, cyoa, rememory, timeline-memory, UIE).
- Unowned async writes, chat-blind caches, generation counters not chat-scoped (rpg-companion, UIE, wtracker, silly-sim-tracker).
- Install-wide per-chat state / cross-chat memory in `extension_settings` (smart-memory, DRST, vecthare per-hash metadata).
- Probabilistic recall with fade-then-delete (rememory); keyword forcing score=1.0 (vecthare).
- Prompt-only "locks" (dooms, rpg-companion) vs our lock = truth.
- innerHTML of remote/model text (chub-search, CREC compare popup, wtracker Handlebars noEscape).
- Guessing host shapes: undefined event keys (`SWIPED`, `CHATLOADED`, `MESSAGE_SWIPE`), string role in `setExtensionPrompt`, BFS boolean flipping, `z.coerce.number` on ids (st-gamemaster, timelines, silly-sim-tracker, DRST, flowchart).
- Interceptor returning a clone (ignored by ST) (silly-sim-tracker).
- Put-back-on-throw around `saveSettings`/`saveMetadata` (tavernary, dooms) — never rejects.
- Overwrite-existing-card flows (CREC), bulk-apply behind one confirm / silent retarget (WREC).
- Side-effecting macros that drain on evaluation (st-gamemaster).
- Unbounded polling loops (css-snippet-manager); settings wiped in `onDelete`, reload in `onEnable` (PTMT).

## ST host facts (consolidated)

Contradictions with our code/docs/gotchas are marked **CONTRADICTS**.

Events and mutation shapes
- **CONTRADICTS `turnBridge.ts:159-170`**: MESSAGE_DELETED emits post-delete `chat.length`, also for middle `deleteMessage` splices and `/cut` (`script.js:1611,1678-1699,4411,11734`; `power-user.js:2853`). (st-memory-books, UIE, mcp, roadway, st-gamemaster, st-copilot)
- **CONTRADICTS `events.ts:11-12`**: CHAT_DELETED(name without .jsonl) fires after `chat_metadata = {}` for the current chat (`script.js:1350-1354,1401,10884`); GROUP_CHAT_DELETED(chatId), once per chat when a group is deleted (`group-chats.js:1331-1335,2269,2308`). (chat-top-info-bar, chatsplus, vecthare, DRST)
- **CONTRADICTS `events.ts:30`**: WORLDINFO_UPDATED(name, data) after the POST (`world-info.js:4151-4192`). (st-copilot, WREC)
- `messageEditMove` swaps `chat[]` entries and saves with no event (`script.js:8352-8395`); `messageEditDone` emits MESSAGE_EDITED unconditionally, then MESSAGE_UPDATED, for the final id only (`script.js:8398-8431`). (astraprojecta, lalib)
- `hideChatMessageRange` flips `is_system`, saves, emits nothing (`chats.js:147-169`). (flowchart, presence, st-memory-books, st-copilot, rememory)
- `addOneMessage` renders only; caller pushes; no event (`script.js:2551-2607`). Writing `chat[i].mes` + `saveChat` emits nothing (`st-context.js:155`). (cyoa, QIG, rewrite, roadway)
- `reloadCurrentChat` emits CHAT_CHANGED for the same chat id (`script.js:1703-1726,7700`; `group-chats.js:318`). (timeline-memory, QIG)
- Swipe to an existing swipe emits only MESSAGE_SWIPED, no render (`script.js:10288-10320`); only generated swipes render. Refines our gotcha "`swipe` commits a boundary". MESSAGE_SWIPE_DELETED `{messageId, swipeId, newSwipeId}` shifts later indices (`script.js:9367-9388`). (statsuite, dooms, bettersim, rpg-companion)
- `message.extra` is per swipe via `swipe_info[i].extra` (`script.js:6896-6958,7015-7018`). (rpg-companion, dooms, blazetracker, improved-memory)
- **Refines implicit assumption `runtimeManager.ts:633-634`**: nested `generateQuietPrompt` emits its own GENERATION_STARTED('quiet') + GENERATION_ENDED (via `hideStopButton`) inside a loud turn and deletes `body.dataset.generating` (`script.js:3084-3116,3532-3536,5693-5703,7075-7079`). ST's only generation emitters: STARTED(type, params, dryRun) `:4299`, ENDED(chat.length) `:3536`, STOPPED() `:5618`; any other shape is third party. (stepped-thinking, guided-generations, dooms, roadway, UIE)
- **Refines gotcha "dataset.generating is sturdier"**: any extension's `deactivateSendButtons` sets it; `activateSendButtons` clears `is_send_press` (`script.js:7075-7089`). (rewrite, roadway)
- GENERATION_AFTER_COMMANDS is awaited before prompt assembly and before the textarea message is pushed (`script.js:4321` vs `:4453`); skipped when a slash command interrupts (`:4310-4318`). Emitter awaits listeners sequentially (`lib/eventemitter.js:130-153`); `makeFirst/makeLast` exist (`:66-110`). (guided-generations, tracker, st-gamemaster, presence, recast)
- GENERATION_STARTED fires for dry runs (Prompt Manager dry-runs `openai.js:709`); interceptors are skipped on dry run (`script.js:4561-4573`); GENERATE_AFTER_DATA(data, dryRun) `:5318`. (rewrite, silly-sim-tracker)
- Generate interceptors: awaited in manifest `loading_order` then name, errors swallowed, **return value ignored** (only `abort()`), get `coreChat` shallow copies with prompt regex applied and `index` = position in filtered coreChat (`extensions.js:2024-2049`; `script.js:4496-4528`). `ctx.symbols.ignore` on a copy blanks it from the prompt (`script.js:5841`). (improved-memory, presence, silly-sim-tracker, vecthare, statsuite)
- Tool-call turn: pre-tool text renders (MESSAGE_RECEIVED + CHARACTER_MESSAGE_RENDERED), empty placeholder → MESSAGE_DELETED, `is_system` `tool_invocations` row with TOOL_CALLS_* only, recursive Generate (`script.js:5410-5435`; `tool-calling.js:899-921`); stealth call stops generation; `RECURSE_LIMIT` is a mutable static (`tool-calling.js:255`). (mcp, tunnelvision, timeline-memory)
- CHAT_LOADED solo only (`script.js:7669`). CHAT_RENAMED `{avatarId, groupId, oldFileName, newFileName}` (`script.js:10716`) — agrees with `events.ts:8`. CHARACTER_RENAMED(oldAvatar, newAvatar) (`script.js:7246`); CHARACTER_RENAMED_IN_PAST_CHAT (`:7300-7340`). PERSONA_CHANGED(avatar) (`personas.js:154-167`); ST restores chat persona asynchronously in its own CHAT_CHANGED listener (`personas.js:1543,1602-1650`); `lockPersona` auto-creates a persona (`:1061-1079`). ONLINE_STATUS_CHANGED on change only, main API only (`script.js:7151-7157`). GROUP_MEMBER_DRAFTED awaited per member (`group-chats.js:1059-1063`). CONNECTION_PROFILE_CREATED/UPDATED/DELETED via `handleDropdown` (`shared.js:634-730`). SETTINGS_UPDATED only after 2xx (`script.js:8096-8114`).
- Community string events GENERATION_MUTEX_CAPTURED/RELEASED (not in `events.js`) (polyceph, tracker, stepped-thinking, recast).
- `/trigger`: `parseInt(arg)` before Fuse fuzzy name match (`group-chats.js:368-395`). CC `send_if_empty` posts a real user message on empty-box normal generate (`script.js:4455`).

Persistence and identity
- **CONTRADICTS `docs/plans/v2.3/03-async-ownership.md:2715`** and `multihog-…md:85`: branches/checkpoints save `{...chat_metadata, main_chat, integrity: uuid}` (`bookmarks.js:201,284`; `script.js:7406`; `group-chats.js:2370`), so our blob and `world_info` chat slot follow. `integrity` minted on load if missing (`script.js:7665`; `group-chats.js:276-278`). (timelines, st-memory-books, smart-memory, rpg-companion, st-copilot, vecthare)
- `saveSettings` never rejects, defers silently when not ready (`script.js:8052-8114`); `saveSettingsDebounced` 1000 ms (`script.js:470`; `constants.js:14`). Extends the `saveMetadata` gotcha. (tavernary, QIG, st-memory-books, multihog)
- `chat_metadata.tainted` suppresses solo greeting regeneration on reopen (`script.js:9905-9912`) — **qualifies gotcha** "every open of a greeting-only solo chat re-emits first_message": only while untainted. (DRST)
- `chat_metadata.lastInContextMessageId` set per generation, not saved there (`script.js:6083-6100`). (astraprojecta)
- `/api/chats/recent {max, pinned, metadata:true}` returns each chat's header metadata in one request (`src/endpoints/chats.js:1054-1149`). (chatsplus, landing-page)
- Per-chat card overrides `chat_metadata.scenario` / `mes_example` / `system_prompt` (`script.js:3415,3445,9002-9054`; `group-chats.js:561-562`). (DRST)
- Group chat metadata lives in the chat file header, not `groups[].chat_metadata` (`group-chats.js:268-274`) — agrees with `persistence.ts:127`. (landing-page, QIG)
- Manifest hooks `install|update|delete|clean|enable|disable|activate` (5 s race, errors swallowed) and `minimum_client_version` enforcement (`extensions.js:385,406-500,580-590,658-660`). (probablytoomanytabs, tavernary)
- `itemizedPrompts` per message in browser localforage (`itemized-prompts.js:14-55`); `SillyTavern.libs.localforage` exposed (`lib.js:89,117`). ST Files API (`src/endpoints/files.js:28-76`). `/api/secrets/find` only with key exposure (`secrets.js:560-569`).

LLM calls
- **CONTRADICTS `runOwner.ts:60-62`, `judge/types.ts:66-68`, `epochAbort.review.test.ts:9-10`**: `sendRequest` honours `custom.signal` (`shared.js:415,424,463,483`; `custom-request.js:125,152,468`); every failure incl. abort wrapped as "API request failed" with `cause` (`shared.js:487-490`). (10 repos)
- **New trap**: CC `overridePayload.json_schema` returns content already `JSON.parse`d (`custom-request.js:489-492`) → our `connectionProfiles.ts:51-54` returns `''`. `overridePayload` spreads last and beats ST per-model param rules (`custom-request.js:601-604`; `openai.js:3052-3098`). (blazetracker, CREC, flowchart, timeline-memory)
- `extractData:false` exposes `finish_reason`; `ctx.extractMessageFromData` (`custom-request.js:477-488`; `st-context.js:287`). CM profile `reasoning-template` field (`connection-manager/index.js:48`); `parseReasoningFromString(str,{strict},template)` returns null without prefix/suffix (`reasoning.js:1461-1467`) — agrees with our strip gotcha. `generateQuietPrompt`/`generateRaw` take option objects; positional calls console.trace (`script.js:3084-3088,4122-4126`); `responseLength` mutates global `amount_gen` (`script.js:4153`).
- `setExtensionPrompt(key, value, position, depth, scan=false, role, filter=null)` (`script.js:8926-8934`): `scan:true` enters WI buffer (`world-info.js:4715-4725`); role coerced by `Number()` so a string role drops IN_CHAT blocks; `filter` awaited per assembly; same-depth blocks assembled in key-sort order (`script.js:3309-3310`); depth-0 IN_CHAT lands at depth 1 on continue (`script.js:5665`).
- `getRegexedString(raw, placement, {isPrompt, depth})` runs promptOnly scripts only (`regex/engine.js:334-376`). `/chat-jump N` loads, scrolls, flash-highlights (`slash-commands.js:3449-3486`). `/preset` on CC acts on `main_api`'s manager, fuzzy fallback (`preset-manager.js:917-970`); a CC preset switch rewrites prompts/prompt_order (+ connection fields when bound) (`openai.js:377-378,5034-5079`); OAI_PRESET_CHANGED_BEFORE hands a mutable preset. TEXT/CHAT_COMPLETION_SETTINGS_READY mutate outgoing main requests, not CM requests (`openai.js:3146`; `textgen-settings.js:1844-1848`). `promptManager` null before CC setup (`openai.js:535,682`).

World Info
- WORLDINFO_ENTRIES_LOADED awaited in `getSortedEntries` with mutable `{globalLore, characterLore, chatLore, personaLore}` of per-scan shallow copies (`world-info.js:4535,4604,4638`); disabled skipped `:4801`; also feeds the vectors extension (`vectors/index.js:1629`) and fires on CHAT_CHANGED pre-cache. (tunnelvision, STLO, st-memory-books)
- Chat lore precedes persona and sorted global/character lore (`world-info.js:4624`) — mirror book gets budget first. (STLO)
- WORLD_INFO_ACTIVATED(array) only non-dry and non-empty (`world-info.js:900-903`). Forced entries still pass probability + budget (`:4886-4889,5043-5071`); any `checkWorldInfo` including dry runs clears pending force (`:418,5275`); a dry run still rewrites the AN prompt when WI adds to it (`:5268-5271`). Refines our note `worldInfoActivate.ts:16-17`. (PTMT, STLO, st-gamemaster, bettersim, QIG)
- Keyless non-constant entries are skipped unless sticky (`world-info.js:4898-4907`) → our keyless mirrored scene rows are inert. (rememory)
- `/api/worldinfo/get` answers a missing book with dummy `{entries:{}}` — **agrees** with our gotcha (multihog, rememory, WREC carry the bug). `worldInfoCache` exported, `.delete` (`world-info.js:882`). `saveWorldInfo(immediately=false)` sets cache sync, debounces POST (`:4151-4192`). Custom top-level book keys persist (`src/endpoints/worldinfo.js:154`). WI activation source precedence global → chat → persona → character (`world-info.js:4475-4590`).
- `createBranch` DOM hooks `.mes_create_bookmark/.mes_create_branch`; `/branch-create`, `/checkpoint-create` scriptable (`bookmarks.js:495,524`).

Macros / misc
- **Qualifies CLAUDE.md "migrate the seam when ST flips the flag default"**: `experimental_macro_engine` already defaults true in source (`power-user.js:302`); `macros.register(name, {category, unnamedArgs, handler})` supports parametric macros (`macros/macro-system.js:44-58`). (stat-us, bettersim, smart-memory)
- `.last_mes` goes on the last `.mes` whatever its type, so our `/comment` becomes last (prome). `#extensionsMenu` wand menu; `#objective_wand_container` reserved (`wandMenu.html:15`). `dragElement`/`movingUIState` (`RossAscends-mods.js:477-629`). Manifest `i18n` map (`extensions.js:848-878`). `SlashCommandArgument` `enumProvider(executor, scope)` (`SlashCommandArgument.js:32-64`). DOMPurify keeps `data-*` in messages (`script.js:1958-1967`) — scope harness `[data-so]` queries to mount roots (lalib).
- Harness-only: Astra hides `#nonQRFormItems` so `#send_but` is never visible (astraprojecta).
- Theirs wrong, not ours: smart-memory treats `continue` as non-committed and assumes impersonate/quiet emit CHARACTER_MESSAGE_RENDERED (both contradicted by our verified V4 notes).

## Low/no relevance repos

- character-style-customizer — cosmetic CSS, no source; only reinforces scoped CSS.
- chat-top-info-bar — chat chrome; useful only for delete/online-status seams and `/chat-jump` find.
- chatsplus — cross-chat list UI; one idea (Continue list) plus a typing fix.
- css-snippet-manager — CSS snippets; enumProvider autocomplete only.
- cyoa-extension — archived buggy option menu; interop hygiene lesson.
- dialogue-colorizer — cosmetic colours.
- lalib — STscript library; map of eventless mutations.
- landing-page — cosmetic landing screen; superseded by ST welcome screen.
- mcp-model-context-protocol — tool bridge orthogonal to SO; SETTINGS_READY overlay + tool-turn shape.
- moonlit-echoes-theme — theme; test target for plan 09 theme row.
- more-flexible-continues — continue tree; silent `mes` rewrite shape.
- nemopresetext — CC prompt workstation; reasoning-in-window + CC toggle evidence.
- probablytoomanytabs — layout manager; WI-activated evidence + manifest hooks.
- prome-visual-novel-extension — VN styling; found the active-speaker bug.
- quick-persona — persona picker; PERSONA_CHANGED gap.
- rewrite-extension — selection rewrite; silent edit + curator truncation finding.
- roadway — option cards; unpaired STARTED + dangling profile.
- sillytavern-character-hub-search — asset import; requirement provenance idea.
- sorcery — main-model marker scripting; anti-patterns.
- st-characterlibrary — standalone manager; abort/finish_reason/batching confirmations.
- st-generation-locks — CC profile/preset locks; CC preset seed evidence.
- stat-us-maximus — hand-edited status blocks; macro engine + inline editor ideas.
- tavernary-org — extension manager; downgrade guard + manifest lifecycle.
- universal-immersion-engine — jQuery overlay, mostly anti-patterns; delete-diff technique.
- your-ultimate-killing-game (DRST) — genre kit; scenario override + preflight ideas.

## Community signals (Reddit, Jev)

From `./reddit-jev-threads.md`: four threads, 218 comments, plus the two Jeved post bodies from the user's paste (2026-09-23). The archive has no vote scores (it recorded 1 for all). The paste carries two counts, and the higher one (165) is a joke. **Neither commenters nor the OP report a measured accuracy for Jev or for any Jeved sensor**: the bodies say "in my testing". So no calibration number or floor of ours moves. Strength is graded by independence and method, not volume. OP claims are kept apart from independent reports.

| Signal | Strength | Bearing |
|---|---|---|
| **"A number, not a reason"**: Jev cannot explain itself (5 independent commenters) | high | Supports our design: the question and the cited record are the explanation (the warden note names the fact). Rule for T22/T23 and any tension read: name what fired |
| **A gate with the uncertain band sent to a real model**: one disclosed vendor with numbers (47 h, 54/63 runs never woke the LLM, $0.0017) plus several practitioners | medium | Matches inv 7's fallback-to-today's-path. Calibration "is the vendor's claim", so our own floors are the right answer |
| **Rerolls are waste; OOC nudges over-steer** (4 independent) | medium | Supports no-reroll (jeved 12). New: measure over-steer from our own one-turn notes (§10, R9) |
| **~200 ms and fractions of a cent per call** (anecdotes; the OP's $0.0005/response is second-hand) | low-medium | True only for small states. Our p50 is 223–1512 ms by use. We cannot compare cost because we drop `usage` (T24) |
| **Context ~32k tokens** (3 sources, none from TypeSafe docs) | low-medium | Our 140k-char refusal may exceed it (T25). Latent, no current use near it |
| **Hosted routes and ids** (NanoGPT `/v1/decisions`, `typesafe/jev-1.13`, `~typesafe/jev-latest`; OpenRouter) | medium (vendor statements) | Model-id map + answering-model record (T25) |
| **Local Jev-likes** (laya, openjev) and privacy wishes | low | Much weaker zero-shot by their own docs (0.362 vs 0.766 fine-tuned, as quoted). laya's context is reported at ~1024 tokens (paste), and openjev needs an NLI adapter. Not drop-in; each would be its own calibration |
| **Objective compliance questions work; subjective whole-transcript questions do not** (the OP's own caution, plus one practitioner) | low-medium | Confirms our judge-question design: a small typed state, criteria per question, a declared `sends`. A future "is it boring/slop" use is the family it warns about (C13) |
| **Trend, not one-shot**: an averaged Score that fires below a threshold (OP) | low | Our pacing EMA is already a trend, on extractor tension against an authored target. It supports steering hysteresis (jeved idea 8) weakly (C14) |
| **Pre-reply reads steer the same reply** (OP 0.4, 2 commenters) | low | The seam exists (`loreSelect` after MESSAGE_SENT), so jeved idea 9 drops to 2/S-M (C15) |
| **Vendor risk**: Jev is closed; attribution disputed (no evidence); the 0.4 body names Laya beside Jev | low | No design change. It is why our floors are our own and every use keeps its non-judge path (C16) |
| **"Jev is ZDR on OpenRouter"** (OP only, unlinked) | none | Not citable in `privacy-report.md` (C17) |
| **Hype and astroturf**: content-free enthusiasm, overclaims ("cannot hallucinate"; the OP's "roughly equivalent to high Luna/Terra", "20x as fast"), accusations, self-promotion; the "modified Qwen" screenshots were not archived | none | Ignored. Weigh nothing above our own measurements |

## Open questions for the user

1. T2: when a branch is detected, auto-offer "continue from branch point" on open, or only on explicit select (V5 forbids auto-adopt; a prompt is a middle ground)?
2. T5: acceptable for a content failure (parse/validation) to keep today's install-wide pause, or should all pauses become per-chat?
3. T6/T7: is a small allowlist of known third-party markers (`owner_extension`, `is_thoughts`, `{source}` emitters, CYOA) acceptable, or only shape rules?
4. T13: willing to spike scan-time WI gating (replacing file flag writes), given ST's WI editor would then show file state rather than effective state?
5. T15: should "player lines prove attempts only" be the default (C4 says absent = defaults, so this is a behaviour change) or per-story opt-in?
6. T16: default objective block on for every story, or only when a checkpoint has no `author_note`?
7. CC preset seed: prefer the per-request SETTINGS_READY overlay (no global write) over a `/preset` adapter?
8. Per-message author buttons (`.extraMesButtons`) and `/chat-jump` break the "never touch message DOM" stance only nominally — acceptable for author view?
9. Re-decide "no message-level hiding": interceptor-copy trimming (improved-memory) and witness filtering (presence) do not mutate chat — worth a spike?
10. Player-facing additions (options menu, visible qualities, cross-chat Continue list, wand-menu entry): which, if any, before the outstanding player sessions?
11. Dedicated ST user account for destructive journeys needs `enableUserAccounts: true` — acceptable host config change?
12. T21: if the hybrid lore arm clears its floor, is doubling the questions per lore call (64 → 128 per chunk) acceptable on the reply path (p50 509 ms against a 1500 ms budget today)?
13. T22: should the agency note allow `auto`, like the warden, or be `review`-only? Should it be decided together with T15's "player writes attempts" clause?
14. T23: are `house_rules` story-level only, or per-checkpoint too? What is the cap per call?
15. T25: hosted routes (NanoGPT/OpenRouter) add a second third party per judge call. Offer them at all, and should local Jev-likes be offered given their reported zero-shot gap?
16. Does TypeSafe publish data retention/training terms we can cite in `privacy-report.md`? A commenter claims it does not train on user data, but that is second-hand and unverified.
17. Should a judge-off control arm become a required column for every judge use's live gate and human session (Reddit R8), or only for reply-path uses?
18. Reddit R14 (lore contradiction in the warden) would send authored lore text to the judge on every reply the warden checks. `loreSelect` already sends it pre-reply. Acceptable under the same `sends` disclosure, or keep the warden to facts only?
