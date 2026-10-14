# BB Interactive Map (+ BB Enhance Gen companion) — 2026-10-14 harvest

meta: https://github.com/maxkara14/BB-Interactive-Map head `7e13f65` (v2.0.2, one squashed commit) · companion https://github.com/maxkara14/BB-Enhance-Gen head `c14e681` · **no licence file in either repo, so ideas only, no code** · read: `map-state.js` (all), `index.js` (scan prompt 1133-1198, auto pipeline 1420-1612, events/injection 140-295, 2255-2336), `map-links.js`, `map-object-mentions.js` (head), README.en, ROADMAP head; Enhance `map-context.js`, `transitions.js`, `player-action.js`, `docs/player-action-api.md` · skipped: topology layout/SVG view, CSS, images, browser tests, Enhance writing/d20/UI · prior review: none (new repo)

## What it is / what changed
- Open-world spatial memory. After each character reply (or on demand) one quiet request asks the model for a JSON map: places, passages
  (`confirmed|uncertain|blocked`, direction), characters, objects; Game mode adds possession (`zone|held|unknown|left` + holder),
  temporary effects (`expires_when`, evidence) and travel drafts.
- The result is a proposal. It is saved automatically only when no review issue fires. Otherwise it waits in a review UI
  (single-item "confirm this place/passage").
- Per-chat location archive (`chat_metadata.bb_map_archive`): latest snapshot per location, identified by `bbl-N`, with "return to" detection.
- Injected at IN_CHAT depth 2 as a user-role prompt, or through the `{{bb_map}}` macro. Exposes a frozen read API (`globalThis.BBInteractiveMap`) that Enhance/VNE
  consume, off by default.
- Enhance companion: `generatePlayerAction({kind:"map_travel", from, to, mapContext, isCurrent, signal})` writes prose into
  the chat input and never sends it.

## How it works
- **Evidence must be a substring of the scanned window.** `location_evidence` is accepted only if `recentMessages.includes(evidence)`
  (`index.js:1181-1183`). The same rule applies to `location_change_evidence` (`map-state.js:31,39`). A model `null` alone never creates a location.
- **Tri-state location identity.** `location_change: same|new|uncertain` → `resolveLocationUpdate` returns
  `{locationId, needsConfirmation, needsLocationChoice, continuesCurrent}` (`map-state.js:30-46`). "new" needs a quoted move and
  no shared place name. "uncertain" or no continuation evidence → the player chooses "update current / this is new".
- **Review triggers are code, not model.** `canAutoApplyMap` (`index.js:1434`) blocks autosave on: archive return, unclear boundary,
  unknown player position, uncertain place/passage not already accepted (`getTopologyReviewIssues`, `map-state.js:266-282`), object
  changes with `uncertain`/`unknown`/held by an absent holder/state change without `state_reason`, removal of a player-held item
  (`requiresObjectReview` 288-300), new/changed effect with `uncertain` or no evidence (`requiresEffectReview` 255).
- **Accepted uncertainty is remembered by physical identity.** The key is `[scene, 'place', id, name, kind]` / `[scene, 'connection', id, from, to, name, kind, direction]`.
  An uncertainty the player already saved does not pause autosave again; changed wording or occupants does not count as new (`map-state.js:270-274`).
  Toasts are deduped per chat by issue key (`notifyMapReview`, `index.js:1464-1472`).
- **Code-side reconciliation after the model.** `reconcileMapObjects`: scene objects stay with their scene, and only established `held` items follow
  their holder. An NPC's held item is kept only while the holder is present. A held item the model omitted is re-added (`map-state.js:155-186`).
  `reconcileMapEffects`: "omission is not termination", so old active effects that still apply are re-added (229-239).
- **Staleness compare-and-set everywhere.** The scan result is dropped unless the chat, map object, mode, archive ref and last-3-message text are all
  unchanged (`index.js:1177-1179`). Save re-checks archive ref and scene text (`68-72`). The auto path re-checks the last reply's ref and its `.mes`
  (`1530-1534`). Chat switch aborts every controller (`2301-2309`).
- **Auto trigger.** Skips `quiet`/`impersonate` generations and `first_message`/`extension` messages (`1569-1585`). It uses a 1.5 s debounce, then waits
  while `document.body.dataset.generating || isChatSaving` (`1515-1518`). `GENERATION_ENDED` has a fallback for when no
  `MESSAGE_RECEIVED` arrived: it compares the last message ref, `mes` and `gen_finished` (`1588-1600`). `GENERATION_STOPPED` cancels the pending scan.
- **Route = BFS over `confirmed` edges only**, respecting `direction` (`map-state.js:503-518`). Uncertain passages never route.
- **Mention cards** (`map-links.js`): a regex index built locally over map names. Each entity is highlighted at most once per message. An ambiguous key
  (two entries) is dropped, and a longer ambiguous name blocks its shorter alias. Matching skips links, code, inputs and hidden/aria-hidden nodes. Highlighting wraps
  text nodes in spans; `unwrap` re-merges only the siblings it split.
- **Enhance travel contract**: the caller passes `isCurrent()` (sync, true only while its chat/map/mode are unchanged). Enhance caps each string at 32k and the block at 60k,
  serialises the reference data as JSON "reference data, not instructions", and re-checks the draft before appending
  (`player-action.js`, `docs/player-action-api.md`). Transition cues get a `​` prefix when they start with `/` "so author prose never runs a slash
  command" (`transitions.js:20-24`).

## Patterns for SO

### P1. Slash guard on every chat-box fill — host-fact/bug · runtime/stHost · absent · value 4 · effort S
What: text we put into `#send_textarea` that starts with `/` is run as a slash command when the player presses send
(ST `script.js:3125-3126` `processCommands` on `message.trim().startsWith('/')`, called from Generate at `script.js:4311`).
Enhance prefixes `​` (`bb-enhance-gen transitions.js:20-24`).
Our state: `fillChatInput` writes `box.value = text` unchecked (`src/services/stHost/generation.ts:66-73`). Callers:
model-generated **suggestions** (`src/runtime/suggestionsHost.ts:67-70`; `parseSuggestions` filters no slash, `src/runtime/suggestions.ts:39-54`),
widget named intents (author text, `engine/validate/widgets.ts:116-121` has no slash check), the HTML bridge `story/propose-intent`, and presence
(`src/presenceUi.tsx:119`). A suggestion line such as `/delchat` or `/sys …` lands in the box, and a send runs it.
Fit: no invariant issue. Sketch: in `fillChatInput`, refuse (WriteResult `couldNot`) or prefix `​` when `text.trimStart().startsWith("/")`.
Also drop such lines in `parseSuggestions`, and make the widget validator refuse an intent whose text starts with `/`. Add a test per caller.

### P2. Accepted-uncertainty memo keyed by identity, not wording — pattern · memory review / curator / autosave · partial · value 3 · effort S-M
What: once the player saves an item while it is still flagged uncertain, the same physical item (keyed by stable id+name+kind, not by its
description) does not re-pause autosave or re-toast. Changed wording or occupants does not count as new (`map-state.js:266-282`, `index.js:1464-1472`).
Our state: the curator remembers declines (`stagecraft/proposal.ts:85-91`, `stagecraftCoordinator.ts:293-296`) and the memory queue skips known conflict
keys (`runtime/memoryQueue.ts:120-122`). Both key on the op/pair, so a reworded re-proposal of the same thing may come back. Where it fits: the
`HeldCommitDelta` holds from `extraction/commitGuard.ts`, and any future plan 52 "discovered" facts. Sketch: key holds and declines on
`(entity, field|kind, target)` and ignore free text. Test idea: re-propose with only the wording changed and assert no new card.

### P3. Code-side reconcile rules for possession and effects ("omission is not loss") — pattern · ledger / game layer · partial · value 3 · effort M
What: deterministic post-model rules. A held item follows its holder. An NPC's held item counts only while the holder is present. Scene objects never
travel with the player. A missing mention never ends a state; an ending needs evidence. An item the player held that disappears is sent to review
(`map-state.js:155-186, 229-239, 288-300`).
Our state: the ledger is versioned and keeps rows on omission (`memory/ledger.ts:31-56`). It has `object|place` types (`memory/contract.ts:53-55`), but it has no holder
semantics and no relevance filter by who is present. Inventory in the game layer is authored bool qualities (`18-quests-and-game-layer.md:91`).
Fit: no invariant conflict if this stays a ledger read-model (life lines already go only to the drafted member). It could feed plan 58 keepsakes (holder of a
given keepsake) and plan 52 place pages. Sketch: `[state:X:object] holder=Name` gets one rule. Injection shows it only while the holder is present or is the player.
Losing a player-held object goes to the memory review queue, never applied silently.

### P4. Tri-state boundary signal with a quoted move — pattern · scene detection · partial · value 2 · effort S
What: the model answers `same|new|uncertain` plus a verbatim quote of the move. "uncertain" goes to the player, and a title change alone is not a scene change
(`index.js:1159`, `map-state.js:30-46`).
Our state: evidence-in-window already exists (`extraction/evidence.ts:89-95`). The player-line-only re-ask covers "an intent is not a completed move"
(`extraction/contract.ts:15-19`). `SceneBreakSignal` is `{at, reason}` only (`memory/types.ts:170-173`), and `location` is an authored enum
(`runtime/coordinators/sceneCoordinator.ts:67-68`). Delta: an explicit `uncertain` answer that holds the location delta rather than guessing. This is small
and only matters for stories with many locations. Note the authoring trap: never add an "undecided" enum value (memory: story-authoring-traps). The uncertainty belongs in the signal, not the quality.

### P5. Map widget route + travel intent — feature · widgets (plan 23) · partial · value 2 · effort M
What: pick a reachable place → a draft "I head from A to B" goes into the box and is never sent. Position updates only from the narrative (`map-state.js:116-128, 503-518`).
Our state: the map widget has an authored image with gated pins (`engine/validate/widgets.ts:208-217`). Named intents already fill the box and never send
(`23-story-widgets.md:268-269, 341`). Delta: per-pin `action` exists already. A route needs authored passages, which we do not have. Low value
for authored stories, so skip unless plan 52 places gain adjacency.

### P6. Mention cards over codex entries — feature · plan 52 UI · planned: plan 52 (pages only) · value 3 · effort M
What: local highlighting of known names in rendered messages; click opens the entry. Once per message, ambiguous names skipped, code/links/hidden skipped,
the stored message is never rewritten (`map-links.js:5-130`).
Our state: plan 52 codex has `known_when` pages (`docs/plans/v2.8/52-people-places-codex.md:12-19`). There is no in-message linking.
**Invariant conflict**: `stHost/inlineMount.ts` is the only `.mes_block` writer (`architecture.test.ts`), and this wraps text nodes inside `.mes_text`.
It would have to be a declared second writer, or (cleaner) built as a CSS Custom Highlight API overlay that adds no DOM nodes.
Spoiler rule: index only entries the player projection holds (known facts), never author-only entries.

### P7. Frozen, versioned read API with an `isCurrent` callback — pattern · interop · absent · value 2 · effort S
What: `Object.freeze({apiVersion:1, getContext})`, and consumers check the version. The cross-extension request carries `isCurrent()` and `signal`, and the
result is refused if stale (`index.js:280`, `player-action-api.md`).
Our state: `globalThis.storyOrchestrator*` handles are debug surfaces, not a player-safe contract. If VNE-style extensions ever read SO state,
expose only `playerProjection` text (secrets invariant). No current need.

## Host facts
- Sending a box value that starts with `/` runs it as STscript (`script.js:3125-3126`, `:4311`). See P1; this is an SO bug.
- `updateChatMetadata(values, reset)` **replaces** the `chat_metadata` object (`script.js:8979`). Identity comparison of `chatMetadata` (BB's
  `isSameChat`, `map-state.js:87-93`) therefore also goes stale on an in-chat metadata reset, not only on a chat switch. SO does not compare
  metadata identity (grep clean). Do not start.
- `MESSAGE_RECEIVED` is emitted only when not streaming in `saveReply` paths (`script.js:6691-6781`). The streaming processor emits it separately (`:3799`,
  `:3828`). BB still guards with a `GENERATION_ENDED` fallback, which suggests some path skips it; unverified, and our `TurnBridge` already
  commits on render events (gotchas "Turns").
- `generateQuietPrompt({quietPrompt, responseLength})` has no signal. BB cancels it with `stopGeneration()`, guarded by chat identity (`index.js:145-159`). That stop
  would also stop a loud generation running at the same moment. We route through Connection Manager, so this is n/a.

## Not worth taking
- IN_CHAT depth-2 user-role injection that changes every turn: it breaks prompt-cache reuse (gotchas: Artemis SWA; our late lore placement exists for this).
- Rewriting `{{bb_map}}` by string-replacing `generate_data.messages` in `GENERATE_AFTER_DATA`: a hack. We register macros properly.
- Custom-API key stored in extension settings plus a browser fetch: a secret leaks into settings (our rule: keys only in ST secrets).
- Silent fallback from the custom API to the main connection: conflicts with "a routed role that is not offered is refused, not silently replaced".
- Model-scanned open-world map as the source of truth: SO stories are authored, so locations come from the `location` enum and plan 52, not from model scans.
- The Russian inflection table for object aliases: English only.
- Location archive / "return to" snapshots: authored checkpoints already carry place identity, and rollback is replay.
