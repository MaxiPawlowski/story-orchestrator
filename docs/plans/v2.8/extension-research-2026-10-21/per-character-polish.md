# Per-character reply polish (Recast + Rewrite, design second look) — 2026-10-21 harvest
meta: Recast https://github.com/closuretxt/recast-post-processing head `a7ac25a` (unchanged since 2026-09-03), AGPL-3.0 = ideas only ·
Rewrite https://github.com/splitclover/rewrite-extension head `019f5f5` (unmaintained), licence: no LICENSE file = ideas only ·
read: Recast `settings/defaultPresets.js` (all), `index.js` 546-760, 828-1010, 1395-1500; Rewrite `index.js` 30-45, 784-800,
1332-1383, 1454-1471 · skipped UI/CSS/diff viewer (covered before) · prior: `docs/plans/v2.4/extension-research/recast-st-post-processing-for-better-prose.md`,
`docs/plans/v2.8/extension-research-2026-10-14/recast.md`, `docs/plans/v2.4/extension-research/rewrite-extension.md`.
`R/` = Recast source, `W/` = Rewrite source (both under `C:/dev/st-extensions-research/<folder>/source/`), ST = `C:/dev/SillyTavern-MainBranch/public/`.

## What it is / what changed
Neither repo changed. This is a design pass for the owner's idea: Recast-style post-processing of a reply, configured per
roster member. Both prior Recast reviews said "do not adopt" (v2.4 idea 6; 10-14 §Not worth taking). Their reasons were:
in-place rewrite after the boundary, an extra call on the 3090, the send lock, stream hiding, and thought/reply divergence.
SO has moved since. It now has receipt-time reply normalisation (thought-leak repair writes before the boundary,
`src/runtime/replyEffortHost.ts:116-125`), a host writer that keeps swipes in sync (`src/services/stHost/chatMessages.ts:18-30`),
fingerprints that catch eventless rewrites (`src/runtime/fingerprints.ts:2-5`, `chatSave.ts:161-171`), a harness route that
runs off the GPU, and a judge voice check (`src/judge/warden.ts:82-98`). Together these answer most of those reasons. The sketch
below shows how; the rest of this file covers what is left. Verdict: **buildable without breaking an invariant, provided it
writes before the boundary, never during or after it**. The visible text swap after streaming is the real player-facing cost,
and it should be measured before anyone argues about it.

## How it works (what matters for this design)
- **Recast passes** (`R/settings/defaultPresets.js:5-96`). There are four, each its own chat-completion call in order:
  - Grounding (off by default, ctx 3, WI on);
  - Character Behavior Validator (ctx 7, card on; the priority list "example dialogue > personality > description > scene";
    it fixes voice, warmth and stated emotion, and lists banned behaviours);
  - Prose Rhythm (ctx 13, no card; "do not change any dialogue, not a single word", no new or removed actions, keep tense and
    person, vary sentence length, cut filler);
  - Repetition Hammer (off by default, ctx 35; removes words repeated from recent turns).
  Every safety rule lives in the prompt. Code checks only that the result is not empty (empty keeps the previous text,
  `R/index.js:970-975`).
- **Per-character config: none.** The "character" is whatever card `st.characterId` points at (`R/index.js:552-553`). Its card
  fields go in as `<characters>` (`:628-640`). In a group this works by accident: ST sets `this_chid` to the drafted member
  before each `Generate` (ST `scripts/group-chats.js:1054`), and Recast runs inside the `MESSAGE_RECEIVED` await.
- **Group serialisation (new host fact).** Recast awaits the whole pipeline in `MESSAGE_RECEIVED` (`R/index.js:1538-1546`),
  and the group loop awaits `Generate` per member (`group-chats.js:1052-1066`). So member k+1 cannot start until member k is
  polished: N members cost N × (passes × call latency) of dead time, with `is_send_press` held throughout (`R/index.js:849`).
  The upside is that member k+1's prompt sees k's polished text.
- **Continue rewrites the whole message.** Autorun calls `runPipeline(msg.mes, mesId, isIntercepted)` with `prefixText = ""`
  (`R/index.js:828, 1438`), so text an earlier boundary already read gets rewritten again. The prefix split exists only for
  manual runs.
- **Swipe/regenerate** re-run the pipeline and blank the old node (`R/index.js:1514-1529`). Edits are not handled.
  The 5 s re-entry set is a timer hack (`:1435`).
- **Rewrite**:
  - Span-level and manual. The user selects text in one message, the model gets `{{rewrite}}` (the span) plus
    `{{targetmessage}}` (the whole message), and the result is spliced back at raw offsets (`W/index.js:927-936, 1454-1457`).
  - Output budget is `tokens(span) × 1.05 / 0.8 / 1.5` (`:1332-1383`).
  - Prompts: "keeping the same content, general style and length" (`:35-44`).
  - No per-character config, no code guards, no event for its own write.

## For per-character polish
Mechanism, safety, cost, mutation handling and per-character config, side by side:

| | Recast | Rewrite | SO sketch (below) |
|---|---|---|---|
| per-character config | card of the drafted member, read at run time | none | authored `roster[].polish` + story policy + install default |
| when | inside `MESSAGE_RECEIVED`, blocks render and send | manual, any time | receipt to boundary: the reply's pending boundary waits; nothing blocks ST |
| safety vs added facts or player actions | prompt rules only; empty = keep | prompt only | code guards (entities, numbers, quotes, player mentions, length, repeats); any failure keeps the original |
| cost | up to 4 calls per reply, sequential, on the play connection by default | 1 call per span | 1 call per reply, harness route (off the 3090), signal-gated |
| streaming | `MutationObserver` blanks `.mes_text` (banned for us) | streams into the DOM | visible text swaps after render through ST's own `updateMessageBlock` |
| swipes | re-runs; writes `mes` only (lost on swipe-left, 10-14 R4) | current swipe only | each new swipe polished once; `mes` + `swipes[id]` written together |
| continue | rewrites the whole message | n/a | polishes only the continued suffix |
| edits | none | prunes its undo | the player's edit always wins; an edited reply is never polished again |

## Patterns for SO

### P1. Per-character polish, pre-boundary, harness-routed — feature · reply quality · absent · value 4 · effort L
The design sketch follows in seven parts: config, timing, model route, guards, reuse, measurement, and which prior verdicts it
answers.

**(1) Authored config.**
- **Member: `roster[].polish`.** `RosterMember` lives at `src/engine/schema.ts:326-339`. It is a new optional field, not
  `voice`: that name is taken by TTS triage R40 and by `stHost/voiceStart.ts`.
  ```
  polish?: {
    notes?: string;                 // ≤ 400 chars: how they talk (register, sentence habits, what they never say aloud)
    prefer?: string[];              // ≤ 12 × ≤ 40 chars: words and turns of phrase that are theirs
    avoid?: string[];               // ≤ 20 × ≤ 40: words they would not use (anachronisms, the wrong register)
    banned_tics?: string[];         // ≤ 12 × ≤ 40: model tics to remove from their replies ("smirks", "a mix of")
    rhythm?: "clipped" | "plain" | "flowing" | "ornate";
    dialogue?: "keep" | "voice";    // keep = quoted speech is frozen; voice = speech may be re-worded in their voice
    enabled?: boolean;              // default true when the block exists
  }
  ```
- **Story: `polish?`** (Story root, like `house_rules`).
  - `{ mode?: "auto" | "shadow" | "off"; passes?: Array<"voice" | "rhythm" | "repetition">; trigger?: "signals" | "every"; narration?: <same fields as the member block, minus dialogue>; tension_rhythm?: boolean }`.
  - `narration` applies to an `omniscient` narrator member and to any member without a block.
  - v1 does not attribute quotes inside narrator replies. They are frozen.
- **Install default** (`settingsModel.ts`, stored as a delta):
  - `polish: { mode: "auto", trigger: "signals", holdCapMs: 45000, maxPerHour: 40, showChip: true }`;
  - per-chat override in `chat_metadata` (`extras.ui`) like `talk.enabled`;
  - feature registry entry (`src/features/registry.ts`), controls `#so-feature-polish-<field>`.
  Default `auto` follows the owner rule that every built feature is on. `trigger: "signals"` keeps quota bounded; see (3).
- **Validation.**
  - `validate/polish.ts`, game-layer style, so it runs lazily.
  - Caps as listed above. A `prefer`/`avoid` overlap is an error.
  - A `banned_tics` entry that is a roster or codex name is an error (removing a name breaks the entity guard's premise).
  - `notes` naming an entity `knownEntities` does not know is the existing warning `disclosure-names-unknown-entity`.
  - `storyDiff`: polish fields are presentation, so they are always `compatible` (hot-swap).
- **Studio.**
  - The Characters editor gets a "Voice and polish" group: notes textarea, chip lists, rhythm select, dialogue toggle.
  - Edits go through a new typed `mutations.ts` export `setMemberPolish(memberId, patch)`, plus `setStoryPolish(patch)`.
  - `tools.test.ts` then forces a wizard tool for both (or a stated reason).
- **Wizard.**
  - An interview question per member: "how does X talk?".
  - The agent may propose a `setMemberPolish` edit seeded from the card's `mes_example` and personality. It is an ordinary
    edit card (waits in `review`, never provisioning).
  - The card's example dialogue is Recast's top-priority voice signal (`R/settings/defaultPresets.js:25`), so seeding from it
    is the cheap path.
- **Guide.**
  - `<!-- topic: roster-polish -->` under `roster` (`docs/authoring/story-guide.md:97`) and `<!-- topic: story-polish -->`.
  - Compact twins in `src/copilot/guideTopics.ts` (`guideCoverage.test.ts` fails otherwise), then `npm run docs:guide`.
  - Guide copy must say plainly: polish edits wording, never what happens.

**(2) When it runs.** Four options were considered:

| option | how it lands | verdict |
|---|---|---|
| A. Await in `MESSAGE_RECEIVED` (Recast) | delays render for every extension; blocks the group loop | rejected (10-14 host fact; gotcha "never await model work in a `MESSAGE_SENT` handler", same class) |
| B. Rewrite after commit + edit re-read recommit | a real rollback plus a second read per polished reply. `EditReread.seam` handles only the newest row (`spikes/editReread.ts:134`), so in a group, member k polished after k+1 posts is a past-row change. `reconcile` then rolls back from k as an "eventless change" (`chatSave.ts:161-171`) and every later member's boundary replays | rejected as the default; kept only for the manual "polish this reply" action on the newest row |
| C. **Receipt-to-boundary hold** | the reply's pending boundary waits for the polish; the write lands before any consumer (same class as thought-leak repair, plan 69 K6) | **chosen** |
| D. Prompt-side only (voice line in the private block) | no rewrite at all | build first as the zero-cost half; see P2 |

Mechanics of C:
- **Start.**
  - Subscribe to `MESSAGE_RECEIVED` through the replyEffort chain (`replyEffortLive.ts:24-30`), after `repair`, so polish
    reads the leak-repaired text. Listener order is pinned by code, not by `loading_order` (10-14 R5).
  - Start polish only when all of these hold:
    - the type is in `{normal, swipe, regenerate, continue, appendFinal}`;
    - the reply is not `isThoughtOnlyReply` (`emptyReply.ts:27-31`);
    - the row is not the player's and the type is not impersonate (that text is the player's);
    - the speaker resolves to a roster member with polish enabled, or `narration` applies;
    - the open chat is the story's chat.
  - Never `await` in the handler. Return void; the work runs detached under a `RunToken` scoped `{from:id,to:id}`.
- **Hold.**
  - `TurnBridge.enqueueBoundary` (`turnBridge.ts:163-173`) gains one injected seam, `polishSettled(id): Promise<void>`,
    awaited **before** `fireAfterSpeak`. NPC `afterSpeak` replies then see the polished text.
  - The entry stays `ready: false` until it resolves, and `flushPending` already stops at the first unready entry
    (`:180, 194`), so boundary order holds.
  - The hold is capped at `holdCapMs`. Past the cap the polish is abandoned (original kept, journal line).
  - No `isHostGenerating` poll is involved, so the 60 s flush-poll cap (B17, R8) does not apply to our own hold.
- **Group turns.**
  - ST holds `is_group_generating` for the whole round (`group-chats.js:982, 1078`), so `flushPending` already defers every
    boundary to the round's end (`turnBridge.ts:184-187`).
  - Polish of member k therefore runs in parallel with member k+1's generation at zero added wall time. It only has to land
    before the round ends plus the cap.
  - Cost: member k+1's prompt was built from k's unpolished text. The guards keep meaning identical, so the reaction stays
    coherent. A phrase k+1 quotes back may no longer appear verbatim; this is measured in (6).
  - Optional `holdNextMember` (default off): a generate-interceptor hold through the existing seam
    (`spikeSeams.hold`, `wiring/talk.ts:46-49`, capped like `EDIT_HOLD_CAP_MS`, `editReread.ts:9`).
- **Abandon rules.** Any one of these keeps the original and journals it (author-only, `extras.polish` ring):
  - `MESSAGE_SENT` (the player answered what they saw, so changing it afterwards rewrites what they replied to);
  - `CHAT_CHANGED`;
  - any mutation event on that row;
  - a write-time mismatch.
- **Write.**
  - Re-check before writing:
    - the `RunToken`;
    - `chat[id]` is the same row object;
    - `swipe_id` is unchanged;
    - `fingerprintOf(row)` equals the hash the polish started from.
  - Then call a new `stHost/chatMessages.ts` writer, `polishReplyText(id, mes)`. It writes `mes` + `swipes[swipe_id]` and
    leaves `extra.reasoning` untouched; `rewriteReplyText` would clobber a reasoning value repaired in between.
  - Answers a `WriteResult` (`typedResults.test.ts`). Emits **no** `MESSAGE_EDITED`.
  - Re-render goes through ST's `updateMessageBlock`, as `rewriteReplyText` does (`chatMessages.ts:28`). That is a host
    render, not our `.mes_text` write, so the `inlineMount.ts`-only DOM rule holds. `architecture.test.ts` must still be
    checked to see whether it counts `updateMessageBlock` callers.
  - Because the write precedes the boundary, fingerprints capture the polished text, and rollback ≡ replay is untouched:
    every consumer only ever reads the polished text.
- **Streaming.**
  - The player sees the original stream, then a swap a few seconds after render.
  - No stream hiding (`MutationObserver` blanking is banned) and no send lock.
  - Inline chip under the message (level 1 Story, `components/inline/`): `Polishing…` → `Polished` with "show original",
    which opens our own popover rendered from `extras.polish` and never touches the message DOM.
  - Not proposed: switching ST streaming off. That is the owner's host setting; it can only be a measurement arm the owner
    sets.
- **Swipes, regenerate, continue, edits.**
  - Swipe/regenerate: the new swipe is polished once. Swipe-left/back shows the stored, already-polished swipe (the writer
    synced `swipes[id]`, 10-14 R4).
  - A stored-swipe recommit (`turnBridge.ts:263, 284-286`) is not re-polished; it is keyed by row + swipe + hash.
  - Continue: snapshot `mes` at `GENERATION_STARTED` (type `continue`). If the new `mes` starts with it, polish only the
    suffix and splice it (Rewrite's span splice, `W/index.js:1454-1457`); otherwise skip. The old prefix was already read
    by a boundary.
  - Player edit: the normal edit path; never polished again (row marked in the ring by revision).
  - Recast installed with autorun: a `degrades` check, `two-polishers` (reads `extension_settings.Recast.autorun`).
    Two rewriters on one reply means a lost write either way.

**(3) Model route.**
- New pass role `polish`. `PASS_ROLES` is at `src/extraction/passRole.ts:1`; label "Reply polish".
- Default: harness opencode `openai/gpt-6.1-sol`, through the same `roleDefaultFrom`/`AUTHORING_DEFAULT_HARNESS` path as
  authoring (`passProfiles.ts`).
  - An unset non-authoring role normally falls back to the memory model. That is the 3090 Artemis, which is busy streaming
    the next member, so polish there would serialise behind play and double the turn time.
  - **Owner decision needed**: AGENTS.md lists sol for authoring, wizard, Ask and rating only.
  - DeepSeek (pay-per-token) is the fallback only, never the default.
- Latency: unmeasured for a plain text call. Comparable figures:
  - sol Ask median 24-26 s per question (tool loop, `docs/plans/v2.8/31-v27-wrap-backlog.md:39`);
  - DeepSeek flash 3.0 s.
  A one-shot polish of about 300 words should sit well under Ask, but measure it (6).
- Quota:
  - sol has hit usage limits before. The plugin then holds the route for 10 minutes (`33-pose-library-and-avatars.md:340`).
  - Polish must treat a held or outage route as "keep original", silently for the player. The existing check
    `model-role-outage` names it for the author.
  - `maxPerHour` caps spend.
  - `trigger: "signals"` (default) polishes a reply only when code finds a reason:
    - a `banned_tics`/`avoid` hit;
    - this member's repetition readout is non-empty;
    - the warden flagged this member's last reply on voice;
    - the member has `prefer`/`notes` and has not been polished in its last 3 replies.
  - `every` polishes every reply.
- **One call, not N.** Recast's passes become sections of one prompt (`passes` picks the sections), with a strict output
  contract: the rewritten text only, no reasoning tags. Output is stripped by `stripReasoningBlocks`.
  - `maxTokens` = `tokens(input) × 1.2`, rounded up to 64 (Rewrite's budget idea, `W/index.js:1332-1383`; v2.4 rewrite idea 3).
- Thinking: the polish route keeps its own effort default. **Nothing here touches the play reply's thinking budget,
  `extra.reasoning` or the inner voice.**

**(4) Code guards.** Pure module `src/polish/guards.ts`, jest-tested, run on every result. Any failure = original kept +
reason in the ring.
- **Context the pass may see** (held-secret contract):
  - the reply text (already shared transcript);
  - the speaker's polish block;
  - the speaker's card `mes_example`/personality;
  - the speaker's own last 3 replies;
  - the last 2 transcript messages (public);
  - repetition phrases for this speaker.
- **Context it never sees:**
  - memory tiers, private or epistemic blocks, the inner beat;
  - blackboard, codex, lore, authored truth, rumors, promises;
  - other members' polish blocks.
  With nothing private in the input, it cannot leak a held secret; the guards stop invention.
- **Entities:**
  - Proper-noun tokens (not sentence-initial, the `repetition.ts:34` tokenizer) in the output must be ⊆ those in the input.
    Roster/codex names count only if already in the input.
  - Numbers and number words: output ⊆ input.
- **Quotes:**
  - `dialogue: "keep"` (default, and always for `rhythm`/`repetition` sections): the ordered list of quoted spans (`"…"`,
    `“…”`) is byte-identical.
  - `dialogue: "voice"`: same count and order; each quote length ratio 0.6-1.4; content-word overlap ≥ 0.5 per quote; no
    quote gains a name.
- **Player action:**
  - Counts outside quotes of (a) the player's name/aliases, (b) `{{user}}`, (c) second-person subject pronouns + verb must
    be ≤ the input's counts.
  - Applies when `agencyFor(cp).never_narrate_player_action` (`engine/agency.ts:19-35`). Under `player_attempts_only` the
    same counts also cover sentences that resolve the player's attempt (no new success/failure verbs about the player).
  - The prompt carries `PLAYER_ACTION_CLAUSE` and, when on, `PLAYER_ATTEMPTS_CLAUSE` (`agency.ts:36, 39`). Code is the guard.
- **Length:**
  - Output chars within 0.8-1.15 × input (`voice` 0.7-1.2).
  - Paragraph count ±1.
  - `*`/`_` markers balanced and with the same count parity; no new reasoning tags (`REASONING_RESIDUE_TAGS`).
- **Repetition:**
  - Each hot phrase and `banned_tics` hit for this speaker must appear ≤ the input's count.
  - At least one targeted hit must go down, or the polish was pointless; then the original is kept as "no change", and does
    not count as a refusal.
- **No-op:** output equal to the input after whitespace normalisation → no write.
- **Modes:**
  - `auto` (default) writes;
  - `shadow` runs and records the pair in `extras.polish` but never writes (author view diff, measurement arm);
  - `off`.
  A per-reply review card (Recast diff modal) is **not** offered. It would hold the boundary on a human, which is B17/R8 by
  design. Review is the shadow ring plus the manual action.
- **Judge:** an optional use `polishFaithful` (TypeSafe: "does B state anything A does not?"). It is uncalibrated, so it is
  refused (`uncalibrated`) until a Phase A passes. That is by rule, not an off switch; code guards carry v1.

**(5) Reuse.**
- Repetition readout: `mineRepetition` (`src/stagecraft/repetition.ts:65-79`), today author-only over all replies
  (`snapshotBuilder.ts:348`). Run it per speaker over that member's last 6 replies; its `hot` + `constructions` feed the
  prompt's repetition section and the repetition guard. The `repetitionCheck` judge idea (`continuity.ts:74-77`) is a second
  trigger.
- Warden voice: `voiceProfile` (`continuity.ts:86-92`) + `VOICE_QUESTION` (`warden.ts:82-98`, `VOICE_SCORE` 0.75
  `judge/policy.ts:86`).
  - Add `polish.notes` to `voice` state, so the judge checks the authored voice, not only role/drive/feelings.
  - A low voice score on member X's last reply is a polish signal for X's next reply. It is also the measurement's
    automatic distinctness proxy.
- Tension → rhythm: with `tension_rhythm`, the active tension level (`TENSION_LEVELS`, `engine/schema.ts:11`) tightens the
  rhythm hint one step at `tense` and above (`critical`/`peak` → clipped). It is a prompt line only.
- Thought and inner voice:
  - Polish lands before the next draft, so thought carry (`spikes/thoughtCarry.ts:104-107`) and plan 54 read
    `extra.reasoning` next to polished `mes`.
  - The entity, quote and action guards keep every act the thought aimed at. K6b's revision record (69) still applies: carry
    records the revision it read.
  - Never edit `extra.reasoning`.
- Receipt normalisation: the 69 K6 test grows a third leg. Our polish at receipt commits no rollback and no "eventless
  change", and a genuine later rewrite still rolls back.
- Manual action: "Polish this reply" on the newest row (inline chip, Author and Player). It is the only post-commit path.
  It goes through edit re-read (`editReread.ts:131-142`), which already recommits the newest reply.

**(6) Measurement.** Floors are informational, predeclared and never retuned.
- Arms:
  - `shadow` on the adolion-fresh lane gives polished/original pairs for every reply at zero player impact (run on a lane;
    nothing reaches the owner);
  - `auto` gives live latency and abandon rates.
- **Blind pairwise preference.** Pairs in seeded random order. The rater is another model, because the owner never reads
  campaign text.
  - Use DeepSeek, not sol: sol wrote the polish, so it would rate its own output (self-preference).
  - Criteria: reads better, sounds like `speaker`, same events.
  - Floor: polished preferred ≥ 60 %.
- **Distinctness by attribution.** Strip names. A second model guesses the speaker from the member list.
  - Floor: polished accuracy ≥ unpolished + 10 points.
  - The warden voice score delta is the free proxy.
- **Faithfulness.**
  - Guard refusals ≤ 20 % (more = prompt problem).
  - Rater-flagged added facts or player narration among accepted polishes ≤ 2 %.
  - A planted adversarial set (outputs that add a name, a number, a player action, a quote change) must be refused 100 %:
    this is a jest test, not a floor.
- **Cost.**
  - Latency p50 ≤ 12 s, p95 ≤ 30 s from render to write.
  - Abandon rate ≤ 10 %.
  - Calls per hour vs `maxPerHour`.
  - Quota-hold incidents counted.
- **Group continuity.** Count member k+1 replies that quote a k phrase which polish changed.
- **Human:** the owner's own eval on a non-campaign story: swap annoyance (1-5), preference.

**(7) Prior verdicts this design must answer.**

| verdict | source | answer |
|---|---|---|
| "Prose-rewrite passes: extra call on the 3090, rewrites after the boundary, breaks thought/reply agreement" | `extension-research-2026-10-14/recast.md` §Not worth taking | harness route off-GPU (3); write before the boundary (2C); reasoning untouched + guards (5) |
| Do not adopt in-place rewriting, send lock, stream hiding | v2.4 recast idea 6 | no lock, no hiding; the in-place write is the receipt-normalisation class |
| R8 third-party send lock parks our boundary | 61 triage, open B17 | our hold is an explicit seam, not `is_send_press` |
| R4 rewrite without swipe sync | 61 → 69 K6 | `polishReplyText` writes `swipes[id]` |
| R5 listener order | 61 → 69 K6 | polish chained after leak repair in code |
| R6 thought/reply divergence | 61 → 69 K6b | reasoning untouched, revision recorded |
| R3 delayed rewrite fixture | 61 → 69 K8 | the manual post-commit action reuses that fixture's expected outcome |
| R40 per-roster voice (TTS) | 61 SKIP | different feature; field named `polish` to avoid the clash |
| v2.4 recast idea 5 post-reply agency check, flag only | now built as warden `agency` (`warden.ts:62`) | polish's player-action guard is code; the warden stays the judge |
| R24 cue fade after repetition | 61 SKIP | not re-proposed; repetition here is per-reply wording only |

### P2. Voice line in the drafted member's private block — feature · prompt · absent · value 3 · effort S
- What: prevention before cure. Render `polish.notes` plus `prefer`/`avoid` as one line in the drafted member's own private
  block, next to `renderOwnAims` (`src/memory/innerRender.ts:85-92`, voices from `castVoices`, `memory/innerVoice.ts:49-56`):
  "How you speak: … Words that are yours: … Never: …".
- Fit: drafted member only, so no shared-tier leak. One line, so it barely changes the prompt cache prefix (private blocks
  are per member already).
- This is the 10-14 verdict "quality belongs in preset/prompt" taken literally. Build it first; it also feeds the warden
  voice question. Polish (P1) is the backstop for what the prompt did not prevent. Measure P2 alone as an arm.

### P3. Code-detectable tics without a model call — pattern · stagecraft/repetition · partial · value 2 · effort S
- `STOCK_CONSTRUCTIONS` (`repetition.ts:27-32`) is a fixed list. Merge each member's `banned_tics` and the story's
  `narration.banned_tics` into a per-speaker list. That list is the free `signals` trigger and an author-view readout
  ("Kestrel: 'smirks' ×4 in the last 6").
- Do not delete words in code: Recast's hammer needs a model for grammar, and so do we.

## Host facts
- In a group round ST sets `this_chid` to the drafted member before each `Generate` (`group-chats.js:1054`) and holds
  `is_group_generating` for the whole round (`:982, 1078`).
  - An extension awaiting in `MESSAGE_RECEIVED` serialises the round: Recast delays member k+1 by k's whole pipeline.
  - For us: TurnBridge boundaries in a round flush only after it ends (`turnBridge.ts:184-187`). That is a free polish window.
- Recast's group "per-character" behaviour depends on `getContext().characterId` being the drafted member during the
  `MESSAGE_RECEIVED` await. Outside that await (any detached work), it is `undefined` after the round
  (`group-chats.js:1080`). Our polish must resolve the speaker from the row's `name` via the roster, never `characterId`.
- `updateMessageBlock` re-renders one row and is safe while another row streams. No SO bug found.

## Not worth taking
- Four sequential passes per reply: one sectioned call does the same with a quarter of the quota and latency.
- Grounding pass with full WI dry run (`getWorldInfoPrompt(..., true)`, `R/index.js:568`): it hands lore to a rewriter, which
  is exactly where invented facts come from. The polish gets no lore.
- The validator's "fix behaviour that is out of character": changing what a character *does* is authoring, not polish. Our
  guards forbid it; the warden voice note handles behaviour for the next turn.
- Diff modal per reply: it holds the boundary on a human (B17).
- Rewrite's global `oai_settings` swap and emitting no event: anti-patterns already recorded (v2.4 rewrite idea 9).
- `{{recast_*}}` macros: nothing in SO needs the pre-polish text in a prompt.

## Unresolved questions
- Polish role default to sol (subscription) like authoring? AGENTS.md lists sol only for authoring, wizard, Ask and rating.
- `trigger` default `signals` (quota) or `every` (owner's on-by-default rule read strictly)?
- Group: land polish k after k+1 already reacted to the unpolished text (default), or hold the next member (`holdNextMember`,
  adds latency)?
- The visible swap after streaming: acceptable, or measure an arm with ST streaming off (owner sets it)?
- Should the Adolion campaign get `roster[].polish` blocks (campaign repo, pin bump) once P2 is measured?
