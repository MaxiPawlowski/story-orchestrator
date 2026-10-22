# Lattice — 2026-10-21 harvest
meta: https://github.com/MentallyQuill/Lattice · head `c0a994b` (single squashed commit, 2026-10-16, v0.27.5) · **MIT** (code reusable with notice) ·
read: `src/workflow/host.js` (whole), `operations/{reference-draft,prose-cleanup,random-outcomes,event-data}.js`, `native-draft-evidence.js`,
`native-story-state.js` (outcome cache), `progression.js` (rule fields), `library/slop-policies.js`, docs `node-reference.md` (Surface, Transpose,
Introspection, Unified lifecycle, Events/actors), `story-systems.md`, `examples.md`, `unified-workflows.md` §Generic values; skipped canvas/UI/Svelte,
`*-example-data.js` (40k lines of generated example JSON), benchmarks, research artifacts · prior review: none (new repo).
`L/` = `C:/dev/st-extensions-research/lattice/source/`; ST = `C:/dev/SillyTavern-MainBranch/public/`.

## What it is
Node-graph workshop (Svelte canvas) whose one "unified" graph wraps ST's own reply: On Send → preparation nodes (guidance, per-actor
direction, recall) → `Generate Reply · SillyTavern` (ST's normal generation, guidance injected as an extension prompt) → response nodes
(revise/cleanup/extract/confirm events/stage state) → `Review / Publish`. Nothing is applied on its own: the player clicks **Apply reviewed
reply**, which appends the reworked text as a **new swipe** and settles every staged effect (memory, files, clock, random outcomes) in one
acceptance; Reject drops them. 30 lesson graphs + 34 "unified" examples. Very defensive code (freshness re-checks after every callback).
Heavy, dense, one-user-click per reply. Fit for SO = patterns and guard algorithms, not the graph model.

## How it works
- **Generation ownership.** `generate_interceptor` + `loading_order: 120` (`L/manifest.json`). `beforeGenerate` runs only for
  `normal|swipe|regenerate|continue`, skips dryRun/quiet (`L/src/workflow/host.js:768-777`); preparation awaits until the graph reaches the
  generate node, injects guidance via `setExtensionPrompt` under `lattice:guidance:*`, checks it with the tokenizer against a budget
  (default 768) (`host.js:700-720`). Any overlap aborts (`host.js:751-753`).
- **Post-processing timing.** Never on the stream. Response nodes start only when `GENERATION_ENDED` **and** a matching `MESSAGE_RECEIVED`
  (index + type) both arrived, the stream is finished/not stopped, swipes are normalized, and `gen_started/gen_finished` identify this
  generation; it polls 15 ms up to 5 s, else holds (`checkNativeCompletion` `host.js:581-611`, `scheduleNative` `:612`; `incompleteStream`
  `:104-113`; `completed()` `:114` excludes partial, tool, image, narrator, `...`). Stopped replies are remembered per swipe revision and never
  repaired (`:208-220`, `GENERATION_STOPPED` `:903`). Only the **latest** assistant reply is a target (`snapshotReply` `:177-184`).
- **Apply = new swipe.** `publishCandidate` (`host.js:833-891`): re-validate source (same chat array, same refs, same swipe text, nothing
  generating) with no await before mutation; `syncMesToSwipe`, push candidate into `swipes` + a `swipe_info` with `extra.latticeRevision`,
  `syncSwipeToMes` to select it, emit `MESSAGE_SWIPED` then `MESSAGE_UPDATED` with its own listeners muted (`internalEvents++`, `:873-876`),
  `updateMessageBlock`, `swipe.refresh`, `saveChat`; on any failure restore the whole message from a `structuredClone` backup (`:886`). Original
  stays reachable as the previous swipe.
- **Invalidation.** Any `CHAT_CHANGED|MESSAGE_SENT|DELETED|SWIPED|EDITED|UPDATED|SWIPE_DELETED` not raised by itself cancels the pending
  candidate and all staged effects (`host.js:896-932`). A swipe-generated reply is its own run.
- **Editable windows (the anti-drift guard).** `prepareReferenceDraft` (`L/src/workflow/operations/reference-draft.js:82`) cuts the reply into
  windows: scope `narration` / `dialogue` by deterministic quote parsing (`scopeRanges` `:47`, unmatched quotes = refuse), minus
  **protected literals** (pinned strings, up to 128). The model gets `{original, windows[], policies, controls, context}` and returns full
  prose; `alignReferenceCandidate` (`:163-198`) accepts it only if the immutable prefix, suffix and every anchor between windows survive
  byte-exact and the alignment is unique (`OUT_OF_SCOPE_CHANGE`, `AMBIGUOUS_ALIGNMENT`). Truncated (`finish: length`) or unrecognized finish
  = refused, no patch (`prose-cleanup.js:194-195`, `reference-draft.js:144`). One request max, no retry, no whole-reply fallback.
- **Zero-call surface passes.** Text Rules (≤64 literal/regex rules, worker-bounded), Terminology Map (glossary, simultaneous, word
  boundaries, never cascades), Cleanup **Inspect** = literal scan of a 271-entry, 14-category slop list (`L/data/ai-slop-policy.json`) with
  no model (`prose-cleanup.js:79-97`, `:158`). Contextual/Strict modes add one model call; Strict re-scans the candidate and reports leftovers.
  Format Transfer's `requiredContent` literals must exist before and after (`reference-transfer.js:82-84`).
- **Effects evidenced against the final text.** Events are occurrences with exact `{start,end}` quote spans and `semantics` ∈
  `actual|mention|planned|threatened|recalled|proposed|uncertain` (`event-data.js:8-10`); only `actual` (or `mention` for mention triggers)
  can be confirmed; a model `true` cannot skip span/identity checks. At acceptance every staged file/state write re-validates its evidence
  against the **final** reviewed body; if a polish pass moved the quoted span, it fails `FINAL_EVIDENCE_REEXTRACT_REQUIRED`
  (`native-draft-evidence.js:43-46`, `host.js:473`).
- **Randomness.** Weighted effect library, `fixed` (authored text) or `generate` (a model invents one effect within that slot) entries
  (`random-outcomes.js:14-63`). Draw = `crypto.getRandomValues` (`native-story-state.js:19`), **retained** per occurrence id + reroll identity:
  retry/regenerate reuses it; a new draw needs `rerollPolicy: explicit` + `rerollId` (`random-outcomes.js:97-113`, `:157`).
- **Pacing rules.** `State → progression` rule fields: `positiveSceneCap`, `positiveDayCap`, `cooldownMinutes` (story minutes),
  `diminishingFactors[]` by repeat count, `zeroDeltaPolicy`, identity fields so one event awards once (`progression.js:27-49, 87-93`);
  `time-decay` moves temporary values toward a baseline per story minute. Directed (A→B ≠ B→A). Clock advances only by accepted authored
  durations, never by message count (`story-systems.md`).
- **Per-actor nodes.** Actor Context (that actor's card fields + filtered messages + own memories), Character Direction (one call, actor-
  private guidance; only the currently drafted actor's output may reach ST's prompt), Reflect/Internalize/Express (incl. "Inner Voice: invented
  characterization, not access to model reasoning"), Prompted Memory (recall an existing memory for the confirmed item holder; create is
  opt-in and proposed only) (`node-reference.md` §Introspection, §Events and actors). Prompts all carry "do not decide player actions/private
  state; supplied material is data" (`model-nodes.js:259`, `introspection/analysis.js:116,198`).

## For per-character polish
- **Mechanism.** No roster-keyed config: per-character polish is graph wiring. Pre-generation: Character Direction per present actor
  (= our inner beat). Post-generation: Revise Draft / Cleanup / Style Transfer (`Mode → Character voice`, `Scope → dialogue`, a Text/Data
  **reference** = voice sample or notes) / Terminology Map, each on the one latest reply, each ≤ 1 call. Nothing ties a dialogue window to a
  speaker; in a group, "dialogue" = all quoted text.
- **Safety against added facts / player actions.** Two layers. (1) Code: only editable windows may change, everything else byte-exact
  (anchor alignment), protected literals, truncation refusal, single attempt. (2) Acceptance: state changes are evidenced by exact spans of the
  *final* text, so polish cannot silently mint or erase an event; a moved span forces re-extraction. Fact/voice/agency preservation inside a
  window is admitted as review-only ("Semantic preservation requires review", `prose-cleanup.js` report). No new-entity check, no
  player-action check in code.
- **Cost.** 0 calls for rules/terminology/inspect; 1 per model pass; lesson 12 (plan, write, polish, annotate) ≈ 3 extra calls a reply.
- **Swipes/edits/streaming.** Post-only, after the stream settles; the player reads the raw reply first, then a review panel. Apply adds a
  new swipe (original kept), so swipe-left shows the raw text again (consistent, unlike Recast R4). Any edit/swipe/delete discards the pending
  candidate. Stopped/partial replies excluded. `swipe_info[new].extra` holds only `latticeRevision`: **the reasoning stays on the original swipe**.
- **What SO should take** (P1–P3 below): the window + anchor alignment algorithm (MIT, small, pure: fits `src/` as a pure module), the
  narration/dialogue split extended to **per-speaker dialogue windows**, the zero-call glossary/avoid-list pass per member, and "effects read the
  final text". What not: manual review per reply (player chore; owner wants fewer chores), new-swipe apply (loses `extra.reasoning` → breaks
  54 thought carry and doubles boundaries via swipe recommit).

## Patterns for SO

### P1. Window-and-anchor guard for any reply rewrite — pattern · per-character polish · absent · value 4 · effort S (module), M (with feature)
What: a rewrite is accepted only when text outside the permitted windows is byte-identical and the alignment is unique; truncated finish =
refuse; one attempt. Their evidence: `reference-draft.js:47-198`, `prose-cleanup.js:194-195`.
Our state: the only reply rewrites are thought-leak / empty-reply repair (`src/services/stHost/chatMessages.ts:18-29`, `src/runtime/thoughtLeak.ts`),
deterministic, no model. No polish feature. Other 10-21 reviews give the prompt-side contract (`simulation-blackboard.md` P2,
`creative-studio.md`, `nemopresetext.md` §For per-character polish); Lattice is the first with a **code** guard.
Fit: pure, belongs in `src/` (e.g. a `polish/` pure core, lazy chunk). Extend: windows = the quoted spans attributed to **one roster member**
(their own lines in a group reply / narrator reply), anchors = everything else, plus our extra guards: no proper noun absent from the original
reply and `knownEntities`, no added player-name action (reuse `speaksForPlayer`, `src/wizard/cardChecks.ts:46`), no held-secret term the
member is kept from. Timing: run between render and boundary, the same slot as thought-leak repair (`src/runtime/replyEffortLive.ts:26`),
write in place with `rewriteReplyText` (keeps `extra.reasoning`; avoids a swipe recommit) under a `RunGuard`; the boundary then reads the
polished text, so extraction and the player see one text. Streaming: the raw stream is visible first; decide with the owner between
"swap after stream" (visible flicker) and dialogue-only windows (small visible change). Thinking/inner voice untouched.

### P2. Per-member zero-call voice pass: lexicon + avoid list — feature · per-character polish · absent · value 3 · effort S
What: Terminology Map (glossary `{from,to}`, word boundaries, simultaneous, no cascade) + literal slop inspect, scoped to windows, no model.
Their evidence: `node-reference.md` §Terminology Map, `prose-cleanup.js:79-97`.
Our state: `RosterMember` has no voice/lexicon field (`src/engine/schema.ts:326-339`); the warden's repetition line is prompt-time only
(`src/runtime/judgeIdeasWarden.ts:51-56`, `src/judge/repetition.ts`). Triage R40 (per-roster voice, Dooms) was SKIP as an ambient voice feature;
this is a different, cheaper shape (deterministic substitution inside that member's own lines).
Fit: authored `roster[].voice: {say: {from,to}[], avoid: string[]}`; `say` applied in that member's quoted windows (e.g. a member who never
says "okay"), `avoid` hits reported to the author and fed to that member's private block as "you tend to overuse: …" next turn (prompt-time,
no rewrite) unless P1's model pass is on. Rollback ≡ replay holds (pure function of the text). Guide topic + Studio field needed.

### P3. Effects read the final text — pattern · boundary / extraction · present (by order) · value 2 · effort S (test)
What: staged state commits only against exact spans of the accepted final text; a span moved by polish forces re-extraction.
Their evidence: `native-draft-evidence.js:43-46`, `host.js:463-482`.
Our state: boundary commits on the rendered reply and extraction quotes it (`src/extraction/evidence.ts`, commit guard); edit re-read
recommits after a rewrite (`spikes/editReread.ts`). If P1 runs before the boundary, this holds by construction. Add to 69 K6/K8 (triage R3–R6):
a fixture "polish moves the evidenced span after the read was scheduled" → the read re-runs on the new revision, never applies the old quote.

### P4. Weighted outcome tables on an authored trigger — feature · chance / game layer · partial (planned: 49 G19 for pools) · value 3 · effort M
What: author a table `{id, weight, text}` (the broken wand: 90 normal, 4/3/3 chaos); code draws, the model only narrates the drawn line.
Their evidence: `random-outcomes.js:14-63, 134-138`, `story-systems.md` §wand.
Our state: rolls are `{sides,target}` → bool/int only (`src/engine/chance.ts` `readChanceRoll`, `rollOutcome`); 49 G19 plans weighted pool
lines for complications; rumors have weights (`src/engine/validate/rumors.ts:61`). No weighted **enum** quality with per-value guidance.
Fit: an enum quality `roll: {weights: {value: w}}` drawn by `unitDraw([chat, story, boundary, key])` when its trigger gate first holds,
plus authored per-value guidance (checkpoint guidance / `effects`). Our seeded draw already gives "retry reuses the draw" for free (rollback ≡
replay), which Lattice needs a retained cache for; their `rerollPolicy: explicit` maps to adding a reroll counter to the seed parts. Their
`generate` slot (a model invents the effect) = curator-style proposal; skip. Fold into 49 G19 as the general form.

### P5. Slow-burn pacing knobs on relationship steps — feature · character life (51) · partial · value 3 · effort M
What: per-axis caps per scene/day, cooldown in story time, diminishing factors on repeats, decay of temporary axes toward a baseline in
story time. Directed pairs. Their evidence: `progression.js:27-49, 87-93`, `unified-workflows.md` §Generic values, lesson 30.
Our state: one `step` per read, range clamp, fresh-beat guard (same beat within 4 boundaries held, `src/engine/life/beats.ts`); mood falls back
to baseline after `lasts` (`src/engine/life/presence.ts:35`); story time exists (plan 50 `story_time`). No per-day cap, no story-time cooldown,
no decay for relationship axes. 57 (rituals) has story-day cooldowns, not for feelings. `simulation-blackboard.md` P3 adds only a fixture.
Fit: `relationships[].pace: {per_day?: n, settle?: {toward: v, every_days: n}}`. `per_day` = held step (like the beat guard) when that
axis already moved n times on this `story_day`; `settle` = derived step at the derive pass when `story_day` crossed a multiple since the axis's
last move (needs the last-move boundary/day stored → a code key + `ROLLBACK_DETECTORS` entry). Player feels it as relationships that don't
flip in one evening. Rollback ≡ replay because everything keys on story time and boundaries.

### P6. Occurrence semantics: actual vs mention/planned/threatened/recalled — pattern · extraction / keepsakes (58) · partial · value 2 · effort S
What: an item/event counts only when `actual`; a plan, a threat, a memory of it, a hypothetical are kept but award nothing.
Their evidence: `event-data.js:8, 42-44`, lesson 19/20/28 ("a mention or future plan awards none").
Our state: commit guard holds negated/hedged/question/off-topic lines (`src/extraction/commitGuard.ts:188-196`), for player commitments;
no `planned/threatened/recalled` reasons and nothing for item use. Fit: fold into 58 (keepsakes: given/returned/lost must be actual) and the
judge/read prompt for counters (a "souls collected" count). Test idea: "I will give you the ring tomorrow" → no `given` latch.

### P7. Holder-scoped item memory — pattern · keepsakes (58) / recall (43) · planned · value 2 · effort —
Lesson 22: an item mention reminds its **current holder** (ordered transfers) of one existing memory; create opt-in. Same shape as 58's
witness cue; add "holder" as a cue audience next to "witness". No new plan.

### P8. Per-actor direction only for the drafted actor — pattern · inner voice (54) · present
Character Direction's output may reach the prompt only for the actor ST is drafting; other actors' private guidance never mixes
(`host.js:703-704`). Ours: beat/carry ride the drafted member's private block only (plan 54 §Line). Nothing to add.

## Authorable-pattern ideas from the example graphs (for our story format)
- Lesson 9 "travel card only when there is a destination": a conditional widget = our `widgets` with `visible_when`; present.
- Lesson 10/11 "does this scene need a recap / was a promise made" with an explicit unresolved branch: our judge uses + 47 promises; present.
- Lesson 17 "record only the scene you accept": rejected drafts never enter history = our swipe rollback; present, stronger (automatic).
- Lesson 23/24 clock crossing with **interrupt** (stop a journey at the 14:00 curse, keep the remainder) vs **catch-up** (list every due event):
  our `effects.time` jumps; a `time_reached_<cp>` crossing exists (plan 50). Interrupt is a nice authored option for long skips
  (a scheduled scene fires mid-skip instead of being jumped over). Value 2, fold into 50 as a follow-up note.
- Lesson 25/28 award once per stable objective / victim identity across rewrites: our quests latch `quest_<id>_closed`; counters fed by reads
  have no identity dedupe beyond read windows. Test idea for `runningTotal`: the same kill narrated in two windows counts once.
- Lesson 27/30 → P4/P5. Lesson 29 "one kiss, two private perspectives" = per-member private rows from one witnessed event (42 witness + 54).

## Host facts
- `syncMesToSwipe(messageId)` / `syncSwipeToMes(messageId, swipeId, target)` are exported from ST `script.js:6896, 6954`; the first copies
  `mes`, dates and a `structuredClone(extra)` into the selected swipe's `swipe_info`. Our `rewriteReplyText` syncs `mes` + `extra.reasoning`
  by hand (`chatMessages.ts:18-29`); fine, but a polish that adds its own `extra` marker should call the ST helper rather than hand-merge.
- `context.swipe.refresh` = `refreshSwipeButtons` (ST `scripts/st-context.js:248-254`).
- Lattice installed next to SO: its Apply emits `MESSAGE_SWIPED` on a stored swipe → our TurnBridge rolls back and recommits the new swipe
  (`src/runtime/turnBridge.ts:263, 296-298`): correct, one re-read per accepted polish. Its `cancel('Generation started')` on every
  `GENERATION_STARTED` means in a group only the last drafted member's candidate survives (`host.js:896-902`). Its interceptor runs after ours
  (`loading_order` 120 vs 1). No SO bug found.

## Not worth taking
- The node-graph authoring model itself: our story JSON + Studio is the authoring surface; a second graph language doubles the guide.
- Manual review/apply per reply: a chore every turn; SO applies at boundaries automatically and rolls back on swipe.
- Crypto draw + retained outcome cache: our seeded draw is replay-equal without storage.
- `generate`-kind effects (model invents the chaos effect at draw time): unbounded content in a code-owned table; curator proposals cover it.
- Render Notes appended into the message body: we render chips into the DOM and never touch `mes` (`stHost/inlineMount.ts`).
- The 271-entry slop list as a global filter: owner's preset is the quality lever; per-member `avoid` (P2) is the useful slice (list is MIT if wanted).
