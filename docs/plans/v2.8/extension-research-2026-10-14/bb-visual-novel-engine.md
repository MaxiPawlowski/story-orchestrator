# BB Visual Novel Engine — 2026-10-14 harvest

meta: https://github.com/maxkara14/BB-Visual-Novel-Engine · head `b2ad005` (2026-10-10, single squashed commit, v3.2.2) ·
**no licence file** (README/CHANGELOG name none) → ideas only, never code · read: `index.js`, `modules/{constants,structured-output,
requests,connections,generator,social (parts),branch-state,relationship-event-editor,memory-editor,relationship-breakdown,
portrait-provider,portrait-gallery}.js`, README.en, docs/portraits.md · skipped: hud/settings/toasts/css, locales, tests (titles
only), map-context (BB Interactive Map glue) · prior review: none (new repo).

## What it is / what changed
Single-chat RP companion (Russian-first, EN UI). Three pieces: (1) "VN actions": 3 generated player replies, each with
intent/tone/forecast/targets, sent or inserted; the picked option's tone+forecast are injected as a "director's command" for the
next reply. (2) Relationship tracker: the **main reply model** appends a hidden `<bb-social-updates>` block every turn (enum
impacts → configurable deltas, trust and romance separately); stats are **recomputed from the whole chat** on every event;
per-character soft/deep memories, crystallized traits, event history editable with undo. (3) Portraits: OpenAI-images /
chat-image / Gemini / naistera providers, up to 4 references each labelled "identity" or "style", gallery saved via ST
`/api/images/upload`.

## How it works
- Social prompt + current status of every prompt-relevant character in one `setExtensionPrompt('bb_social_injector', …, IN_CHAT, 1)`
  (`modules/social.js:2212-2292`, prompt `modules/constants.js:81-125`). Parsed block is stripped from `mes` and stored per swipe
  in `msg.extra.bb_social_swipes[swipeId]` (`social.js:2600-2678`).
- Derive-from-chat: `recalculateAllStats` (`social.js:2706+`) replays every message's active-swipe updates from per-character
  bases → swipes, deletes, edits need no rollback logic. Hooked to every chat event (`index.js:338-396`).
- Repeat-beat guard: an update with same char + same deltas and a similar `reason` within 12 messages is dropped
  (`social.js:3019-3033`; similarity = exact/substring/shared-prefix/LCS tokens/Jaccard 0.55, `social.js:886-936`); prompt rules
  7-9 ask for "new relational beat only" (`constants.js:107-109`).
- Event editor: overrides live beside the parsed source, keyed `messageIdx|swipeId|updateIndex` + a signature of the source
  update; edit/disable/undo (20-deep) refuse with `EDITOR_STALE` if revision, active swipe or signature moved
  (`modules/relationship-event-editor.js:15-88`). Memory/trait text edits same shape (`memory-editor.js:56-79`).
- Score breakdown: origin (base or snapshot) + base adjustment + clamp correction + net chat change = total, computed from the
  same inputs as the recompute, with a note that 0 net ≠ no events (`relationship-breakdown.js:20-63`).
- Branch lineage: metadata revisions keyed by chat length + anchor swipe; on a branch (new `integrity`) select the last revision
  `at <= chatLength` (`branch-state.js:143-205`; comment `:143` "ST copies current metadata but truncates messages").
- Option gen: one op token checked against chat identity, chat length, message object, swipe id and text before persisting
  (`generator.js:189-212`); invalidated on every chat event; budgeted repair passes (missing options, then a **code-measured tone
  diversity** retry, `generator.js:214-237`, `565-657`); options stored per swipe (`generator.js:250-257`).
- Choice context bound to the sent user message by prefix match, then injected as `[DIRECTOR'S STRICT COMMAND] … FORCED
  OUTCOME … must actually happen` (`generator.js:1155-1222`).
- Profile calls: `ConnectionManagerRequestService.sendRequest` with `extractData:false` on CC profiles so `finish_reason` survives
  (`connections.js:68-85`); reasoning-only replies get their own error (`requests.js:79-90`).
- Portrait refs: `Reference N: use artistic style only; do not copy identity` vs `preserve character appearance and identity`
  (`portrait-provider.js:89-91`).

## Patterns for SO

### P1. Fresh-beat guard on relationship steps — pattern · extraction/life · absent · value 3 · effort S
What: drop (hold) a relationship-axis step whose cause repeats the previous step on the same axis within N boundaries.
Theirs: `social.js:3019-3033`, `886-936`, prompt `constants.js:107-109`. Ours: `step_rule` caps the size of one read
(`src/extraction/ratingGuard.ts:50-66`, compiled in `src/engine/validate/life.ts:181`) but nothing stops a lingering mood from
ratcheting the axis +1 every read; rating grounding only refuses level skips (`ratingGuard.ts:39-47`).
Fit: pure, in `extraction/ratingGuard.ts` next to `applyStepRule`; held deltas already have a shape (`HeldRatingDelta`) and a
journal path. Need the previous accepted evidence per key — from boundary logs/`blackboardMeta[key].evidence`
(`src/components/drawer/tabs/BlackboardTab.tsx:31`), so rollback ≡ replay holds. Use our vectors/Jaccard dedup bands, not
their token heuristics. Floor: a fixture of a 6-turn lingering-comfort transcript must move the axis at most once.

### P2. Per-axis "why is it this number" breakdown — feature · author view · partial · value 3 · effort S–M
What: for each `rel_*` axis show start + each committed step (boundary, evidence, reader) = current, noting clamp losses
and that a net 0 can hide events. Theirs: `relationship-breakdown.js:20-63`. Ours: `CharacterLifePanel` prints value and
range only (`src/components/drawer/CharacterLifePanel.tsx:22-27`); Blackboard shows only the latest source/evidence
(`BlackboardTab.tsx:29-32`). Author-only (numbers stay private, plan 51 / v2.7 37 decision 2). Derive from engine boundary
history at read time (a read-model on the snapshot, no new persisted state). Pairs with plan 51's reveal history.

### P3. Author override of one past extracted delta, with undo — pattern · author tooling · absent · value 2 · effort M
What: overrides stored beside the source event keyed (message, swipe, index) + source signature, refused as stale if the
source moved; recompute applies them. Theirs: `relationship-event-editor.js:15-88`. Ours: an applied delta can only be undone
by rollback (swipe/edit) or a manual `setQuality`; memory has decisions (`commitDecision`, `src/runtime/memoryQueue.ts`) but
qualities do not. Fit: would have to be an engine write replayed by `engine/replay.ts`, enqueued at a boundary; signature
check = our RunOwnership idea applied to a cached event. Only worth it once P2 exists to show what to override.

### P4. Code-measured diversity retry for "What could I do?" — pattern · player · partial (feature present) · value 2 · effort S
Ours is already safer: `src/runtime/suggestions.ts:8-14` ("Suggest, never decide", "Never state how it turns out", projection
only), fill-only with box/chat refusal (`:59-64`). What differs: they reject a set whose tones collapse to one family and pay
one budgeted retry (`generator.js:230-237`, `613-657`), and their op token also checks swipe id + message text
(`generator.js:189-201`) where our `fillRefusal` checks chat + box only. Take: a lexical sameness check (first-verb/opening
overlap) → one retry within `SUGGESTION_MAX_TOKENS` budget; add active swipe/last message id to the ask-time key so a swipe
mid-ask drops stale ideas. Do **not** take tone/forecast labels: a forecast is an outcome statement.

### P5. Style-only reference slot for portraits — feature · image · absent · value 2 · effort M
Theirs: each reference is labelled style vs identity in the prompt (`portrait-provider.js:89-91`). Ours: every reference is an
identity reference ("Preserve face, hair, outfit … and art style", `src/sprites/builder/recipes.ts:27-36`,
`src/image/castScene.ts:48-50`). A story-level style reference (one image every avatar/sprite borrows look from, never face)
would help cast consistency for wizard-built cards (plan 33). ComfyUI/Qwen edit cost: a second image input per render; check
VRAM on the 3090 before planning.

### P6. Choice-bound steering = anti-pattern for us — anti-pattern · agency
The picked option's forecast is injected as "FORCED OUTCOME … must actually happen" (`generator.js:1178-1194`). Breaks
`PLAYER_ATTEMPTS_CLAUSE` ("decide its outcome from the world — it may fail", `src/engine/agency.ts:39`) and the agency rule that
a player's attempt is not a guaranteed result. Options also write the player's inner monologue — acceptable only because the
player sends them; our suggestions keep lines short and outcome-free. Keep as is.

## Host facts
- CM `sendRequest` with `json_schema` and `extractData:true` on CC runs `JSON.parse(extractJsonFromData(…))`
  (`SillyTavern-MainBranch/public/scripts/custom-request.js:489-491`); `extractJsonFromData` returns `JSON.stringify(result ?? {})`
  (`public/script.js:6364`), so unparsable output silently becomes `{}`, not an error. SO passes no `json_schema` (grep: none in
  `src/`), so no bug; if a role ever adopts schemas, use `extractData:false` as `stHost/modelReply.ts:177` already does.
- ST branch = parent `chat_metadata` copied whole + messages truncated + fresh `integrity`. SO already handles it
  (`src/runtime/chatIdentity.ts:73-79`, `BranchNotice`). Their extra trick: key metadata revisions by chat length **and the anchor
  message's swipe id**, so a branch at a swiped message picks the matching state (`branch-state.js:145`, `183-186`). Worth a test
  idea: adopt a branch cut at a reply that had been swiped; assert state matches that swipe.
- `/api/images/upload {image, format, ch_name, filename}` returns a served path; they keep paths, not data URLs, in metadata
  (`portrait-gallery.js:41-53`).
- `ConnectionManagerRequestService.validateProfile(profile).selected === 'openai'` tells CC from TC before choosing `extractData`
  (`connections.js:67`).

## Not worth taking
- In-band hidden block on the play reply: costs Artemis output/thinking budget each turn, parse-and-strip `mes`; our off-path extraction is better.
- One shared IN_CHAT depth-1 injection holding every character's trust/romance/memories: leaks across members (breaks per-member private blocks) and moves every turn (cache, `lorePlacement.ts` rationale).
- Russian/English regex for "conflicted attraction" deltas (`social.js:2385-2412`): language-bound heuristic; we are English-only and authored axes.
- Tier labels from fixed score bands / model-written `user_label`: plan 51 already chose authored labels with `follows_feeling` + `hold` hysteresis (`51-relationship-labels.md:72-91`).
- Trait crystallization (5 same-polarity deep memories → permanent trait, user click, anti-refusal prompt chain, `generator.js:1042-1126`): model-invented permanent canon; conflicts with authored life; anti-refusal prompting not wanted.
- Persona-scoped snapshot export/import of relationships: plan 45 New Game+ covers carry with a public projection.
- Platonic flag per character: our axes are authored; no romance axis = no romance.
