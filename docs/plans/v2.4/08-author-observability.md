# Plan 08 — Author observability

**Status: NOT STARTED (doc written 2026-09-23, reconciled to overview §Reconciliation X9/X16/X24
the same day).**
- **Hard dependency: 03.** T18 routes through 03's call path: signal, timeout, input-proportional
  `maxTokens`, and T5's breaker, which is keyed **per profile id** (X16).
- **Soft dependency: 02.** Plan 02's T3 `{messageId, hash}` fingerprints let a jump warn when its
  target has changed. Without them the jump is labelled best-effort.
- **T19 and v2.3 V19.** T19 builds on whatever V19 shipped. On 2026-09-23 V19 is `todo` (v2.3
  `00-overview.md` §Replan work queue row 22), so **nothing of it has shipped**. If v2.3 defers
  V19's editor control, **plan 08 absorbs it** (X24, §Design E).
- **Host facts** land in `docs/plans/v2.4/host-facts.md`, which plan 01 creates (X9).

## Goal

The author can see four things from the drawer without a debugger:
- what the next reply will carry, and at what cost;
- what *other* extensions put beside it;
- why each memory row is or is not in the prompt;
- where a claim came from, one click away via `/chat-jump N` (D12).

Two further additions:
- **T18**: the passes that share one memory-model profile can be split by role, each role with its
  own self-test, Repair row and calibration.
- **R15**: one quality can be read by macro.

## Scope / out of scope

**In:**
- T19a: token cost per contributor, plus the total as a share of the main API's prompt budget.
- T19b: foreign extension-prompt blocks, shown read-only.
- T19c: per-row memory fate and per-tier trim telemetry.
- T19d: "message N" citations open `/chat-jump N`.
- E: V19's "open owning editor", absorbed if v2.3 defers it (X24).
- T18: per-pass-family profiles.
- R15: the per-quality macro `{{story_quality_<key>}}`, one macro per key (X24).

**Out:**
- The per-message inspector (`.extraMesButtons`), which is v2.5 (D12).
- The Chat Completion `promptManager` bucket breakdown. It is CC-only (`openai.js:535`), and our
  backend is textgen. Record it as a v2.5 candidate.
- Context-horizon scoring (`lastInContextMessageId`; astraprojecta idea 4). That is a memory
  change, not observability.
- Auto-tuning budgets (smart-memory). It writes install-wide settings from one chat.
- Per-pass *preset* override through `overridePayload` (GG idea 4). That belongs to plan 06's CC
  preset contract decision.
- The parametric `{{story_quality::<key>}}` form. It needs a new-engine-only seam and is **v2.5**
  (X24).
- Any player-surface change (rule 7). Every item here is author view only, including the jump
  links. The player Memory tab is unchanged.
- The dead toggles `sceneOoc`/`memoryRerank`, which belong to plan 07.
- A new blob version (rule 3). Fates and telemetry are in-memory read-models.

## Verified current state

Tree read 2026-09-23 on top of `fcc33cc`. Another session has these files modified and uncommitted:
`DrawerTabs.tsx`, `stagecraftCoordinator.ts`, `stHost/context.ts`, `extensionPrompts.ts`,
`scheduler.ts` and others. Line numbers below are the working tree's.

| Claim (SUMMARY T18/T19/R15) | Seen | Drift |
|---|---|---|
| Preview reports characters only | `runtime/nextTurn.ts:23` (`characters: number`), `:91` | none. astraprojecta cites `:25` and PTMT `:24`, both stale |
| Preview "reports an unknown block with its raw key" | the claim is at `nextTurn.ts:71-75`, but `stHost/promptInspector.ts:10,21` keeps only `story_*` keys | confirmed: the claim is false |
| `readInjectedPromptBlocks` has a second and third consumer | `runtimeManager.ts:512` (snapshot), `:519` (`capturePayload`), `memoryCoordinator.ts:412` (`getAppliedEpistemicBlock`) | **new**: widening the reader changes captures and the J5 private-block probe, so a separate reader is needed |
| `readInjectedPromptBlocks` drops `position`/`filter` | `promptInspector.ts:12-16,22-27`, with a blind cast at `:19` (inv 2) | **new** |
| `dropped` is discarded | `memory/budget.ts:78-79` returns it; `memory/inject.ts:29` destructures only `kept`/`pinnedOverflow` | none |
| Silent pre-budget filters | `inject.ts:25` quarantine, `:26` superseded/folded, `:27` other speaker (facts tier) | **new detail**: three of the four fates never reach the budget |
| Budget unit is an estimate | `budget.ts:3-7` uses chars/4 unless `entry.tokens` is set; `runtime/entryTokens.ts:12-13` fills it after an edit (V8) | **new**: telemetry must name its unit |
| Only fate signal is pinnedOverflow | `DrawerTabs.tsx:224-226`, persisted in `extras.memory` (`extras.ts:52,110`) | none |
| "message N" is inert text | `ConflictQueue.tsx:19`, `StagecraftPanel.tsx:60`, `ScenePanel.tsx:13`, `DrawerTabs.tsx:372` (effect ledger), `:498` (talk decision, "msg"), `:596` (lore forced), `memory/provenance.ts:100` (tooltip) | **new**: three more sites than SUMMARY lists |
| Next-turn "edited in" is text, not a control | `DrawerTabs.tsx:631` (v2.3 doc says `:629`, which is the Re-read button) | V19 still open |
| Tokenizer seam exists, unused by the preview | `stHost/tokenizer.ts:3-8`, blind cast at `:6`; only consumer `runtime/entryTokens.ts:6` | none |
| One `extraction.profileId` | `runtime/settingsStore.ts:30,70` | none |
| Consumers | director `runtime/index.ts:174-178`; curator `stagecraftCoordinator.ts:147-148`; copilot/wizard `copilotCoordinator.ts:32-33` → `copilot/authoring.ts:33,43,64,69`; arc/canon `memoryCoordinator.ts:238-239,342-343`; supersession bridge `memoryCoordinator.ts:592`; scene/short-term/epistemic/ledger `extractionCoordinator.ts:295-296,327-328,351-352,368-369`; manual + backlog reads `extractionCoordinator.ts:259,395`; cadence read `extraction/scheduler.ts:188` (`client: settings`); expansion/critic `expansionCoordinator.ts:240` → `generation/generate.ts:30,33,44,98`, `critic.ts:75`; live suite `runtime/liveSuite.ts:62`; model self-test `runtime/selfTest.ts:158,172` | **new**: SUMMARY misses the scheduler, the backlog/manual reads, supersession, driver suggest/report, the pick prompt and the self-test |
| Self-test keys off the single id | `src/runtime/selfTest.ts:158` | the brief names `src/judge/selfTest.ts`, but that is the judge director self-test (`runJudgeDirectorSelfTest`, `:30`) and is not profile-keyed |
| Repair keys off the single id | `runtime/repair.ts:28`; checks presence only, never that the profile still exists | the existence check is plan 03 T5 |
| Whole-block macros | `runtime/macros.ts:50` (`story_blackboard`), `:56` (`story_ledger`); per-key precedent `syncRoleMacros` `:21-32` | none |
| `registerHostMacro` | `stHost/context.ts:52-53` over `MacrosParser.registerMacro`; `HostMacroValue` `:6` | **+3 lines** since `fcc33cc` (V17 `hostMacrosAvailable` at `:50`, in progress) |
| Budgets | manager `runtimeManager.ts` 677/700, `memoryCoordinator.ts` 614/620 (`architecture.test.ts:9-10`) | memory coordinator has **6 lines** of headroom |
| Harness | `so-ui.mts:754-756` lists next-turn selectors for `assert-player-clean` only; there is no `next-turn` read verb | new verb needed |

## Host facts (ST 1.19.0 working tree; 1.18.0 = `51ad27fb` where it matters)

These rows land in **`docs/plans/v2.4/host-facts.md`** (X9: plan 01 creates it, and rule 2 cites
it). This plan adds its rows there at build start; the table below is the source for them. Each
fact also needs a vendored type in `stHost/hostTypes.ts`, with no blind cast.

| Fact | Where |
|---|---|
| `/chat-jump N` (aliases `chat-scrollto`, `floor-teleport`): 0-based index; loads older messages via `showMoreMessages`, scrolls `#chat`, runs `flashHighlight` for 2 s | `slash-commands.js:3448-3503`; `utils.js:2184`; 1.18.0 `:3447` |
| `/chat-jump` returns `''` **both** on success and on failure (out of range: `toastr.warning`; element not found: warning) | `slash-commands.js:3454-3458,3482-3486`. The return value is **not evidence** |
| Textgen max context = `max_context`, response = `amount_gen`; prompt budget = `getMaxPromptTokens()` = context − response | `script.js:5929-5932`, `:5966-5969`, `:5981-5987`; 1.18.0 `:5870,5907,5922`. Exported from `/script.js`, **not** on `getContext()` |
| `getContext().maxContext` = `Number(max_context)`: the textgen slider regardless of API (wrong for CC) | `st-context.js:134`. Do not use it as the budget |
| Our interceptor already receives the per-generation prompt budget (`getMaxPromptTokens()`, non-dry-run only) and ignores it | `script.js:4560-4564`, `extensions.js:2024,2037`, ours `runtime/index.ts:186` (`_contextSize`) |
| This install: `main_api` = `textgenerationwebui`, `max_context` 98304, `amount_gen` 600, textgen type `llamacpp`, tokenizer = BEST_MATCH (99) | `data/default-user/settings.json`, read 2026-09-23 |
| BEST_MATCH on connected llama.cpp textgen uses the **backend's own tokenize endpoint**, so every uncached count is a network call to the pod | `tokenizers.js:285,301-318`, `TEXTGEN_TOKENIZERS` filled `:1218`; `getTokenCountAsync` `:443` (per-chat cache) |
| Extension prompt shape `{value, position, depth, scan, role, filter}`; position `NONE -1 / IN_PROMPT 0 / IN_CHAT 1 / BEFORE_PROMPT 2`; assembly takes `Object.keys().sort()` per position/depth/role, skips a block whose `filter()` is false, and runs `substituteParams` on the value | `script.js:484-489`, `:8926-8935`, `:3291-3320` |
| **Parametric macros through our seam: no, on either engine.** Legacy: exact `{{key}}` regex per registered key | `macros.js:684` |
| New engine: the `MacrosParser` bridge registers a **0-arg** macro ("only `{{key}}` without arguments is valid"), `strictArgs` defaults `true`, so `{{story_quality::k}}` raises a macro runtime error | `macros.js:81-118,183-207`; `MacroRegistry.js:405-419,598`; 1.18.0 same (`macros.js:95`) |
| The new engine itself supports `unnamedArgs` + `::` | `MacroRegistry.js:66-68,198,528-580`; `MacroLexer.js:83`; exposed as `getContext().macros` (`st-context.js:245`, 1.18.0 `:244`) |
| This install: `experimental_macro_engine: true` (re-measured in `settings.json` 2026-09-23; source default `true`, `power-user.js:302`). The engine is fixed at startup | gotchas, Macros bullet |
| `ConnectionManagerRequestService.sendRequest(profileId, …)` is per request; `getProfile("")` throws | ours `connectionProfiles.ts:43-50`; ST `shared.js:423-481,546-549` |

## Design

Everything below is **author view only** (inv 9) and **snapshot-fed** (inv 18: drawer components
read `RuntimeSnapshot`, never a manager getter during render). Host reads go only through `stHost/*`
(inv 2). Nothing new is persisted to `chat_metadata` (inv 13, rule 3).

### A. Cost: tokens per contributor, share of the prompt budget (T19a)

- **What:**
  - `NextTurnContributor` gains `tokens: number | null` and `tokenSource: "host" | "estimate"`.
  - The preview header reads "Story blocks: N tokens of M available (max context − response)".
  - Each row shows its share of M.
  - A known budget is never guessed: an unreadable M shows "budget unknown" (overview 03 T9 rule:
    declared fallback, reported).
- **Modules:**
  - New `stHost/contextBudget.ts` reads `getMaxContextTokens` / `getMaxResponseTokens` /
    `getMaxPromptTokens` through `importSTModule("/script.js")`.
    - It is capability-probed: added to `stHost/capabilities.ts` as `contextBudget`, reporting
      absent / error rather than a number.
    - It returns `{context, response, prompt, api}`.
  - Plan 03 T9 also needs "an unknown context limit" for *profile* passes. If 03 built a
    budget seam, extend it rather than adding a second one.
  - New `runtime/promptCost.ts` holds a class outside the manager and the coordinators:
    - an in-memory cache `Map<hash(value), tokens>`;
    - counting through `countTokens`, debounced after a snapshot change;
    - a `notify` when counts land.
  - `snapshotBuilder` reads the cache synchronously, and a miss renders as "counting…".
  - Manager wiring: ≤ 5 lines, keeping it within 700.
- **Invariants:**
  - **inv 5:** counting never runs in `GENERATION_STARTED` and is never awaited on the reply path.
    On this install each count is a pod round-trip (host facts), so values are cached by hash and
    counted at most once.
  - Offline, or when the tokenizer errors, rows show `estimate` (chars/4, the same unit as
    `budget.ts:3`) and say so.
  - The interceptor's `_contextSize` is recorded as `lastGenerationPromptBudget`. This is the
    cross-check the live gate compares M against; it is not a second source.
  - The architecture.md rule "the next-turn preview is composed, never listed" holds: rows still
    come from the blocks ST holds.

### B. Foreign blocks, read-only (T19b)

- **What:** a collapsed "Other extensions" group in `#so-next-turn` (`[data-so="next-turn-foreign"]`).
  Each row shows key, position (NONE is shown as "not injected; macro only"), depth, role, a
  "conditional" flag when a `filter` function is present, tokens, and the first line.
  - There are no controls and no owner tab.
  - `script_inject_<id>` keys are labelled "/inject <id>".
- **Module:** `promptInspector.ts` gains `readExtensionPromptBlocks(): {own, foreign}`.
  - It uses vendored `ExtensionPromptEntry` types and removes the blind casts at `:19` and
    `tokenizer.ts:6`.
  - It carries `position` and `hasFilter`, so own blocks get the fields too.
  - `readInjectedPromptBlocks` keeps its exact current behaviour for `capturePayload`
    (`runtimeManager.ts:519`) and `getAppliedEpistemicBlock` (`memoryCoordinator.ts:412`). Payload
    captures and the J5 private-block probe must not change meaning.
- **Invariants:**
  - Foreign text lives only in the snapshot. It is never persisted, never journaled and never in
    the capture ring.
  - It never reaches a player surface (inv 9); `assert-player-clean` gains the selector.
  - The `nextTurn.ts:71-75` comment becomes true.

### C. Memory row fate and trim telemetry (T19c)

- **What:**
  - Every memory entry gets exactly one fate per injection pass:
    `injected | quarantined | superseded | folded | other-speaker | over-budget | pinned-overflow | excluded`.
  - Per tier, telemetry reports candidates, injected, tokens used vs budget (in budget units) and
    rows dropped.
  - The session high-water mark is in memory only and is labelled "this session". A per-chat
    high-water mark would need a blob field (rule 3).
  - The Memory tab (author view) shows a fate badge per row (`[data-so="memory-fate"]`). The
    preview's memory rows show the tier telemetry (`[data-so="next-turn-trim"]`).
- **Module:**
  - `memory/inject.ts` `buildMemoryInjection` returns `fates: Record<entryId, Fate>` and
    `trim: Record<MemoryTier, TierTrim>`, computed from the same filters (`:25-27`) and the same
    `selectWithinBudget` result (`dropped`, `:29`) that built the blocks.
  - This fixes the drift that re-deriving fates in the snapshot builder would invite: a
    recomputation agrees only by luck (gotcha: SPEAKER vs DRAFTED).
  - `applyMemoryInjection` returns it. `memoryCoordinator.updateInjection` (`:447-450`) keeps the
    last result in a **non-persisted** field, exposed through the existing read-model path. That
    costs +≤4 lines against 6 of headroom. If it does not fit, the fold moves to a helper module,
    as V8 did with `runtime/entryTokens.ts`.
  - `pinnedOverflow` stays for compatibility and becomes derived from `fates`.
- **Invariants:**
  - inv 15: a quarantined row's fate is `quarantined`, never `over-budget`. This proves exclusion,
    not ranking.
  - inv 16: fates are refreshed by the same `updateInjection` call that writes the blocks, so
    they cannot lag the injection.
  - inv 18: snapshot only.
  - Epistemic and ledger blocks keep their own caps. Their fates are out of scope and stated in
    the panel.

### D. Provenance navigation via `/chat-jump` (T19d, D12)

- **What:** every citation site in the table above (7 sites) renders `message N` as a button
  (`[data-so="jump-to-message"][data-mesid]`) in author view.
- **Module:** a new pure `runtime/messageJump.ts` exports
  `jumpTarget(messageId, chatLength, fingerprint?) → {ok, id} | {ok:false, reason}`. It refuses
  when:
  - `messageId < 0` (legacy, the same rule as `originLabel`);
  - `messageId ≥ chat.length`;
- **Changed target (soft dependency on plan 02 T3):** when the chat's fingerprint for that index
  differs from the one recorded at the citing boundary, the button reads "message N (changed
  since)" and still jumps.
  - An edit, delete or reorder moves or rewrites the cited message.
  - Hidden messages are not a change, because D5 leaves `is_system` out of the hash.
  - If T3 has not landed, or the boundary is a legacy one (unknown, not a mismatch), there is no
    warning and the button says "best-effort".
- **Execution:** `stHost/slashCommands` `executeSlashCommands("/chat-jump N")`. Because ST's result
  is not evidence, the adapter answers `WriteResult` from the pre-check alone and never claims it
  scrolled (inv 16).
- **Invariants:**
  - SO never touches message DOM (baseline §4). ST highlights its own node.
  - On narrow viewports the drawer covers `#chat`, so the button closes the drawer first through
    the existing `stHost/drawers.ts` toggle.
  - The call is not on any generation path (inv 5).
  - D12: no `.extraMesButtons`.

### E. "Open owning editor" (V19 overlap)

- **If V19 shipped:** keep its control, and give foreign rows none.
- **If v2.3 defers V19's editor control, plan 08 absorbs it (X24).** The text
  `edited in: {ownerTab}` (`DrawerTabs.tsx:631`)
  becomes a button that switches the drawer tab (`OWNER_TABS`, `nextTurn.ts:54-62`). `config` uses
  `revealSetting`, as Repair does. No second editor is added (architecture.md: "a second control
  that does the same thing is how one of them goes stale").

### F. Per-pass profile routing (T18)

- **Settings home:** install-wide (inv 13, three homes),
  `GlobalSettings.extraction.profiles?: Partial<Record<PassRole, string>>`.
  - Roles: `read | synthesis | authoring | director | curator`.
  - Sanitized in `settingsStore.ts` like `profileId` (`:70`).
  - No chat override and no blob change.
- **Fallback:** an **unset** role uses `extraction.profileId`. That is today's behaviour, and it is
  the default for every role.
  - A role **set to a profile that no longer exists** does not silently fall back. It takes plan
    03 T5's `config` class: that role's passes go `not-configured`, with a Repair row. A silent
    fallback would hide which model answered.
- **Role map (decided, X24; covers every consumer in §Verified current state):**

  | Role | Call sites |
  |---|---|
  | `read` | cadence/manual/backlog shared read, supersession bridge, epistemic + ledger P2, live suite, model self-test |
  | `synthesis` | scene summary, short-term compaction, arc summary, canon |
  | `authoring` | copilot/wizard stages, driver suggest/report, expansion generator/critic/pick. All produce story structure at up to 2048 tokens |
  | `director` | talk director (reply path, `DIRECTOR_MAX_TOKENS` 96, `talkControl.ts:8`) |
  | `curator` | WI curator |

- **Module:**
  - A pure `runtime/passProfiles.ts` exports `resolveProfile(settings, role) → {profileId, source: "role"|"fallback"} | {refused, reason}`.
  - `ExtractionClientOptions` (`extraction/client.ts:4-9`) gains a required `role`, so the type
    system names every call site.
  - Plan 03's T5 breaker is already keyed **per profile id** (X16), so a dead curator profile
    cannot trip the read path. This plan only has to pass the resolved id and never the role
    name. The Repair row reads the breaker for that id.
  - Requests stay per request through CM (`connectionProfiles.ts:43`), never through `/profile`.
  - The judge is unaffected (inv 7).
- **UI:** a settings "Models per task" group (collapsed; "affects every chat" note). One select per
  role, defaulting to "Same as memory model".
- **Self-test per assigned role:** `runtime/selfTest.ts` gains `runRoleSelfTest(role)`, which runs
  a fixed fixture through that role's real prompt/parse path:
  - read: today's core + capability passes;
  - director: 3 `director.json` cases, `SPEAKER:` parses;
  - curator: 1 curator fixture, ops parse;
  - authoring: 1 copilot stage, JSON valid;
  - synthesis: 1 scene summary, non-empty after `stripChannelNoise`.
- **Repair:** `repair.ts` gains one row per *set* role whose profile is missing or whose self-test
  failed, worst-first after `memory-model`. The consequence names what stops (for example "speaker
  direction falls back to ST's own choice").
- **Invariants:**
  - inv 10: the resolver runs before the token mint, so it adds no await.
  - inv 20: every routed role is live-gated on the real model.
  - Gotcha "every profile has to be live": `select-profile` in journeys now pins **all** assigned
    roles.
  - Each consumer file gains one `role:` argument. The coordinator budgets are unaffected.

### G. Per-quality macro (R15)

- **Facts:** the overview's condition ("if the `MacrosParser` seam takes parametric macros")
  resolves **no** on both engines (host facts).
- **Build:**
  - `{{story_quality_<key>}}` per authored quality, registered and unregistered on story change.
    It mirrors `syncRoleMacros` (`macros.ts:21-32`) with a signature over quality keys, and works
    on both engines through the existing seam.
  - The value is the blackboard value, or `(unset)`. A ledger-bound quality reads through the
    blackboard (single writer, `ledger_binding`).
  - Keys are already `[a-z0-9_]`, which the new-engine identifier accepts; a key outside that set
    is skipped with a journal line.
- **Not built:** `{{story_quality::<key>}}` is **v2.5** (X24). It would need a new-engine-only
  seam (`getContext().macros.registry.registerMacro` with `unnamedArgs`), and it resolves to
  literal text on a legacy install.
- **Invariants:**
  - Macros stay pure reads. Nothing drains or computes on evaluation (the st-gamemaster
    anti-pattern).
  - inv 9: the key names are the author's, and a card that prints one is the author's choice.
  - An epistemic-bound value is never exposed by macro (inv 15). The macro reads the blackboard
    only.

## Order of work

1. **Host seams + types.**
   - The host-fact rows go into `host-facts.md` (X9).
   - `contextBudget.ts`, capability `contextBudget`, and vendored `ExtensionPromptEntry` and
     `getTokenCountAsync` types.
   - The failing jest fixtures first: preview drops a foreign key; `dropped` is discarded; a
     quarantined row has no fate.
2. **B** (reader split), then **A** (`promptCost` + header). Both land on `nextTurn.ts`, one at a
   time.
3. **C** fates + telemetry. Check the memory-coordinator budget first.
4. **D** jump links (the fingerprint warning is wired only if plan 02 T3 has landed) + **E**
   (absorbed if v2.3 deferred V19).
5. **G** the per-key macro.
6. **F** after plan 03's call path has landed: resolver → call sites → settings UI → self-test →
   Repair → calibration runs.
7. Live gates and records.

## Tests and gates

- **jest** (pure; mutation-check each guard — delete it, and exactly its case fails):
  - `nextTurn`:
    - foreign rows are present and carry no controls;
    - share = Σtokens / budget;
    - an unknown budget renders unknown, not 0;
    - position NONE is labelled.
  - `buildMemoryInjection`:
    - every candidate has exactly one fate;
    - `injected` ids == the rows in the block text;
    - a quarantined row is never `over-budget`;
    - the `pinnedOverflow` count == the `pinned-overflow` fates.
  - `messageJump`: -1, out of range, fingerprint changed, hidden-only change (no warning), legacy
    boundary (best-effort, no warning).
  - `resolveProfile`: unset → fallback; dangling → refused; never `""`.
  - A static guard that every `callExtractionModel(` call site passes a literal `role`, in the
    census style.
  - The quality-macro signature sync, including unregister on story swap.
  - `promptCost` is never awaited from a generation handler. This is an architecture guard.
- **Storybook** (interaction + a11y, `test-storybook:ci`):
  - `NextTurnPanel`: counting / host / estimate / budget-unknown / foreign group;
  - `MemoryTab`: one story per fate;
  - jump buttons in `ConflictQueue`, `StagecraftPanel`, `ScenePanel` and `DrawerTabs`;
  - `RoleProfiles` settings with a dangling role;
  - a Repair row per role.
- **`so-ui` probes:**
  - `next-turn` (rows + tokens + foreign, JSON);
  - `memory-fates`;
  - `jump <selector>`, asserting `#chat .mes[mesid=N]` is in view — a harness read, not product
    DOM work;
  - `assert-player-clean` gains `next-turn-foreign`, `next-turn-trim`, `memory-fate`,
    `jump-to-message` and the role selects.
- **Preview ≡ capture, live:** the plan-09 row v2.3 never ran.
  - Solo and group, real generation. The preview taken just before `send` is compared with the
    request ST actually posted (`st-payload` / `GENERATE_AFTER_DATA`).
  - Every own and every foreign non-NONE block is present, in order, scoped by block.
  - The private block matches in the drafted member's request only.
  - Each block's token count equals `getTokenCountAsync` of the same string.
  - M equals the interceptor's `contextSize` for that generation.
  - Both ×2, consecutive.
- **Live suite per routed role** (real model, no `debugResponse`, **no floor retuned**; floors are
  written into this doc before the first run):
  - `read`: `so-live-suite` at plan 04's floors.
  - `director`: the LLM arm over `test/fixtures/judge/director.json` (26), with the shared-profile
    arm as control. Floor: routed ≥ 22/26, the LLM director's measured parity
    (`v2.2/01-judgment-backend.md:156`).
  - `curator` and `authoring`: a new ≥20-case fixture each, with an 8-case Spanish slice and
    parse-validity plus op-shape floors predeclared.
  - `synthesis`: validity only (non-empty, parses, no channel noise), recorded as
    **not quality-calibrated** rather than given an invented floor.
  - A role below its floor stays selectable (the default is still the fallback), but it is left out
    of the recommended config.
- **Journeys:** J3 ×2 (player surface unchanged), J5 ×2 (private block per member in preview and
  capture), `--strict`. Run-header diff around the batch.
- **Machine:** `npm run typecheck && typecheck:test && lint && test && build && test:release`, then
  `st-session.mts reload`.
- **Records:** everything under `test/journeys/records/v2.4-plan08/`.

## Risks

- **Pod load:** a count per new block string is a backend tokenize call on this install. The cache
  and debounce keep it cold. If measured traffic hurts the reply, fall back to `estimate` and say
  so.
- **Foreign content:** another extension's prompt can hold private data. It stays author-only, not
  persisted and not captured. The privacy report (v2.3 `privacy-report.md`) gains a row.
- **A stale jump index:** until plan 01 T1 / plan 02 T3, a middle delete shifts indexes. Without
  the fingerprint the jump is labelled best-effort.
- **Memory coordinator headroom** (6 lines). The fold must live in `memory/inject.ts`.
- **T18 multiplies live profiles:** the "first profile" journey trap applies per role. Plan 03's
  per-profile breaker (X16) contains the failures, but not the setup burden.
- **Per-key macros come and go with the story:** a card that prints `{{story_quality_x}}` in a
  chat whose story lacks `x` gets literal text. The same holds for `story_role_<id>` today.
- **Assembly order:** ST sorts by key within position/depth/role, and `substituteParams` runs at
  assembly. Token counts of raw values can differ from the assembled text when a block contains
  macros. The capture comparison is the arbiter.

## Unresolved questions

None. The three questions this doc raised were answered by overview X24 (2026-09-23):
- the macro is per key and the `::` form is v2.5;
- expansion and critic sit under `authoring`;
- plan 08 absorbs V19's editor control if v2.3 defers it.

## Gate record

### Build (worktree, 2026-09-25)

Branch `worktree-agent-af3e9900fe27ffdd6`, based on `e4d69db`. Commits: `f08fd1a` (T19a/b), `d278f26` (T19c),
`57e353b` (T19d), `77a40ae` (R15), `13658bf` (T18), `91dba0b` (probes, fixtures, mutation records,
privacy rows), plus this record. Host facts: `host-facts.md` §"Plan 08" rows 08-H1..H12 (1.19.0 and 1.18.0).

**As built**

| Item | State | Where |
|---|---|---|
| T19a tokens + share | built. Each block counted by the main API's tokenizer (`getTokenCountAsync`), debounced 400 ms, cached (500), never while a generation is open, chars/4 estimate on failure and said so. Share = Σ own tokens / M, M = max context − max response (`contextBudget` capability). The interceptor records its `contextSize`; a drift line shows when they differ | `runtime/promptCost.ts`, `stHost/contextBudget.ts`, `runtime/nextTurn.ts buildNextTurnCost/nextTurnCostText`, `NextTurnPanel.tsx` |
| T19b foreign blocks | built. `readExtensionPromptBlocks()` splits own/foreign; foreign rows are read-only (no owner, no control), labelled by position (NONE = "not injected; macro only", share null), `/inject <id>` named, filter = conditional | `stHost/promptInspector.ts`, `nextTurn.ts buildForeignRows` |
| T19c fates + trim | built. One fate per candidate (injected / quarantined / superseded / folded / other-speaker / over-budget / pinned-overflow) from the injection that wrote the blocks; per-tier trim telemetry + session high-water; memory coordinator unchanged (619) | `memory/inject.ts`, `runtime/memoryInjector.ts readModels()`, `DrawerTabs` memory badge, `memoryFate.ts` |
| T19d `/chat-jump` provenance | built. Author-view citations on memory rows, effect ledger, talk decisions, lore forced, conflict queue, stagecraft, scene panel; fingerprint-checked against plan 02 T3's boundary fingerprints ("changed since" / "best-effort"); narrow viewport (≤ 1000 px) closes the drawer first. `/chat-jump` answers `''` either way, so the WriteResult is a precheck only (08-H2) | `runtime/messageJump.ts`, `messageJumpHost.ts`, `stHost/chatJump.ts`, `MessageCitation.tsx` |
| E (open owner) | already shipped as V19; foreign rows get none | — |
| R15 | built. `{{story_quality_<key>}}` per quality, synced on story change (unregisters the departed story's), `(unset)`, a non-`[a-z0-9_]` key skipped with a journal line. `::` form not built (v2.5) | `runtime/qualityMacros.ts`, `macros.ts` |
| T18 routing | built. `extraction.profiles` install-wide (sanitized; unset role = memory model = default for every role); `role` required on every client call (census test lists every caller incl. pass-through functions); router at the client module; a dangling routed id refuses (`config`, names the id); the breaker stays per profile id and a job routed to a dead profile holds only itself (`heldOn`); non-read config problems are per profile, not the story's not-configured; preflight and budgets per role's profile | `runtime/passProfiles.ts`, `extraction/passRole.ts`, `extraction/client.ts`, `extraction/scheduler.ts`, `runtime/requestBudget.ts` |
| T18 self-test / health / Repair / UI | built. `runRoleSelfTest(role)`: read = the memory model self-test (core tiers), director = 3 rows of `director.json` (D01/D06/D08, test pins them to the fixture), curator = 1 fixture (≥ 1 op), authoring = 1 qualities stage (valid JSON), synthesis = 1 scene summary (non-empty after noise strip). `roleHealth` → snapshot `roleRoutes` (fallback / untested / ok / missing / not-configured / not-answering / failed). Repair row `model-role` after memory-model, before cast, consequence per role, target `#so-role-profile-<role>`. Settings "Models per task" (`#so-role-profiles`, collapsed, "Affects every chat", "Same as memory model" default, dangling id shown as "Missing profile"); `revealSetting` now opens enclosing `<details>` | `runtime/roleSelfTest.ts`, `roleHealth.ts`, `repair.ts`, `components/settings/RoleProfilesGroup.tsx`, `index.tsx` |
| Harness | `so-ui next-turn | memory-fates | jump [selector] [--index]` (+ scenario `ui` actions, schema), player sweep forbids the plan 08 author selectors, `select-profile` reports assigned roles and refuses a dangling one, extraction snapshot/restore + run header carry `profiles` | `scripts/debug/so-ui.mts`, `so-scenario.mts`, `lib/scenarioSchema.mts`, `lib/extractionSettings.mts`, `so-run-header.mts` |
| Privacy | two rows appended (foreign blocks read-only, never persisted; per-task routing) | `docs/plans/v2.3/privacy-report.md` |

**Gates (worktree, 2026-09-25)**

- `npm run typecheck` / `typecheck:test` / `lint` / `debug:typecheck`: clean.
- `npm test`: 244 suites, 3530 tests passed. One earlier full run had 1 failure in `extraction/windowHygiene.test.ts` ("24 messages of 8 KB well under 5 ms", plan 04's timing case); it passed alone (42/42) and in the next full run. Load flake, not this plan's code.
- `npm run test:debug`: 261 tests, 260 pass, 1 skipped, 0 fail.
- `npm run build`: compiled (2 size warnings, pre-existing). `npm run test:release`: 21/21 with `ST_PUBLIC=C:/dev/SillyTavern-MainBranch/public`. Without it, 20/21: the worktree sits 3 directories deeper than the extension, so `manifest.mjs` finds no ST (`ST unknown`). That is a worktree artifact, not a regression.
- Storybook: `storybook:build`, served on 6408, `test-storybook --index-json`: 34 suites, 232 stories passed (interaction + a11y). New stories: `NextTurnPanel` ×6, `DrawerTabs` MemoryFates / PlayerNeverSeesMemoryFates / AuthorJumpsFromACitation / PlayerSeesNoJumpButtons, `ConflictQueue` and `StagecraftPanel` citation stories, `RoleProfilesGroup` ×3 (incl. dangling), `EntryPoints` RepairNamesADeadTaskModel.
- `architecture.test.ts`, ownership census, fault matrix: green. Effective lines unchanged against `e4d69db`: `runtimeManager.ts` 737, `memoryCoordinator.ts` 619.
- Red first: every new test file failed before its module existed, or failed against the old code. `nextTurnCost` failed 10/10, `injectFates` 5/5, `repair` T18 cases 7 failed of 24. The other suites could not load.

**Mutations**: `test/findings/mutations/v24-08-{T19ab,T19c,T19d,R15,T18}.txt`. There are 23 mutants and each one fails its own case. One mutant survived at first: "a position NONE foreign block counted in the share". It gained a case and now fails 1/11.

**Live**: NOT RUN (brief: no live gates). Written, schema-valid (`validateFixture`) and eval-syntax-checked:
- `test/scenarios/live-v24-08-preview-capture.json` (group) and `live-v24-08-preview-capture-solo.json`. Preview ≡ capture, per block and in slot order. Host token count = `getTokenCountAsync`, and M = the interceptor's `contextSize`. Run ×2 consecutively.
- `test/scenarios/live-v24-08-fates-jump.json`. Real extraction, then fate badges ≡ snapshot, injected ⊂ blocks, and no quarantined row reads over-budget. Then `ui jump` must land in view, and the player sweep stays clean.
- `test/scenarios/live-v24-08-quality-macro.json`. An AN carrying the macros reaches a real request with the values at send time. The `/cp set` lands at the boundary, and the macro unregisters on a story swap.
- `test/scenarios/live-v24-08-routing.json`. Director routed by role, the self-test passes from the settings panel, and a real talk decision is made on a healthy route. A dangling curator gives the `model-role` Repair row. The role map is restored.
- Stories: `live-v24-08.story.json`, `live-v24-08-solo.story.json`.

**Not built (remaining)**
- The per-routed-role live suite. Curator and authoring each still need the ≥ 20-case fixture with an 8-case Spanish slice and predeclared floors. The director arm over all 26 `director.json` rows at ≥ 22/26 is not built. `synthesis` validity is not recorded yet. The role self-test is the smoke check, not that calibration.
- Journeys J3 ×2 / J5 ×2 `--strict` with a run-header diff, and the preview ≡ capture live runs. None were run.
- The recommended-config list (roles below their floor stay selectable but unrecommended) is waiting on the calibration.

**Deviations / decisions**
- The `excluded` fate was dropped because excluded rows are never in `entries`, so they are never candidates.
- The high-water mark is in memory and covers "this session". It is not persisted.
- An unfingerprinted citation is best-effort, never "changed".
- The role router lives at the client module (`setProfileRouter`), so the coordinator signatures only gained a role literal and the coordinator budgets are unchanged.
- Role Repair rows appear only with a story loaded, like the memory-model row. They sort before cast and lore, because a dead routed model stops work the story has already reached.
- A self-test result counts only for the profile it ran on, so re-routing a role makes it "untested" again.
- The director self-test requires every case to answer a parseable `SPEAKER:` line, not the labelled answer. The detail line carries the count.
- Role selects are not in the player sweep. The settings panel is install configuration, like the memory-model select, not a steering control.
