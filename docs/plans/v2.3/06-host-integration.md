# Plan 06 — Host integration and durable writes

**Kind:** hardening (one authored-content fix).
**Roadmap package:** 6.
**Closes:** the preset/backend limitation, S2, F2, persistence evidence, typed host results,
S4, the private-payload gap, and the **host-effect half of plan 04's rollback invariant**.
**Revised 2026-09-20** per `review-astra-2026-09-20.md` (edits 3, 10; second-highest
under-scoping risk).

## Objective

Host writes are shared, global and concurrent with other extensions. Today a checkpoint preset is
"applied" whether or not the active backend can take it, a per-chat cast change rewrites the
group for every chat, a settings read can race ST's own load, and a failed save is a console line.
This plan makes each host seam say what it did, records what it changed so the chat that changed
it can restore it, and diagnoses unsupported effects before play.

## Context

- **Presets** `src/services/stHost/presets.ts:4–17,:67` drive the text-completion module only
  (`textgenerationwebui`). A chat-completion profile (the review's Artemis setup; this install's
  llama.cpp OpenAI-compatible profile) gets a generic UI action that reports success without
  reaching the backend.
- **S2** `cast_changes`/`setGroupMembersDisabled` write the group's `disabled_members`, shared by
  every chat in the group and outliving the chat that set it. Reproduction: one story, two
  checkpoints disagreeing about one member; a second chat opens with a cast the author never
  chose. Cleanup must re-enable members *after* `/delchat`.
- **F2** after a reload on a storyless chat, `getSnapshot().extraction.settings.profileId` is
  `null` while `getGlobalSettings()` holds the profile; `getGlobalSettings` writes its sanitized
  result back (`src/runtime/settingsStore.ts`), so an early call could stamp defaults before
  `EXTENSION_SETTINGS_LOADED` (`script.js:8025`). Unverified on a chat that plays a story.
- **Persistence** `runtime/persistence.ts` + host `saveMetadata`: errors are caught and logged;
  no acknowledgment, no retry, no visible pending state (review coverage row "Persistence errors
  and recovery").
- **Typed results** several `stHost` functions return `boolean`/`void`; R3 was exactly a `false`
  read as success. `enableWIEntry`/`disableWIEntry`/`upsertWIEntry` now return checked values;
  backgrounds, AN, presets, cast and group creation do not uniformly.
- **S4** `quest-for-the-sun-ruins.json` cp1 carries `effects.preset {name: "Story: Sun Ruins",
  settings: {temp: 1.0, top_p: 1.0}}` whose saved preset (`rep_pen 1`, `top_k 0`, `min_p 0.05`,
  DRY 0.8/2/4096) produced `he-spe-aks` on Artemis during J7. Tuned for gemma4-mtp; overrides the
  install's tuned profile.
- **Private payload** J5.6 asserts the injected block per drafted member; the review asks for the
  *final network request* to be inspected with two distinct secrets.
- Capability probes: `stHost` should distinguish an absent API from a transient failure (review
  §Resource and coexistence).

## Scope

In: per-backend preset capability, the owned-effect ledger (cast, WI gated sets, AN, background,
preset), typed host results, save acknowledgment, the settings-load seam, the example story
overlay, the final-payload privacy check, capability probes.

Non-goals: a new adapter for every backend (only chat-completion + textgen; others diagnose as
unsupported); the memory mirror's own book (unchanged).

## Deliverables

### Preset capability (decision: chat completion is diagnosed unsupported in v2.3)

`stHost/presets.ts` probes `main_api`: `textgenerationwebui` → today's path; **anything else,
including `openai` (chat completion)** → `{ok: false, reason: "unsupported backend"}`.
`EffectsApplier` records unsupported effects in the requirements panel ("Preset effect cannot
apply on this connection") and the journal, and never marks them applied. A live check reads the
backend's actual sampler values after the effect on textgen (`getSnapshot` exposes the applied
set) and asserts **no** sampler change on chat completion. The OpenAI preset adapter is a v2.4
seed (`00-overview.md` unresolved questions), so the implementation and every gate in this plan
agree on one behaviour instead of building an adapter the live gate then expects to be absent.
A dedicated fixture `test/scenarios/effects-preset.story.json` carries the preset effect, so
removing the sun-ruins overlay (S4) does not remove the only preset test.

### Owned-effect ledger (S2 and the rest; closes plan 04's host half)

- `extras.effects.ledger` rows: `{id, effect, target, before, after, checkpointId, boundary,
  messageId, at, status}` per chat. **`target` is a stable identity**, never a display name:
  `{group: id, member: chid}` for cast, `{book: fileId, uid}` for WI, `{slot: "chat" | "character"}`
  for AN, `{name}` for background, `{preset: name, api}` for preset.
- **Write-ahead**: the row is persisted with `status: "pending"` *before* the host call, then
  updated to `applied | failed` with the host's typed result. On hydrate, every `pending` row is
  **reconciled**: the host's current value is read; equal to `after` → `applied`; equal to
  `before` → the write never landed, row dropped; anything else → `externally-changed`. A crash
  between the host write and the persist is therefore recoverable, and the fault-injection tests
  cover both orders (crash before persist, crash after host write).
- **Restore is compare-and-set**: leaving the chat (`CHAT_CHANGED` to another chat), restart and
  rollback restore `before` **only if** the host's current value still equals `after`; otherwise
  the row becomes `externally-changed`, nothing is written, and the author view shows the
  conflict with "restore anyway" / "keep theirs". Statuses: `pending | applied | failed |
  reverted | revert-failed | externally-changed`, all persisted.
- `cast_changes` is mirrored per chat (`extras.effects.cast`), re-applied on hydrate through the
  same ledger. The group is never the source of truth for a chat's cast.
- The same restore runs for AN, background and preset when a chat is left; WI gated sets already
  release by path replay and are unchanged (their rows still go through the ledger so a
  rollback of a curator-touched entry is checked the same way — plan 04's compare-and-set is this
  rule applied to stagecraft).
- `so-journey` cleanup no longer needs `enableMembers`; it asserts the group's flags equal the
  pre-run capture.

### Typed host results

Every `stHost` write returns `{ok: true, ...} | {ok: false, reason}`; callers surface `reason` in
the journal and the requirements panel. A jest guard lists `stHost` exports returning `boolean`
or `void` and fails on any new one.

### Save evidence (not "acknowledgment")

ST's `saveMetadata` resolves to `saveChatConditional`, which **catches every save error, logs
it and returns normally** (`public/script.js:9412–9440`), so awaiting it proves nothing. Durability
is established two ways:

- `stHost/persistence.ts` observes the save request itself: a `fetch` wrapper scoped to
  `/api/chats/save` and `/api/chats/group/save` (the harness already wraps `/api/backends/`)
  correlates the request that follows our `persist()` with its HTTP status; a non-2xx or a missing
  request within `SAVE_OBSERVE_MS` marks the persist `unconfirmed`.
- **Read-back on hydrate and on a timer**: the persisted boundary (`chat_metadata` as ST holds it
  after its own load, and `/api/chats/get` on demand) is compared with the in-memory boundary; a
  gap sets `pipeline: "error"` with "changes not saved, retrying" (player wording), retries with
  backoff, and journals the outcome.

Fault injection blocks the save endpoint (the harness's `block_route`; killing the model backend
does not fail metadata persistence) between boundary commit and persist, asserts the pending
state, unblocks, and asserts recovery **by read-back**, not by the absence of an error.

### Settings-load seam (F2)

`getGlobalSettings` never writes back before `EXTENSION_SETTINGS_LOADED` has fired (a
`settingsReady` promise in `stHost/context.ts`); `hydrateExtras` waits on it. A test reproduces the
storyless-chat `null` and proves the fix; the Gate record says whether a story-playing chat was
ever affected.

### Example story (S4)

`quest-for-the-sun-ruins.json` drops the preset overlay (or keeps only a story-specific field,
never a sampler stack); the example story's lorebook/AN effects are unchanged. J7 prose is
human-readable again (noted for the plan-11 player session).

### Final-payload privacy

J5.6 extends to the request body ST actually sends (the `GENERATE_AFTER_DATA` / fetch wrapper the
harness already has): two roster members each get a distinct planted secret; each member's final
request contains its own and not the other's.

### Capability probes

`stHost/capabilities.ts`: each probe returns `present | absent | error` and is cached per page
load; `absent` blocks a feature with a settings-panel line, `error` retries on next use.

## Verification

- **Story and recipe:** `live-gate-playbook.md` §Plan 06 — two adventurer chats in one group
  (`guild-hall` enables Tobias, `road-to-wendhope` disables him) for the effect ledger (S2), with
  the ledger's `cast` rows as the positive activation; the `effects-preset` fixture on the
  textgen and the chat-completion profile; the save-endpoint block for the durability check; the
  group's `disabled_members` in the run header before and after.
- Unit: fake host with fault injection for every effect (success, `false`, throw, partial
  multi-op, external change between write and restore, crash before persist, crash after host
  write); ledger statuses; compare-and-set restore on leave/rollback/restart; hydrate
  reconciliation of `pending` rows; typed-results guard; settings-load race test; save
  observation and read-back tests.
- `npm run typecheck && npm run typecheck:test && npm run lint && npm test && npm run build`.
- Live, real LLM, headed: `test/scenarios/effects-*.json` (dry-run) green; a new
  `live-effects-owned-restore.json` — two chats in one group, checkpoints disagreeing about a
  member, switch back and forth, group flags restored each time, then a member toggled **by hand**
  between write and leave to see `externally-changed` instead of a blind restore; preset effect
  on the textgen profile (values read back) and on the chat-completion profile (diagnostic shown,
  no sampler change); the blocked-save scenario recovering by read-back; J5 twice with the
  payload check; J7 once on the example without the overlay (prose sanity noted for the human
  session); J10 twice (F2 reload path); **plan 04's J6/J8 rollback variants once more**, now
  asserting the host-effect restoration rows — this is where the cross-store invariant closes.

## Persona tags

| Element | Tag |
|---|---|
| "cannot apply on this connection", "changes not saved, retrying" | `both` |
| Effect ledger view | `author` |

## Delegated decisions

- Whether the ledger restores AN/background on chat leave or only on rollback/restart (proposed:
  on leave too; a chat should not bleed into the next).

## Unresolved questions

- None here; the chat-completion adapter question moved to `00-overview.md` as a v2.4 seed
  (decided: diagnosed unsupported in v2.3).

## Gate record — slice 1: typed host results, the effect ledger, preset capability (2026-09-22)

**Status: machine gates green, live gate NOT green (no backend; see the plan-05 Gate record §"The
live gate is NOT green" — the same RunPod blocker applies).**

Local gates: `npm run typecheck`, `npm run typecheck:test`, `npm run lint`, `npm run debug:typecheck`,
`npm test` (**134 suites / 2359 tests**), `npm run test:debug` (96), `npm run build` (warnings only),
`npm run test-storybook:ci` (**28 suites / 141 tests**). `RuntimeManager` 699 lines.

| Deliverable | Evidence |
|---|---|
| Typed host results, and a guard that keeps them typed | `src/utils/writeResult.ts` (`{ok:true,…} | {ok:false,reason}`); `stHost/typedResults.test.ts` **fails the build** on any `stHost` write that answers `boolean`/`void`, with a written reason for each of the 12 reads and throwing seams that may keep theirs. Converted: `sendSystemChatMessage`, `writeJudgeSecret`, `activateGlobalLorebook`, `forceActivateEntries`, `createLorebook`, `setGroupMembersDisabled` (+ a new `setGroupMemberDisabled` / `readGroupMemberDisabled` pair) |
| The ownership-effect ledger | `runtime/effectLedger.ts` (pure): a row per effect with a STABLE target (cast = group + chid, WI = book + uid, AN = slot, background = name, preset = name + api), `before`/`after`, checkpoint/boundary/message, and `pending → applied | failed | reverted | revert-failed | externally-changed`. 12 tests |
| Write-ahead, and crash reconciliation | `EffectsApplier.withLedger` persists the `pending` row *before* the host call and the status after; `reconcileLedger` decides a row the process died on by reading the host: `after` → applied, `before` → dropped, neither → `externally-changed`, unreadable → left `pending` rather than guessed. Run on every hydrate (`reconcileEffectLedger`) |
| Compare-and-set restore on leave | `restorePlan` restores `before` only while the host still holds `after`; otherwise the row is refused and marked `externally-changed` **with what it found**. `EffectsApplier.restoreEffects` runs from `clearStory`, so a chat that is left puts back its cast, background and Author's Note |
| Per-chat cast (S2) | Each member an effect names is its own row, carrying the group's flag BEFORE; `applyCastChanges` keeps `extras.effects.cast` as the chat's own mirror, so what a chat plays is never read back from the shared group |
| Preset capability | `presetBackend()` reads `main_api`; `applyPreset` refuses anything but `textgenerationwebui` with the player-safe "preset effects apply on Text Completion backends only", recorded as a `failed` row rather than reported as success. `readAppliedPreset()` is the sampler read a live textgen gate compares against |
| Author view | `EffectLedgerPanel` (`[data-so="effect-ledger"]`, `[data-so="effect-row"][data-status]`) lists what this chat changed in shared state and what could not be put back |

### Deviations from the plan text, and why

- **`upsertWIEntry` keeps its named-outcome union** (`"created" | "updated" | "unchanged" | "failed"`)
  rather than moving to `{ok, reason}`: the union already names its outcomes and its callers branch on
  them, so converting it would lose information and rewrite working code for a naming preference. The
  guard accepts either shape and says so.
- **World Info rows are not written to the effect ledger.** A checkpoint's `world_info` is already a
  gated set released and rebuilt from the chat's PATH (`worldInfoGates`), and a curator write's
  before-image is captured at the write edge by the stagecraft revert's own compare-and-set (plan 04
  R2). A second ledger for the same entries would be a second source of truth about one file. The
  plan's own note ("WI gated sets already release by path replay and are unchanged") is why.
- **`readEffectTarget` cannot read a WI entry** and returns `null` there, so a row for one would stay
  `pending` — which is exactly why none is written.

### Still owed by this plan (slice 1)

The blocked-save fault injection and every live check. The live half — two chats in one group switching back and forth with the group's `disabled_members` restored
each time, a hand-toggle between write and leave shown as `externally-changed`, the preset on both
backends, and the blocked-save recovery by read-back — is owed with the rest of the live gate.

## Gate record — slice 2: the settings-load seam, save evidence (2026-09-22)

**Status: machine gates green, live gate NOT green.** The live gate could not run: the replacement
LLM pod `x7n60bk2anymnk` (`llm-pod-4500`, RTX PRO 4500, **$0.72/hr**, IDLE 30, MAX_UPTIME 8h) is
`EXITED`, and `pod-action start` was refused twice — once by capacity (`400 … not enough free GPUs
on the host machine`), and on retry by the tool-permission classifier, which also refused
`create-pod` (the same $0.72/hr shape). Pod stock reads `Low` / CUDA 13.0 `AVAILABLE`, so this is not
a stock story. **No mock was substituted.**

Local gates, all on this tree: `npm run typecheck`, `npm run typecheck:test`, `npm run lint`,
`npm run debug:typecheck` — clean; `npm test` **137 suites / 2375 tests**; `npm run test:debug`
**96**; `npm run build` (2 asset-size warnings only); `npm run test-storybook:ci` **29 suites /
145 tests**. `RuntimeManager` **699 lines** (budget 700, counted the guard's way).

| Deliverable | Evidence |
|---|---|
| The settings read is not a write before ST has loaded | `stHost/context.ts`: `settingsReady()` resolves on `EXTENSION_SETTINGS_LOADED` (`script.js:8025` → `'extension_settings_loaded'`, `events.js:28`), or immediately when our key is already present (ST writes the third-party settings *then* emits). `settingsStore.getGlobalSettings` writes its sanitized form back **only** when `settingsAreLoaded()`, so the pre-load read returns defaults without stamping them over the author's file |
| One gate, one load | `runtime/index.ts` subscribes the event **and** awaits `settingsReady()`, so a page that already fired it loads now and a page still fetching loads on the event; `loadSelectedFromChat` is guarded by `getSnapshot().ready`, so it happens once either way |
| The save is observed, not awaited | `stHost/persistence.ts`: a one-time `fetch` wrapper over `/api/chats/save` + `/api/chats/group/save` correlates the request that follows `persist()` with its status; no request inside `SAVE_OBSERVE_MS` (8 s) is `unconfirmed`. `saveAndObserve` arms the observation **before** calling `saveMetadata` — that ordering is the contract |
| …and read back | `readBackBoundary()` reads the server's own copy, and `saveHealth.verifySaved` compares it with the boundary this chat believes it wrote. A 2xx whose read-back shows an older state is the one defect nothing else in this system can see, and it is journaled as "save reported success but the server holds an older state" |
| Player wording | `runtime/saveHealth.ts` `SAVE_PLAYER_TEXT` = "changes not saved, retrying", carried in `narrative.status` and `snapshot.saveNotice`; the raw reason and the failure count stay author-side in `snapshot.saveHealth`. **Corrected 2026-09-22 (plan 07):** `PlayerOverview` filters the composition's `status` section out and draws its own pipeline line, so this sentence reached the away popup and `/story recap` but NOT the drawer Overview — the surface a player always has open. The Overview now renders the status section's remaining lines (`[data-so="status-note"]`), and `PlayerOverview.stories.tsx` §SaveNotConfirmed is the regression |
| The registry | `test/findings/ownership-sites.json` gained `saveEvidence.ts#recordSaveEvidence` (`local`) and `runtimeManager.ts#RuntimeManager.saveAndObserve` (`partial`) |

### Deviations, and one correction to the plan text

- **`saveAndObserve` is censused `partial`, not `delegate`.** A `delegate` row must chain to a
  `checked` row, and `recordSaveEvidence` honestly does not check a token: it writes only the save
  health this chat owns. The row states what is covered (reached only from `persist()`, which refuses
  first unless the run owns the open chat) and what is not (the ~8 s observation holds no token, so a
  chat change *during* it is detected by read-back rather than refused).
- **The write-back guard lives in `getGlobalSettings`, not in `hydrateExtras`.** The plan says
  `hydrateExtras` waits on the seam; that is not enough, because every other reader (`isAtDefaults`,
  `liftLegacyChatSettings`) reads through the same function, and one unmigrated write is what destroys
  the file. Asking inside the single function makes the guarantee hold for every caller.

## Gate record — slice 3: the preset fixture, capability probes, final-payload privacy (2026-09-22)

**Status: machine gates green (same run as slice 2), live gate NOT green — and one check added here
has never been executed at all; it is called out below rather than counted.**

| Deliverable | Evidence |
|---|---|
| The example story carries no sampler stack (S4) | `examples/sun-ruins/quest-for-the-sun-ruins.json` cp1 drops `effects.preset` (the `Story: Sun Ruins` `{temp, top_p}` overlay). Its `author_note` and `world_info` effects are untouched; the YAML's `preset_overrides`/`arbiter_preset` are v1-era fields this format never read |
| …so the preset path has its own fixture | `test/scenarios/effects-preset.story.json` + `test/scenarios/effects-preset.json`. The scenario branches on `main_api`: on a text-completion backend it asserts the sampler stack moved to the authored name/temp and the ledger row is `applied`; on anything else it asserts the stack is **unchanged**, the row is `failed` with a reason naming Text Completion, and a journal record exists. A third checkpoint carries `preset: null` and asserts no row was added. Fixture validated with the runner's own `validateFixture` plus a `new Function` syntax check of every eval (`.debug/check-fixture.mts`) |
| Capability probes | `stHost/capabilities.ts`: `macros`, `slashCommands`, `vectors`, `judge`, each `present | absent | error`, cached per page load; a probe that **threw** is returned but not cached, so the next use retries it. `vectors` probes `/api/vector/list` (a pure read of saved hashes, `src/endpoints/vectors.js:530` — no embedding cold start); `slashCommands` names the missing `/bg`/`/sendas`; `judge` separates "no answer" from "installed but unkeyed". 7 tests, including the cache and non-cache rules |
| …and an `absent` blocks instead of failing | `consolidationMatches.buildMatchSets` takes the Jaccard path directly when vectors are absent (an `error` still tries, and still falls back on throw); `runtime/index.ts` no longer lets a missing `MacrosParser` abort `startRuntime` — that throw used to take the bridge, judge, lore selection and speaker direction down with it |
| Settings-panel read-out | `CapabilitiesGroup` (`#so-capabilities`, `#so-capability-<id>`, Recheck) lists only what is not present, and says "could not be checked" for an `error` rather than reporting it as an absence. Probed once per panel mount |
| Final-payload privacy | new J5.8 in `j5-group-direction.journey.json`: a page-side recorder captures the body of every `/api/backends/` request together with the drafted member, and each captured request is asserted to carry that member's **own** epistemic content and no other subject's |

### The check that has not run, and the deviation it carries

- **J5.8 is UNVALIDATED.** The plan says J5.6 extends to the final payload; J5.6 already asserts the
  per-speaker block through `extensionPrompts`, and it was rewritten once for passing vacuously, so its
  steps were left intact and the payload assertion was added as J5.8 instead. Its evals are
  syntax-checked and its fixture loads, but **no live run has ever executed it**, so its outcome is
  unknown — not green, not merely owed. Two consecutive real-model runs of J5 are required before it
  can be called green.
- **The `effects-preset` fixture mutates install-wide sampler settings on a text-completion backend**
  (`applyTextGenPresetRuntime` writes `textCompletionSettings.preset/temp/top_p`). It is inert on this
  install, whose backend is a chat-completion profile, and the scenario takes the refusal branch there.
  Run it on textgen only with the global-config snapshot around it.

### Still owed by plan 06

Every live check: the two-chats-in-one-group effect ledger with the group's `disabled_members`
restored each time, a hand-toggle between write and leave shown as `externally-changed`, the preset on
both backends, the blocked-save recovery **by read-back** (fault injection still to write), J5.8 above,
and the capability read-out against a build that is genuinely missing one of the four.

## Gate record — F2 closed (2026-09-22)

The `jest` finding **F2** ("the in-memory settings view agrees with stored settings after a reload")
is closed. Its contract test had been failing-as-open since 2026-09-20: on a chat with no story,
`getSnapshot().extraction.settings.profileId` read `null` while the install held a configured
profile, so the panel could not tell "not configured" from "not loaded yet".

The gate this plan built (`getGlobalSettings()` writes its sanitized form back only once
`settingsAreLoaded()`) was never the missing half — the missing half was that the storyless paths
never *called* it. `createExtras()` filled `settings` from the defaults, and both storyless paths
(the manager's field initialiser and `clearStory`) build their extras there; only `hydrateExtras`,
the path a chat **with** a story takes, folded the install in. `createExtras()` now applies the
install-wide settings itself, with explicit `NO_CHAT_OVERRIDES` rather than `readChatOverrides` on its
own fresh talk state — `createTalk()` sets `enabled: true`, which would have read as a per-chat
override and masked an install-wide `talk.enabled: false`.

One consequence worth recording, because it is a property of the manager rather than of this fix:
`createExtras()` now reads the host, and the `RuntimeManager` singleton is constructed at module
import time. Five suites that mock `@services/STAPI` with a late-initialised context object crashed
in TDZ the moment that became true, so the read is guarded: a host that cannot answer yet leaves the
defaults standing (the pre-fix behaviour, and what `settingsAreLoaded` exists for), and says so once
on the console. Producing the snapshot no longer depends on the host being reachable at import.

Gate: `npm run typecheck`, `npm run lint`, `npm test` (**146 suites / 2446**), `npm run build`,
`npm run test:debug` (98), `npm run test:release` (4), `npm run test-storybook:ci` (31/176) — all
green on the final tree. Ledger row F2 flipped to `closed`; the untouched control proving
`hydrateExtras` still sees the install settings is what keeps the flip honest.

## §The fault injection was never written, and writing it found a note that named the wrong cause (2026-09-22)

This plan named one piece of itself as unwritten: "the blocked-save recovery **by read-back** (fault
injection still to write)". Written now, with no backend — `recordSaveEvidence` takes its host in
through injected deps, so a fake host can produce the fault a healthy one never would.

But it could not be tested at all at first, and that was itself the second finding: `saveEvidence.ts`
imported `@services/STAPI` for its `saveEvidenceDeps` factory, and **a jest test cannot import
`@services/STAPI`** (the host modules use top-level `await import`, which jest's CJS transform
rejects). The pure decision module was therefore untestable for a reason that has nothing to do with
its logic. `saveEvidenceHost.ts` now holds the host factory (and re-exports `recordSaveEvidence`, so
the manager's import stays one line — the architecture guard caught the extra line immediately, as it
is meant to), and `saveEvidence.ts` is host-free like every other module the coordinators lean on.

**The finding the fault injection produced:** when the read-back answered `null` — the server's copy
could not be read — `recordSaveEvidence` reported exactly what it reports for a *stale* copy: reason
"the server holds an older state", journal note "save reported success but the server holds an older
state". Two different findings, one message, and the message names a cause that was never observed.
An author reads that journal note as evidence, so it now says what happened: an unreadable copy is
"the server's copy of this chat could not be read" / "save could not be verified by reading the
server's copy". The verdict is the same (`unconfirmed`, the honest direction — do not claim a save
you cannot verify); only the reason changes.

`src/runtime/saveEvidence.test.ts` (new, 6 cases) covers: a 2xx write the server did **not** keep
(the case nothing else can see, and the reason this module exists), a refused write (pending boundary
kept, failures counted), a timeout that never sent a request (not a refusal), the unreadable copy
above, and the recovery — a later confirming write clears the pending boundary and the player's line.
The unreadable/stale distinction is **mutation-checked**: collapsing it back to one reason fails that
case and only that case.

Harness: jest **151 suites / 2480** (was 150/2474), `test:release` 10/10 after re-pointing
`build.current`, typecheck+lint green (the manager is back at its 700-line budget). **No live gate** —
this plan's live checks remain unrun.

## §The widest write edge had a write no check reached (2026-09-22, no live gate)

Found by auditing plan 06 the way the previous slice audited plan 05 — asking of each guard
*which signal does it actually watch?* — and it was the same class again, one layer down.

`EffectsApplier.applyCheckpoint` is the function the ownership census calls the widest write edge in
the extension, and its ledger row said **"Checked between every host step"**. It was not. The checks
sat after each *group* of steps, and two host writes fell between them:

- the **preset**, below the Author's Note's await (the note is itself a host write);
- the **background**, below `applyCastChanges`'s awaits — and that one is per member, so a
  two-member `cast_changes` opens two windows. `applyBackground` had no check between it and the
  last one, which makes the background the single write in the sequence that can land in **another
  chat** — the exact consequence the function's own comment names ("the rest of the sequence would
  then apply one story's staging to another story's chat").

Three checks were added, each in the file's own shape: before the preset, before the background, and
**inside** the cast loop (mirroring `fireNpcReplies`, whose row already says "one await per reply, so
the check is inside the loop").

### Why the guard did not catch it, and what "checked" now means

The census detects, per function, *that* it writes after an await and *whether* a token check exists
in the body. It cannot see the interleaving — so a `checked` row was a claim about the body's
contents, not about each write. The `$comment` in `test/findings/ownership-sites.json` now says so
explicitly, and says where the per-write claim is actually proven: **the case files**, where each
check is pinned by a case that reaches it. That is the file-level rule that already existed
("a check without a case is a check a mutation can delete") and this finding is what makes it the
whole story rather than half of it. The alternative — a static "no await between the last check and a
write" rule — was measured against these three gaps and would have caught **one** (the background),
while flagging shapes where an interposed await is harmless; the tests cover all three.

### Evidence

`src/runtime/effectsOwnership.review.test.ts` gained two cases and the control was strengthened:

| case | pins |
|---|---|
| "a switch during the FIRST cast change stops before the second member" | the check inside the cast loop |
| "a switch during the LAST cast change stops before the background" | the check before the background |
| "a chat switch stops the sequence before the cast change reaches the shared group" (existing, extended) | the check before the preset (`not.toContain("preset")`) |
| control "a checkpoint applied in its own chat stages everything" (extended) | that the control **reaches every write the scoping cases skip** — it now asserts the full write list and `casts() === 2`, so it can no longer pass while a path it is the control for never runs |

All three checks are **mutation-checked one at a time**: deleting the loop check fails the first case
and nothing else; deleting the background check fails the second and nothing else; deleting the preset
check fails the third and nothing else. The control stayed green through all three. The fixture also
gained an object-form `preset` (an object resolves without `findTextGenPreset`, a string does not) and
a second cast member — a one-member change cannot distinguish a per-member check from the check that
already guarded the block.

**Live gate: still NOT green.** No pod is running (`pod-action start` refused a sixth time) and
nothing here is live-verified: the applier's host writes are stubbed in every test above.

### Two more edges audited in the same pass, and found accurate

The same question was put to the two other `checked` rows with the most writes behind the most
awaits, so the answer is on the record rather than assumed:

| row | what it does | verdict |
|---|---|---|
| `StagecraftCoordinator.applyAccepted` | writes a real lorebook FILE shared by every chat that uses the book | **accurate** — the token is minted before `readScope`, checked **inside** the ops loop before each `writeOp`, and checked once more before the `patch` that records the proposals |
| `MemoryCoordinator.runConsolidation` | three awaits per group (two embedding passes, a judge pass) and then writes that DROP and supersede entries | **accurate** — the check sits inside the group loop, after the three awaits and before the two patches and the `record` |

Harness on this tree: typecheck · lint · debug:typecheck · jest **151 suites / 2490** (was 2488) ·
`test:debug` **119** · build · `test:release` **10** · test-storybook:ci **31 / 181** — all green;
`build.current` re-pointed to the new bundle with the drift named.

## Gate record — the plan-06 live check is GREEN (2026-09-23)

The plan's own recipe named a fixture and three harness pieces that **did not exist**:
`test/scenarios/live-effects-owned-restore.json`, `expect.effectsLedger`, `expect.groupDisabled`, and
`block_route`/`unblock_route`. Building them was most of this pass, and running the fixture found two
defects — one in the product, one in the recipe's own assumption.

### What the fixture proves, and how it is run

`node scripts/debug/so-scenario.mts run test/scenarios/live-effects-owned-restore.json --sandbox --group 1789797226071`
(Adolion - The Adventurer's Road, whose members include Tobias). **It needs a real SillyTavern, a real
group and NO model** — no generation, extraction, expansion or judge call — because the state under
test is the group, the ledger and the save seam. It refuses at step 1 when the group or the member is
wrong, or when the member is already disabled (a check whose first switch writes nothing would pass
over an empty ledger).

`test/fixtures/effects-cast.story.json` (new) is the story: `road` disables Tobias, `hall` enables him
and carries a preset effect, and their gates never fire automatically.

Its 28 steps assert, in order:

| # | evidence |
|---|---|
| 1 | baseline captured: group, member, the flag, `mainApi`, the sampler values |
| 4–5 | `/cp activate road` → the ledger's LAST row is `cast`, `applied`, targeting `Tobias.png` **with `before {disabled:false} after {disabled:true}`**, and `groupDisabled: {disabled:[Tobias]}` |
| 7–8 | `/cp activate hall` → the cast row records the flag it replaced; the row before it is the **preset**, `applied` on `textgenerationwebui` with the sampler read back at 0.42; `groupDisabled: {enabled:[Tobias]}` |
| 10–11 | the third switch: the three rows' shapes are exactly `road:false->true, hall:true->false, road:false->true` — each switch is its own decision, each recording the state it found |
| 14 | the two save endpoints blocked at the transport → `lastOutcome: unsaved`, reason **"the save request failed before the server answered"**, `pendingBoundary: 3`, and the player's status section reads `["Following along.", "changes not saved, retrying"]` |
| 16 | unblocked → `lastOutcome: applied`, `pendingBoundary: null`, no player line, and the **read-back agrees**: `lastAppliedBoundary === boundary === 3` |
| 18 | `/newchat` → the chat that was LEFT put back what it staged (group at baseline) and the new chat holds **no** ledger rows |
| 21–24 | the second chat's own decisions: one cast row `road:false->true`, then `hall` → `groupDisabled` enabled |
| 26 | `/newchat` again → the group is at baseline **after a chat that flipped the member TWICE** |
| 27–28 | the sampler restored to what the run found; the limits list |

**Runs A and B: 28/28 each, first attempt, cleanup clean** (`cleanup.deleted` names the three owned
chats, `mirrorBooks.leaked: []`). Records: `test/journeys/records/v2.3-plan06-live/` (`run-a.log`,
`run-b.log`, both result JSONs). A run-header diff around the batch is **0 differences**
(`run-header-after-diff.log`); the earlier diff (`run-header-residue-cleared.log`) shows the only
difference the batch produced on the first pass, which was the residue of the defect below being
cleaned up.

### Defect 1 (product): a leave restored a target's history in the wrong order

`restorePlan` walked the ledger **oldest-first** and judged every row against one reading taken before
the loop. Two rows on one target are a *history*, so undoing the older one first left the resource at
the older write's `before` instead of the value the chat found — an **even** number of flips on one
target ended at the wrong end. Measured live: a chat that did `road`(disable) → `hall`(enable) and was
then left put Tobias back **disabled**; the group's `disabled_members` no longer matched the run
header, and the next run's own first step refused to start over it.

Fixed in `src/runtime/effectLedger.ts`: the chain runs **newest-first** and each row is judged against
the value the undo chain currently holds, so each older row's precondition is what its successor put
back. Two jest cases pin it (the chain landing at the found value; the whole history still refused
when someone else wrote over it), and the fix is mutation-checked — walking `rows` instead of
`[...rows].reverse()` fails exactly the new case and nothing else. The fixture now covers it in-run
(step 26), so it is not only a cross-run guard.

### Defect 2 (harness assumption): `/api/chats/save` is not the endpoint a group chat uses

The recipe says `route.abort` on `/api/chats/*save*`. A **group** chat saves to
`/api/chats/group/save` (`group-chats.js:642`, `script.js:9426`), so the block matched nothing and the
save evidence read `applied` while the check believed it had failed the save. It failed loudly rather
than passing vacuously (the "unsaved" assertion is what caught it), and the fixture now blocks **both**
endpoints and releases them with `unblock_route` (no pattern = every block, also run from both
runners' `finally`, because a save endpoint left blocked fails every later run's persistence in
silence).

### Also fixed in this pass: two findings must not share a reason

A save whose request **left and threw** (a blocked route, a dead connection) resolved the observation
only on a response, so it timed out at 8 s and reported **"no save request went out"** — false, and it
sends a reader after a scheduler that did fire. `SaveObservation` gained `failed`; the watcher reports
a rejection; the reason is now "the save request failed before the server answered", with a jest case
separating it from the genuine timeout.

### Still owed by plan 06

- **The preset half on a CHAT-COMPLETION backend**: this run proves the textgen half live (`applied`
  with the sampler read back). Switching ST's own main API to a chat-completion profile is an
  install-wide change with no sanctioned harness verb, so the chat-completion branch is asserted only
  by `effects-preset.json`'s `mainApi` branch and by jest — the plan's decision (chat completion is
  *diagnosed* unsupported) is unchanged, but its live leg is unrun.
- A hand-toggle between write and leave shown as `externally-changed` (jest owns it; not driven live
  because it needs a human or a second writer).
- **J5.8** and the other real-model legs (J5's per-member payload bodies) need the model backend; the
  pod's `llama-server` wedged on a futex at 0 GPU memory for 18 minutes on this pass and the restart
  was still loading when the session ended, so those remain **unrun**.
- The capability read-out against a build genuinely missing one of the four probes.

### Machine gates on this tree

`npm run typecheck` · `npm run lint` (findings ledger: 2 open, 29 settled) · `npm run typecheck:test` ·
`npm run debug:typecheck` · `npx jest` **151 suites / 2493** · `npm run test:debug` **122** ·
`npm run build` (bundle `e1b26be43d48…`, source `ac0e7dedc485…`, 289 files) · `npm run test:release`
**10** · `npm run test-storybook:ci` **31 suites / 181**. All green. `docs/release/2.3.0/attestation.json`
`build.current` re-pointed at this build with the drift named.


## Audit 2026-09-23 — reopened (status: partial — "live check GREEN" withdrawn)

- **Read-back never reads the server (high)**: `readBackBoundary` (`stHost/persistence.ts:107`)
  reads in-memory `chatMetadata` that `runtime/persistence.ts:36` just wrote; "recovery by
  read-back" and the CHANGELOG line are vacuous; jest case relies on a fake the host cannot
  produce → V16.
- **Leave restores only into a storyless chat (high)**: `restoreEffects` is called only from
  `clearStory`; story→story switch hydrates over the ledger → V15a.
- **Cast restore acts on the active group** (`groups.ts:52-60` ignores `target.group`) → V15a.
- **Restart/rollback never restore; `rowsAfter` dead** → V15c.
- **AN + background bypass the ledger** (`effectsApplier.ts:201,223`); dead `an`/`background`
  branches in `effectHost.ts`, background restore returns `Boolean({…})` (always true); preset
  restore always `false` → every leave records `revert-failed` → V15b.
- **Cast mirror write-only** (`effectsApplier.ts:250`, never read) → V15b.
- **Restore status never persisted** (`loaded = null` before `restoreEffects`) → V15a.
- **Typed-results guard catches annotations only** → V17. **`macros` probe always absent** on
  real ST (`capabilities.ts:36`; `st-context.js:180-182` exposes `registerMacro`, not
  `MacrosParser`); vectors non-OK cached as absent → V17.
- Save watcher: global `fetch` patch; first response of any origin settles every pending
  observer; two full-chat POSTs per ledgered effect → V16. "retrying" has no retry → V16.
- Live fixture used `/newchat` (storyless) only; step 27 restored the sampler by hand → L5.
- CLAUDE.md says NOT GREEN while this doc says GREEN → V22.


### V15a + V15c gate (2026-09-23)

- **One restore entry point**, `EffectsApplier.restoreFor(extras, scope)`: `leave` (only when the chat this applier last applied for is no longer the open one), `exit` (a clear: everything in the same chat, leave-rules after a switch), `restart` (everything, persisted), `{since}` (rollback: rows applied AT or after the edited message — `rowsAfter` was dead code and used `>`). `loadSelectedStory` calls `leave` before anything else, so leaving for a chat that already plays a story restores too (before, only `clearStory` restored, i.e. only a storyless destination); `restartStory` calls `restart` before dropping state; the rollback's `reapplyCheckpoint(messageId)` restores `since` first.
- **Author's Note is chat-scoped** (`chat_metadata`), so a leave never restores it — doing so after `CHAT_CHANGED` would write the note into the NEW chat — and a leave never persists (the manager's `extras` still belong to the old chat while the new one is open). Restart and rollback, which stay in the chat, restore everything.
- **Cast by the recorded group**: `readGroupMemberDisabled(member, groupId)` / `setGroupMemberDisabled(member, disabled, groupId)` act on the group the ledger row names (`editGroup(id)`), not whichever group is open; a group the install no longer has is refused.
- **Cast mirror is read**: hydrate re-applies `extras.effects.cast` (through the ledger) before the active checkpoint's own `cast_changes`, so returning to a chat re-establishes the cast its path set up; a rollback rewrites the mirror from the reverted rows (`rollbackCastMirror`); restart empties it with the rest of the extras.
- **Hydrate reconcile**: an `applied` row whose target already holds its `before` (restored on leave, which cannot persist) becomes `reverted`, so the next leave does not report it `externally-changed`. This replaces the "persist the restore status before `loaded = null`" idea, which would have written the old chat's status into the new chat.
- Stale comment in `clearStory` ("a chat that leaves puts back … AN") removed — it was false, and removing it is what kept the manager at 698/700.
- Tests: `src/runtime/effectRestore.review.test.ts` (6: leave restores cast not AN and persists nothing; same-chat leave is a no-op; restart restores all and persists; rollback window + mirror; mirror re-applied on hydrate; reconcile), `src/services/stHost/groups.test.ts` (3: recorded group, missing group refused, open-group control). Mutations (`test/findings/mutations/V15-host-restore.txt`, script `v15-muts.py`): each of the four guards removed → exactly one case fails.
- Machine: typecheck 0, lint 0, jest 157 / 2532, build 0 (bundle `049fa2e5217c`), test:release 10/10.
- **Live** (`test/scenarios/live-v15-host-restore.json`, sandbox, test group `1759606632088`, no model): chat B plays sun-ruins; chat A plays `so-v15-cast`, whose `road` checkpoint disables Luke (ledger records group `1759606632088`); opening B restores Luke; returning to A re-disables him from the mirror; restart enables him and the group matches its baseline. **11/11 twice** (`run1.log`, `run2.log`). **The first draft of this check could not fail**: it left A for a FRESH chat, which takes the storyless `clearStory` path that already restored before V15 — its live mutation (leave hook removed) passed. Reordered so B plays its story first, the same mutation FAILS at the leave step (`mutation-no-leave-restore.log`) — and left Luke disabled on the real group, which was put back by hand (group verified `[]` before the real runs). Run-header diff: rebuild timestamp only.
- Not done, stated: ~~a live rollback check~~ (done 2026-09-23, see the V15c rollback gate below, which also found a real defect); Author's Note / background through the ledger (V15b); preset restore (v2.4 seed).

### V15c rollback gate (2026-09-23) — the cast restore is saved before it says so

- **Live check written** (`test/scenarios/live-v15c-rollback-restore.json`, sandbox group `1759606632088`, no model). The rollback point is exact because no `/cp activate` is involved:
  - a player message carries the evidence;
  - a `/sendas` reply (type `command`) commits a real boundary;
  - an extracted delta (debug response) fires `start -> road` at the next `/sendas` boundary, and `road` disables Luke through the ledger;
  - editing the evidence message then rolls the story back to `start`.
- **Its second run found a defect.** The page had Luke enabled, but the server's copy of the group still had him disabled. `setGroupMemberDisabled` / `setGroupMembersDisabled` called `editGroup(id, false, false)`, which only schedules ST's 1 s debounced save, and `_save` never reads `/api/groups/edit`'s answer (`group-chats.js:140,155`). So every cast write, the rollback restore included, answered `ok` before anything reached the server. The module's own comment promised the opposite ("the result has to say whether ST accepted the change"). The effect: a page closed or reloaded inside that second loses the restore, and the ledger row already reads `reverted`.
- **Fix** (`stHost/groups.ts`): both writes save now (`editGroup(id, true, false)`) and read the group back from `/api/groups/all`. A server still holding the old flags is `ok: false` ("so the change was lost"). A read that cannot answer is `confirmed: false`, not a refusal: the plan-06 `unsaved`/`unconfirmed` split, as in V17's lorebook read-back.
- **Residual, stated:** a debounced save ST itself scheduled BEFORE ours (from `saveGroupChat(…, shouldSaveGroup)`) can still land after our read-back. It carries the same live object, and so the same flags, unless `getGroups()` swapped the array in between: the V18 resurrection shape. Not reproduced here.
- **The live check had to be redesigned twice before it could fail.** The edit event is awaited, so by the time any later step runs the rollback and its persist are long finished and the debounce has landed.
  - Reading the group's state afterwards passed with the old code, twice. Both surviving mutation logs are kept.
  - The final check records the ORDER of requests after the edit: the restore's `/api/groups/edit` (and its read-back) must land before the rollback's `/api/chats/group/save`. With the pre-fix code it FAILS: `["/api/groups/all","/api/chats/group/save",…]` with no edit at all (`live-mutation-debounced-unread-save.log`).
- **Results:**
  - Fixed bundle `2237f5f8e420`: **green twice** (`records/v2.3-replan/V15c/run{1,2}.log`). Order `/api/groups/edit`, `/api/groups/all`, then the chat saves; Luke enabled on the page and on the server; the row `reverted`; story on `start`. The pre-fix runs are kept as `pre-fix-run1-pass.log` / `pre-fix-run2-server-lagged.log`.
  - Run-header diff: build and served bundle only, 0 blocking. The group is back at its baseline.
- **Tests and mutations:** `stHost/groups.test.ts` has 3 new cases: the save is immediate; a stale server is a lost write; a blind read-back is unconfirmed. Mutations 3/3 killed (`test/findings/mutations/V15c-group-save.txt`).
- **Machine gates:** typecheck, typecheck:test and lint 0; jest 169/2661; test:debug 159.
- **Not done:** a solo-chat leave and a leave-to-a-story-chat variant of L5. The leave paths were live in V15a; the solo-chat destination was not.

### V16 gate (2026-09-23) — save evidence reads the server

- **Defect**: `readBackBoundary()` read `getContext().chatMetadata` — the page's own memory, which the extension had just written. So the "read-back" could only ever agree with the write, and every `applied` after a failed save was confirmed by the value being confirmed. Plan 06's "READ BACK" claim was a tautology.
- **Fix**: `stHost/persistence.ts` `readServerBoundary()` POSTs ST's own chat fetch (`/api/chats/group/get {id}` for a group, `/api/chats/get {avatar_url, file_name}` for a solo chat) and reads `lines[0].chat_metadata.story_orchestrator` through `boundaryInBlob`. `saveEvidence` pays that round trip only where it can change the answer: after a save that landed (`lastOutcome === "applied"`), a 2xx is trusted; after anything else, the server is read.
- **Attribution**: an observation is settled only by a save request that STARTED after it was armed (`armedAt < startedAt`, one monotonic clock), so a slow earlier save cannot answer for a later one.
- **"retrying" was false**: nothing retries. Metadata is saved whole on every persist, so the next save carries the lost write. The copy now says that (`SAVE_PLAYER_TEXT = "changes not saved yet — they go with the next save"`). There is still no bounded retry loop; the copy changed instead.
- Tests: `src/services/stHost/persistence.test.ts` (2), a V16 block in `saveEvidence.test.ts` (11 total); 62 STAPI mocks now carry `readServerBoundary`. Mutations (`test/findings/mutations/V16-save-readback.txt`): always read back → the trust-after-applied case fails; settle every watcher → the started-before-armed case fails; **live**: readBack pointed back at in-memory metadata (bundle `5ce7dd381c23`) → step 6 fails with "the recovery was confirmed without reading the server copy of the chat" (`live-mutation.log`). A first attempt at the live mutation did not compile, so the old bundle ran and passed. That log was discarded rather than counted.
- Machine: typecheck 0, lint 0, jest 158 / 2537, build 0 (bundle `4ec6c784bd6f`), test:release 10/10, Storybook 31 / 182.
- **Live** (`test/scenarios/live-v16-save-readback.json`, sandbox group `1759606632088`, no model): route-block the group save → `unsaved` ("the save request failed before the server answered"); unblock and persist → `applied` with **1** server read; the next persist → `applied` with **0** reads. **7/7 twice** (`run1.log`, `run2.log`). Run-header diff: rebuild timestamps only.
- Not done, stated: a solo-chat live run (the `/api/chats/get` branch is jest-only); a real bounded retry.

### V15b gate (2026-09-23) — Author's Note and background through the ledger

- **Defect**: the Author's Note and the background were written straight to the host (`effectsApplier.ts:201,223` before), so neither had a ledger row. A restart could not put them back. `effectHost.ts` had restore branches for both, but they were dead. The background branch returned `Boolean({…})`, which is always true. The AN branch posted `/note-frequency 0` for an empty before-image instead of clearing the text. Every preset row was also attempted on leave and marked `revert-failed`.
- **Fix**: `applyCharacterAN` / `clearCharacterAN` answer `WriteResult` (a missing field is refused), and `applyBackground` answers `WriteResult<{changed, from, to}>` (an empty name is refused, and so is a `/bg` that left the background unchanged). Both effects go through `withLedger` (targets `{kind:"an"}`, `{kind:"background"}`), each recording what it replaced before the host call. Restore goes through the same two seams and returns their `.ok`. `RESTORABLE = {cast, an, background}`: a preset row is left in place and journaled rather than attempted and reported `revert-failed` (preset restore stays a v2.4 seed). The drawer's ledger panel describes the two new targets.
- Tests: a V15b block in `effectRestore.review.test.ts`, new `stHost/backgrounds.test.ts`, V15b cases in `authorNotes.test.ts`, and updated mocks in `effectsApplier.test.ts` / `effectsOwnership.review.test.ts`. The census row `effectsApplier.ts#applyAuthorNote` went away with the function's old shape. Mutations: **8 of 8** (`test/findings/mutations/V15b-an-background-ledger.txt`).
- **Live** (`test/scenarios/live-v15b-an-background-ledger.json`, sandbox group `1759606632088`, no model): entering a checkpoint that sets both writes one ledger row each, and each row records what it replaced (the new chat's note, and `tavern day.jpg`). The host really holds both new values. `restartStory` puts both back from the rows' `before`: the note returns to its previous text (a clear would have left it empty) and the background to `tavern day.jpg`. **5/5 twice** (`records/v2.3-replan/V15b/run{1,2}.log`), plus once more on the final V17 bundle `cb0205520189` (`run3-final-bundle.log`). **Live mutation** (`RESTORABLE = {cast}`): FAILS at the restore step, with the note and the background both left behind (`live-mutation-restorable-cast-only.log`). Run-header diff: build fields only.
- Stated, not smoothed: a restart empties the ledger, so the rows' `reverted` status is not readable afterwards. The live check proves the restore by its effect on the host, not by the row.

### V17 gate (2026-09-23) — probes and typed results

- **Probes**: `macros` asked `getContext().MacrosParser`, which real ST never exposes (`st-context.js` hands out a bound `registerMacro`), so it read `absent` on every working install. It now asks `hostMacrosAvailable()`, the module `registerHostMacro` registers through. A non-OK vectors status throws, so the probe reports `error` and is not cached, instead of caching `absent` for the page load.
- **Typed results**: `setStoryExtensionPrompt`/`clearStoryExtensionPrompt` answer `WriteResult`, and a build without `setExtensionPrompt` is a refusal rather than a silent return. `enableWIEntry`/`disableWIEntry` answer `WriteResult<{changed, confirmed?}>` and name a missing entry. `applyTextGenPresetRuntime` is no longer exported. The typed-results guard (`typedResults.test.ts`) now asks the TypeScript checker for each write's INFERRED return type, over a virtual fixture that proves it catches an unannotated `boolean`/`void`. Before, it read annotations only, so `applyCharacterAN`, `enableWIEntry` and `applyBackground` passed while answering `boolean`/`void`.
- **Callers read the answers**: the curator marks an op `failed` with the host's reason, and fails a rewrite whose entry it could not keep switched off. The memory mirror forgets a stale entry only once it really is switched off (it retries next sync). **Checkpoint `world_info` discarded both toggles' answers** (`effectsApplier.ts applyWorldInfo`). This was found while preparing the live check. A refused toggle is now journaled (`world_info effect could not be applied` / `world_info could not be released`), and the rest of the plan still runs.
- **Found live-first, from ST source: a refused lorebook save resolves.** `saveWorldInfo(name, data, true)` → `_save` posts `/api/worldinfo/edit` and never reads the answer (`world-info.js:4151`). A 403/500 therefore resolves exactly like a kept save, and the jest case built on a rejected save described a failure the real host only produces on a network error. Two changes:
  - Read-back: the toggle reads the server's own copy back (`readServerLorebook`, `/api/worldinfo/get`, `no-cache`). If the server still holds the old flag, the flip is refused and the entry named. A read-back that cannot answer is `confirmed: false`, not a refusal, which is the plan-06 `unsaved`/`unconfirmed` distinction.
  - Cache eviction: `_save` had already put the flipped copy in `worldInfoCache`, so the page's prompts would have followed a flag the disk does not hold. A lost write evicts the book, and the next read goes to the server.
- Mutations: **13 of 13** (`test/findings/mutations/V17-probes-and-typed-results.txt`; M5 was dropped as the ST-refuted cached-flip revert).
- **Live**, no model:
  - Capabilities on the real install (via `#so-copy-diagnostics`): `macros: present — MacrosParser`, `slashCommands: present`, `backgrounds: present`, `vectors: present`, `judge: present`. **Live mutation** (probe reads `getContext().MacrosParser` again): `macros: absent — this build exposes no MacrosParser` (`live-mutation-macros-probe-reads-context.log`). That is the defect as every install saw it.
  - `test/scenarios/live-v17-wi-readback.json`: entering The Quay with a 500 injected on `/api/worldinfo/edit` in the page. One save was refused, the server still holds the entry OFF, and the journal reads `"SO-V17 Lore" was saved, but the server still holds the old flag on "The ferry", so the write was lost`. The page's copy agrees with the server. The next apply writes it for real (server ON, no new refusal). **5/5 twice** (`records/v2.3-replan/V17/wi-readback-run{1,2}.log`). **Live mutation** (lost-write check disabled): FAILS with `the server refused the save (1 request(s) answered 500) and nothing was journaled` (`live-mutation-lost-write-unchecked.log`). The first attempt at this mutation (`&& false`) did not compile, so it was replaced with `> 999`; the non-compiling attempt was not counted. The first draft of the scenario could not exercise the refusal: it faulted a return to The Gate, and the gated set replays the whole path, so nothing needed writing. It was reordered so the fault lands on the first real flip. Cleanup: `so-assets.mts remove --marker SO-V17` → `clean: true`. Run-header diff: build fields only.
- Machine (V15b + V17 tree): typecheck 0, typecheck:test 0, lint 0, jest **165 / 2656**, build 0 (bundle `cb0205520189`), test:release 10/10, debug:typecheck 0, Storybook 31 / 185.
