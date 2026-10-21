# Plan 04 — Reactive character cues

**Status: written 2026-10-21 from the v2.9 triage (`01-triage-sol.md`); revised 2026-10-21 after sol's review
(`10-review-sol.md`); not built; owner decisions pending.** Implementation tier **D**; acceptance **D** (selection,
once/cooldown, occurrence consumption, rollback ≡ replay, story update as jest properties; no-model scenario) + **RP**
(realized reactions on Artemis, thinking and inner voice on) + **CL** (independent rating of realized reactions and
player-action narration). Overview rules: `docs/plans/v2.8/00-overview.md` §Rules, `docs/plans/v2.9/00-overview.md` §Rules.

## What it is

- Characters notice specific things and conversations deepen. One authored **cue bank** per roster member:
  - **reactions**: an authored event gate became true ("the player returned the stolen ledger") → the member may remark on it
    for a short window;
  - **remarks**: a state gate holds ("in the market while the guild is angry") → an optional line the member may use;
  - **topics** (Façade hot-buttons): the player raises a subject *directly to that member*; each consumed raise steps the
    member to the next authored tier (≤ 3), so asking again digs deeper;
  - **norms** (Versu): a story-level social rule with an authored `broken_when` event; the members who witnessed it (authored)
    get a reaction cue.
- A cue is a **private suggestion** in the drafted member's private block ("If it fits, you may react to: …"), voiced by the
  model in character. Never a posted message, never the player's act, never mandatory speech.
- Two lanes (Hades): `must` (story-critical; re-offered until an authored `landed_when` holds, at most `max_offers` times) and
  `may` (spent once offered). Selection = lane, then explicit `priority`, then source rank, then declaration order. No
  predicate counting.
- All private cue delivery — this plan's sources and v2.9 07's echo occurrences — goes through **one typed offer channel**
  (§Offer API). It arbitrates one offer per recipient per generation and writes a **receipt** only when the offer's final
  filtered text reached that generation's private block and the generation rendered a real reply by that member, bound to
  the reply's revision. **Offered** (receipt) and **realized** (authored `landed_when` latch, or a rater for measurement) are
  separate records. "Injected" never means "said".

## History and evidence

- Triage rows (`01-triage-sol.md`): **N02 PLAN v2.9 04** (per-member reactive remark bank, Ruskin/Mímir); **N03 FOLD** (important
  vs optional cues, once-only, "record offered and realized separately"); **N04 FOLD** (topic tiers, "progress requires an
  eligible addressed occurrence, not repeated keywords anywhere in the transcript"); **N07 FOLD** (norm violations noticed,
  "authored observed-event gate plus reaction cue; no inferred moral score", references v2.8 56); **N01 FOLD guide** (storylet
  "broad default + specific override" framing, no second story graph). N05 (reestablish) goes to v2.8 22, not here; N08 (mood
  delivery) to v2.9 02; N16 (role-cast set-pieces) V3.0, "reopen if v2.9 04's simpler reactive cues prove insufficient".
- Plan spec: `01-triage-sol.md` §Proposed v2.9 plan set → 04 (in/out, precedent, dependencies, floors, owner decisions).
- Challenge 9 (`01-triage-sol.md` §Challenges): "Most predicates wins" is unsafe; `any`/`not` make raw counts misleading; use
  explicit priority and stable tie-breaking; report overlapping rules to the author.
- Review `10-review-sol.md` §04 (three P1) and §Cross-plan findings (offer API for 07, new-only activation, held-secret content
  filter, settings through the feature resolver, extras reconciliation on story update, model routing). Applied in this
  revision; see §Review 2026-10-21 (sol).
- Research: `docs/plans/v2.8/extension-research-2026-10-21/niches.md` §1 (QBN/salience framing), §2 (Ruskin rule database,
  Mímir "once only is a fact, do not mutate the ruleset"), §3 (Hades must/may lanes, played-once memory), §4A (Façade three-tier
  mix-ins), §4B (reestablish, routed to v2.8 22), §5b (Versu norms spawn a reaction practice); Top-10 rows 4 and 5.
- **Where sol and the research disagree, this plan follows sol:**
  - research §2 ranks by predicate count with a seeded tie draw; sol challenge 9 rejects counts → explicit `priority`,
    source rank and declaration-order ties, deterministic and explainable in Author view;
  - research §3 lets a `must` cue "repeat until a read confirms it landed"; sol's Out list forbids "unlimited retries until a
    line is spoken" → bounded `max_offers`;
  - research §4A steps a topic on "key match on the player's in-character line, or an extraction bool"; sol requires an
    addressed occurrence and makes extraction-based progression an owner decision → key match only on an in-character player
    line directly addressed to that member, consumed once, in slice B; extraction is optional slice F and must produce
    addressed evidence.

## Current state in code

Verified on `6861d989` (checkout `C:/dev/so-v29-plans`).

- **No cue bank.** `RosterMember` (`src/engine/schema.ts:326-339`) has role, drive, life fields, `factions`, `commitments`; no
  remarks, topics or norms. `grep -rn '"cue_\|"topic_\|"norm_' src/engine` → nothing.
- **Nearest speaking mechanism is checkpoint-bound and verbatim.** `effects.npc_replies[]` (`NpcReplyEffect`,
  `src/engine/schema.ts:166-177`) posts a line or instruction on `onEnter`/`afterSpeak`/`sceneBreak` triggers
  (`src/runtime/effectsApplier.ts:461-479`); firing is counted per checkpoint/trigger/member with `maxTriggers` and an 8-message
  spacing (`src/runtime/npcReplyRewind.ts:19`, `:28-34`); rollback re-arms fires by message id (`:47-62`). No ranking, no
  member-wide bank, no cue form. Codex `returns` (`src/engine/codexSchema.ts:43`) are page-only.
- **Transitions already use explicit priority + first match**: `selectFiring` takes the first passing gate of a
  priority-sorted list (`src/engine/transitions.ts:5-7`). Same rule fits cues.
- **As-built precedent for the whole shape: v2.8 55 NPC commitments.** Authored on `roster[].commitments`
  (`src/engine/lifeSchema.ts:121-147`, caps `COMMITMENTS_MAX` 6, text ≤160), gate-latched code ints `commit_<member>_<id>_<state>`
  = boundary in the latch pass (`src/engine/life/commitments.ts:66-73`; `LATCH_WRITERS`,
  `src/engine/validate/gameLayerImpl.ts:43`), private lines in `privateLifeLines` (`src/engine/life/lines.ts:49-64`, via
  `commitmentLines`), rollback detector `commitments` (`src/engine/rollbackDetectors.ts:77-81`), discovery units for the read
  scope, registry entry `npc-commitments` (`src/features/lifeFeatures.ts:39-44`), guide topic `commitments`.
- **Boundary order** `BOUNDARY_STEPS = drain, counters, derive, quests, latch, select, entry, latch-after-entry`
  (`src/engine/engine.ts:99`).
  - The latch pass builds one copied view `{boundary, values, visitedPath, activeCheckpointId}` (`src/engine/engine.ts:510-517`,
    view at `:516`): **no host input**, so a latch writer cannot see offer evidence.
  - The only injected code-write seam is `EngineHost.derive(view: DerivedQualityView)` (`src/engine/engine.ts:30-32`, applied
    `:498`); `DerivedQualityView` carries boundary, checkpoint, `lastMessageId`, values, versions (`:12-20`). The runtime
    closure `deriveQualities` (`src/runtime/stretchTurns.ts:14-19`) already passes chat rows to `deriveLife(story, view, chat)`
    (`src/engine/life/derive.ts:49`), which returns `[]` when `story.life` is absent (`:50-51`).
- **Life compilation is closed over a field list.** `LIFE_MEMBER_FIELDS = relationships, mood, agenda, schedule, commitments`
  (`src/engine/validate/life.ts:43`); `readMember` returns `null` for a member with none of them (`:206-208`); `life` is built
  only when some member or a clock exists (`:322`). Game-layer detection has its own list `LIFE_FIELDS` (same five,
  `src/engine/validate/gameLayer.ts:25`) inside `usesGameLayer` (`:29-37`). A cue-only, topic-only or norm-only story is
  today neither detected nor compiled.
- **Private delivery seam**: `MemoryInjector.addPrivateSource` + `sourcedLines` filters every source through
  `withoutSecretLines` with the member's names (`src/runtime/memoryInjector.ts:136-143`); promises, rumors, carry and narrator
  lines use it (`src/runtime/managerWiring.ts:81`, `:96`, `:147`, `:152`). **Staging is gated**: private blocks are staged
  only when `capable || voiced || story.life || story.factions?.length || story.carry_from || hasNarratedSheet(story)`
  (`memoryInjector.ts:192`), `onMemberDrafted` returns when nothing is staged (`:274`) and reuses the staged block unless a
  beat or narrator applies (`:289`), so a source registered without a staging reason, or computed before the draft, does
  not reach the drafted member (same finding as v2.9 02 S2).
- **Held-secret content filter**: `keptFrom(text, secrets, member)` (`src/memory/heldSecrets.ts:51-55`) refuses text that
  restates a secret kept from the named audience; with `member = null` no name is allowed, i.e. the resting audience.
- **Revision-bound "applied"**: warden notes record `noteAppliedTo {messageId, revision}` (`appliedToLast`,
  `src/runtime/noteRevision.ts:7-10`) and re-arm on swipe/edit (`rearmNotesFor`, `:4-5`; used
  `src/runtime/coordinators/stagecraftCoordinator.ts:512`).
- **Message-keyed rollback of own slices**: `rollbackPromises`/`rollbackWitness`/`rollbackRumors` in quarantine
  (`src/runtime/rollback.ts:113-115`).
- **Addressing is a mention heuristic**: `addressedAmong(roster, ids, text)` (`src/talk/rules.ts:95-102`) is
  `narrowByMention` (`:60-65`): a name or alias word anywhere in a clause, minus exclusion phrases (`:46-53`). "I saw Mara at
  the docks" counts as addressing Mara. Used by the away notice at prompt time (`src/runtime/awayNotice.ts:20`). `isOocText`
  (`src/engine/ooc.ts:4`); whole-term matcher `src/utils/termPresent.ts`.
- **Story update**: roster member edits are always `compatible` (`diffRoster`, `src/engine/storyDiff.ts:315-322`); the update
  path prunes engine state and retained history only (`pruneEngineHistory`/`pruneEngineState`,
  `src/runtime/storyUpdate.ts:176-177`; `src/engine/storyDiff.ts:498`), with no hook for extras slices.
- **Feature policy**: per-story feature controls live in `FEATURE_POLICY_FIELDS` (`src/engine/featurePolicy.ts:15-40`); chat
  overrides in `extras.overrides` feed the effective features (`src/runtime/snapshotBuilder.ts:440`,
  `src/runtime/settingsControl.ts:45`, per review). No `cues` row today.
- **Lexical "touched" is used only to cool a reminder**, never as state: promise `touches` (`src/memory/promises/impl.ts:276-279`).
- **Seeded draws** `unitDraw` (`src/engine/chance.ts:33`) — not needed; selection is deterministic.
- **v2.8 56 social permissions not built** (`grep -rln "perm_\|permissions" src/engine` → nothing). Its member line ("Honour it
  unless…") is the same delivery; norms here must not overlap its grant/revoke semantics.

## Options

| | Design | Cost | Risk |
|---|---|---|---|
| **A. Authored cue bank, explicit priority, shared offer channel** | `roster[].cues[]`, `roster[].topics[]`, story `norms[]`; offer-evidence-derived code keys; one typed channel (receipts) also used by 07 | M | authors must write cues; realized rate depends on Artemis honouring a private suggestion |
| **B. A ranked by predicate count (research §2)** | same, salience = gate leaf count, seeded ties | M | challenge 9: `any`/`not` inflate counts; ties random, hard to explain |
| **C. Extend `npc_replies`** | add gates/cooldowns to checkpoint replies | S | posts verbatim messages (speaks for the cast), checkpoint-bound, no topics; more posting effects |
| **D. Model-chosen cues** | judge or director picks a reaction from the transcript | M–L | invented reactions, model cost per turn, keyword-only disclosure risk |
| **E. Nothing** | | 0 | cast keeps ignoring specifics |

## Recommendation

**A**, in slices. Lazy game-layer chunk (`engine/life/cues.ts`, `engine/life/offers.ts` (pure arbitration),
`engine/validate/cues.ts`), runtime door `runtime/cuePort.ts` + lazy kit, same layering as commitments. Feature on by
default once built.

## Offer API (consumed by v2.9 07)

One channel, two halves: pure types and arbitration in `src/engine/life/offers.ts` (no STAPI), runtime door
`src/runtime/cuePort.ts` (injected deps, no coordinator imports). 07 registers an echo provider; it never injects on its own.

### Types

```ts
type OfferSource =
  | { kind: "cue"; member: string; cueId: string }                                  // remark / reaction (slice A)
  | { kind: "norm"; normId: string; member: string }                                // slice C
  | { kind: "topic"; member: string; topicId: string; tier: number; occurrence: RaiseOccurrence } // slice B
  | { kind: "echo"; echoId: string; occurrenceId: string };                         // v2.9 07

interface RaiseOccurrence { chatId: string; messageId: number; revision: string; member: string; topicId: string }

interface OfferCandidate {
  key: string;                 // stable: kind + ids (+ occurrence for topic/echo); receipts address it
  defRev: string;              // definition identity hash from the provider (story-update reconciliation)
  source: OfferSource;
  recipient: string;           // roster id; a provider resolves "narrator" to the omniscient member's id
  lane: "must" | "may";        // echo: "may" in v1
  priority: number;            // authored or default (below)
  order: number;               // declaration index, or due rank for echoes
  text: string;                // authored cue text, before copy and filter
  copy: "react" | "must" | "topic" | "echo";   // selects the CUE_COPY header; echo header text owned by 07
  window: { from: number; to: number | null }; // boundaries, both inclusive
  spend: "once" | { max: number } | { cooldown: number };
  gap: boolean;                // counts toward / respects CUE_MEMBER_GAP
}

interface OfferReceipt {
  key: string; defRev: string; source: OfferSource; recipient: string;
  chatId: string; messageId: number; revision: string;   // the rendered reply, revision-bound
  boundary: number;            // engine boundary at render (the boundary that reply commits)
  textHash: string;            // hash of the exact filtered line that reached the block
}

interface OfferLapse { key: string; recipient: string; at: number; reason: "window-ended" | "held-secret" | "unknown-entity" | "recipient-away" | "recipient-disabled" }

type OfferProvider = (ctx: OfferContext) => OfferCandidate[];
interface OfferContext {
  story: NormalizedStory; values: Readonly<Record<string, PrimitiveValue>>; boundary: number;
  recipient: string; latestPlayer: { messageId: number; revision: string; text: string } | null;
  receipts: readonly OfferReceipt[];   // frozen ledger, read-only
}
```

- Port surface: `cuePort.addOfferProvider(id: "cues" | "echoes", provider)`, `cuePort.receipts(): readonly OfferReceipt[]`,
  `cuePort.lapses(): readonly OfferLapse[]` (author-only), `cuePort.onLapse(id, (lapse) => void)` so a provider can record
  its own terminal state. Providers are pure over `OfferContext`; they own source-specific eligibility (gates, reaction
  windows, landed state, echo status) and return candidates.
- 07's lifecycle maps onto this: **scheduled / due / cancelled / expired** are echo-slice states (07); **landed-to-channel**
  = 07's provider starts returning the candidate (window `from = landedAt`, `to = landedAt + hold - 1`); **offered** = an
  `OfferReceipt` with `source.kind === "echo"`; **lapsed** = `OfferLapse` `window-ended` with no receipt; **realized** is
  never written by code for echoes (rater only, 07's narrator floor).

### Channel eligibility (applied to every candidate, after the provider's own)

1. recipient is the drafted member of this generation, enabled in the group and not away (`isAway`,
   `src/engine/life/presence.ts`);
2. `window.from ≤ boundary ≤ window.to` (`to: null` = open);
3. not spent: receipts with the same `key` **and** `defRev` — `once`: none; `{max}`: fewer than `max`; `{cooldown}`: last
   receipt ≥ `cooldown` boundaries ago; a receipt whose `revision` is no longer the live revision of its message does not
   count;
4. gap: when `gap` is true and lane is `may`, no other `gap` receipt for this recipient in the last `CUE_MEMBER_GAP` (2)
   boundaries;
5. **content filter on the final line**: render `CUE_COPY[copy]` + text, then drop the candidate if the line is refused by
   `keptFrom` for this recipient's names (`heldSecrets.ts:51`). For an omniscient narrator recipient (reply shared with the
   player) the line must also pass the **resting audience** (`keptFrom(line, secrets, null)`) and name only `knownEntities`
   (`src/engine/codex.ts:97`). The filter runs at every generation, not at schedule time, so a secret introduced after an
   echo landed still holds it. A refused candidate is recorded as an `OfferLapse` reason only when its window ends unoffered.

### Arbitration (pure `arbitrate(candidates, receipts, boundary)`)

- One offer per recipient per generation (`OFFERS_PER_GENERATION` 1).
- Order: lane (`must` before `may`) → `priority` desc → source rank (`topic` > `echo` > `norm` > `cue`) → `order` asc →
  `key` (string compare). First wins. No randomness.
- Default priorities: remark/reaction 0, norm 15, echo 20, topic raise 30. Authors may set any `priority`.
- **Pinned competition (must cue vs raised topic vs echo)**: a `must` cue wins (lane first); the raised topic is not
  consumed (no receipt) and stays eligible for a later reply by that member to the same player line; the echo keeps waiting
  inside its window. With no `must` cue: topic raise (30) beats echo (20) beats norm (15) beats remark (0). An echo that
  loses every generation until `window.to` lapses (`window-ended`), and 07 records it.
- Static tie warning `cue-tie` when two authored candidates of one member share lane, priority and kind ("declaration order
  decides").

### Receipts (rendered-revision binding)

- On draft (`onMemberDrafted`), the port arbitrates for the drafted member and stages the winner as a **pending offer**
  `{generationKey, key, recipient, textHash}`; the drafted-member block is rebuilt synchronously so the line is in this
  generation's block (staging predicate gains `hasOfferSources(story)` at `memoryInjector.ts:192`; rebuild coordinated with
  v2.9 02 S2's synchronous drafted-member rebuild).
- **A receipt is written only when** (a) the applied private block for that generation contains the exact filtered line
  (read back from ST's injected blocks, `readInjectedPromptBlocks`, as `getAppliedEpistemicBlock` does), and (b) that
  generation rendered a real reply by the recipient (not empty or thought-only, `src/runtime/emptyReply.ts`). Receipt =
  `{…, messageId, revision}` of that reply (`appliedToLast` shape, `noteRevision.ts:7-10`).
- Swipe or edit of the reply changes its revision → the receipt stops counting and is dropped by the rearm pass, so the
  regenerated reply re-selects the same candidate (replay). Delete → `rollbackCues(state, messageId)` in quarantine drops
  receipts, pending offers and consumed occurrences at or after the message.
- State slice `extras.cues = {receipts: OfferReceipt[], lapses: OfferLapse[], consumed: string[] (occurrence keys)}`, cap 300
  receipts, eviction only below the engine history floor; `sanitizeCues` like `sanitizeRumors`.

### Offer evidence into the engine (no engine import of extras)

- `EngineHost` gains a read-only `offers?(): OfferEvidence` (`{receipts, consumed}`, frozen copy). The engine reads it **once
  per boundary at derive entry** and passes it in `DerivedQualityView.offers`. Offer-dependent code keys (must `landed`,
  topic counters) are written in **derive**, the existing injected code-write seam (`engine.ts:32`, `:498`) — the latch view
  (`:516`) is not widened.
- **Eligibility of a same-boundary offer**: a receipt counts at boundary *b* only if its `messageId < view.lastMessageId`
  (an earlier reply than the one committing *b*) and its revision is live. An offer rendered by the reply that commits *b*
  counts from *b+1*. Deterministic whatever the order of receipt write and boundary commit.
- Tests: never-offered, filtered-out (held secret), thought-only, invalidated (swiped/edited) and same-boundary offers each
  leave `landed` and topic counters unchanged.

### Slice A — remarks and reactions (core)

- **Schema** (`lifeSchema.ts`): `roster[].cues[]: {id, kind: "remark" | "reaction", when: GateNode, cue: string (≤160),
  lane?: "must" | "may" (default may), priority?: int (default 0), window?: int (reaction only, default 3 boundaries),
  repeat?: {cooldown: int} (default: once), landed_when?: GateNode (must only, required), max_offers?: int (must only, default 3, ≤ 5)}`.
  Caps `CUES_MAX` 12 per member.
- **State.**
  - Reaction edge: latch `cue_<member>_<id>_at` = first boundary `when` holds (latching, in `LATCH_WRITERS`; no offer input).
    Window `at .. at+window-1`. A remark is level-triggered while `when` holds.
  - Must landed: `cue_<member>_<id>_landed` = boundary, written in **derive** when `landed_when` holds (values at derive entry)
    and `view.offers` holds ≥ 1 counting receipt for that cue's key and current `defRev`; latching once written.
  - Rollback detector `cues` over prefix `cue_` (SC1 registry, planted control in `rollbackDetectors.guard.test.ts`).
- **Provider** `cues`: for the drafted member, eligible remarks/reactions/norms as `OfferCandidate`s (`spend`: may `once` or
  `{cooldown}`, must `{max: max_offers}` and dropped once landed; `gap: true`).
- **Delivery** via the channel only. Copy in one place (`CUE_COPY`): react "If it fits, you may react to: <cue>. React as
  yourself; the player's actions and feelings are theirs."; must "…you mean to bring this up: <cue>…".
- **Activation for cue-only stories**: add `cues` and `topics` to `LIFE_MEMBER_FIELDS` (`validate/life.ts:43`) and
  `LIFE_FIELDS` (`gameLayer.ts:25`); `readMember` (`:206`) reads them and the normalized member copies them; `life` is built
  when any member has cues or topics or the story has norms (`:322`); `usesGameLayer` also checks `json.norms`. Then
  `deriveLife` (`derive.ts:50`) and the staging predicate run. Fixture: a story whose only game content is one member's
  `cues` (no drive, motive, life, codex, quests, checks, inner beat; epistemic capability off) delivers and receipts a cue.
- **Validation**: `landed_when` required on must; `when` of a reaction must contain an event key (same rule as v2.8 55
  `broken_when`: no time-only gate, no `== false`, no start value, no top-level `not`); `cue-tie` (above); `cue-narrates-player`
  warning on cue text that states a player act or feeling (reuse `speaksForPlayer`, `src/wizard/cardChecks.ts:49`, if its
  patterns fit cue length; else a list next to `PLAYER_REF`, `src/engine/agency.ts`). Held secrets are filtered at render,
  not at validation (members may know what the player does not).
- **Author view**: Character life row per member: eligible candidates in arbitration order (all sources, incl. echoes),
  winner, "tied with", receipts/landed counts, lapses; inline level 3 chip "cue offered: <key>". Nothing on player surfaces.
- **Studio** under Characters (beside commitments); typed mutations `setCue`/`removeCue`; wizard tools `set_cue`/`remove_cue`
  (`tools.test.ts` coverage); guide topic `cues` (+ N01 framing paragraph: broad default cue at priority 0, specific overrides
  above it; arc variables belong in the gate); registry feature `reactive-cues` (area characters, audience author, on by
  default).
- **Settings** (per v2.9 09): `FEATURE_POLICY_FIELDS.cues = { enabled: toggle }` (`featurePolicy.ts:15`) with its
  `FEATURE_CONTROLS` row; install master default on; precedence install master → authored `features.cues` → chat override in
  `extras.overrides` (never `extras.ui`). Off = the `cues` provider returns nothing; the channel still serves 07's provider,
  which has its own feature switch. 09's state map and parity fixtures gain the `cues` row when this lands.

### Slice B — topic tiers

- **Schema**: `roster[].topics[]: {id, keys: string[] (whole terms, ≤ 8), tiers: [{cue, when?: GateNode}] (1–3), priority?
  (default 30)}`. Caps `TOPICS_MAX` 6.
- **Direct address** (new pure `directlyAddressed(roster, presentIds, text)` in `src/talk/rules.ts`, conservative; not
  `addressedAmong`): a member is addressed only by a vocative — their card name or a distinct alias as a whole term at the
  start of a clause followed by `,` `!` `?` `:`, or after a comma closing the clause ("…, Mara?") — outside quoted speech and
  not inside the existing exclusion phrases (`rules.ts:46-53`). Exactly one member addressed; zero or several → abstain.
  Third-person mentions ("I saw Mara at the docks"), quoted mentions and names in narration abstain.
- **Raise occurrence** `RaiseOccurrence {chatId, messageId, revision, member, topicId}` exists when: the line is the latest
  player line and in character (`!isOocText`), `directlyAddressed` returns exactly this member, and one `keys` term is
  present (`termPresent`). Keys anywhere else in the transcript never count.
- **Consumed exactly once**: the topic candidate carries its occurrence (`key` = occurrence key, `spend: "once"`,
  `gap: false`); its receipt **is** the consumed marker (`extras.cues.consumed`). Draft preview and boundary apply both read
  the same marker: the preview offers tier `count + 1` only for an unconsumed occurrence; derive sets
  `topic_<member>_<id>` = number of counting consumed occurrences for that member/topic (≤ 1 per player message, capped at
  the tier count; a tier whose `when` fails holds the count at the previous tier). Pure function of evidence, so rollback ≡
  replay.
- Cases (jest, C3): multi-member round (second member's reply to the same line gets no topic step unless directly
  addressed); regenerate/swipe (receipt revision dies → same tier offered again, count unchanged); continue (same message,
  occurrence consumed → no second step); edit of the player line (new revision → new occurrence, old one dead); OOC; quoted
  mention; third-person mention; must cue winning the generation (occurrence unconsumed, still eligible).
- Rollback detector `cue-topics` (prefix `topic_`). Validation: a topic with ≥ 2 tiers and no gated tier gets the info row
  `topic-ungated-depth`; keys must not be a cast member's name or alias. Studio, `set_topic`, guide topic `topics`.

### Slice C — norms

- **Schema**: story `norms[]: {id, label (author-only), broken_when: GateNode (event rule as slice A), noticed_by: roster id[],
  cue, priority? (default 15), checkpoints?: id[]}`. `NORMS_MAX` 8.
- Compiled into a reaction latch (`cue_norm_<id>_<member>_at`) for each `noticed_by` member present (not away) when it
  latched; offered through the `cues` provider as `source.kind = "norm"`. Witnessing is authored; runtime "who heard" waits
  for v2.8 42 consumers. A norm-only story activates the life layer (slice A activation) with a feature-only fixture.
- No score, no standing change: a norm only produces a cue. A story wanting consequences gates on `cue_norm_*` keys or uses
  v2.8 53 faction moves / v2.8 56 revocation, which keep their own evidence rules.
- Studio under State and rules, `set_norm`, guide topic `norms`.

### Slice D — must-lane accounting and author journal

- Journal rows: `cue offered`, `cue landed`, `cue not landed after N offers`, `offer lapsed (<reason>)` (author-only).
  Repair stays silent (no check row: an unlanded cue is not a fault).
- Live no-model scenario + RP row (see Gates).

### Slice E — story update reconciliation

- **Definition identity** (`defRev`, hash): cue = `kind, when, lane, window, repeat, landed_when, max_offers`; topic = `keys`
  + tier count + each tier's `when`; norm = `broken_when, noticed_by, checkpoints`. Cue text, tier text, `label` and
  `priority` are wording/ordering: excluded.
- `diffCues` in `storyDiff` (called from `diffRoster`, `storyDiff.ts:315`, and for `norms`): wording change → compatible,
  state kept, next offer uses the new text; changed `defRev` → compatible with reset of that source's keys (`cue_<m>_<id>_*`,
  `topic_<m>_<id>`, `cue_norm_<id>_*`); removal → prune the keys. Pruning applies to engine state and retained engine history
  (`pruneEngineState`/`pruneEngineHistory`, `storyUpdate.ts:176-177`).
- **Extras hook**: an owned `reconcileCues(extras.cues, prevStory, nextStory)` registered with the story-update path and run
  before `swapStory` (`storyUpdate.ts:177`). Receipts and consumed markers are earned evidence: kept under their original
  `defRev` (inert for spend and counters under a changed definition, still shown in author history); pending offers and
  lapses of changed or removed sources are dropped; receipts of removed sources are dropped. Old evidence is never
  regenerated from the edited schema. The same hook mechanism serves 07 (`reconcileEchoes`).
- Tests: update → rollback → reopen together (wording edit keeps counts; gate edit resets; removal prunes; rollback after the
  update replays to the same state; reopen round-trips).

### Slice F (optional, owner decision 2) — extraction-assisted topics and realized lines

- A `CUE` line in the shared read ("member voiced cue <id>", byte-exact quote anchored on the reply revision, unresolved =
  unknown) as a second realized signal; for topic steps, extraction must yield **addressed evidence** (speaker = player,
  addressee = one member, quote anchored on the player line's revision), producing the same `RaiseOccurrence` and consumed
  once through the channel; never an unqualified bool. CL tier; builds only after v2.8 42 witness consumers pass their floors.

## Predeclared floors

Sol's, informational, never retuned (rule 2). Denominators recorded.

| # | Condition | Floor | Tier |
|---|---|---|---|
| C1 | 40 positive/negative cue opportunities across three members: correct selection (winner per lane/priority/order, or no cue) | ≥ 95 % | D |
| C2 | Realized relevant reaction among eligible offers (independent rater, real Artemis replies) | ≥ 80 % | RP + CL |
| C3 | Unauthorized topic progression (unaddressed, OOC, keys elsewhere, gated tier) | 0 | D |
| C4 | Held-secret disclosures through a cue (adversarial cues restating a secret kept from the member) | 0 | D |
| C5 | Player-action narration in realized replies (rater) | 0 | CL |
| C6 | Once/cooldown/max_offers: rollback equals replay at every cut (edit, swipe, delete) | 100 % of cuts | D |

## Gates by tier

- **D (each slice):** `npm run gates:quick` until green, then `npm run gates` (Storybook included for the Studio editors and
  the author row). Jest: arbitration property test over generated candidate sets incl. echo candidates (C1 shape, ties,
  gaps, pinned must/topic/echo competition), `rollbackReplay` property for receipts, consumed occurrences and `cue_`/`topic_`
  keys (C6), topic occurrence negatives incl. the slice B cases (C3), secret adversarial set (C4: a secret with no unknown
  proper noun, a narrator recipient who privately knows it, a secret introduced after an echo landed), offer-evidence
  negatives (never-offered, filtered, thought-only, invalidated, same-boundary), feature-only fixtures (cue-only, topic-only,
  norm-only), story update → rollback → reopen, `rollbackDetectors.guard.test.ts` planted control, `tools.test.ts`,
  `guideCoverage.test.ts`, `architecture.test.ts`. Main bundle unchanged within 1,300,000 B (code in the game-layer lazy
  chunk).
- **Live no-model scenario** on a lane: a fixture story with three members, scripted turns through `send` + `debugResponse`
  plumbing only, asserting the applied private block (`getAppliedEpistemicBlock`-style probe of the member block, block
  named) and `extras.cues` receipts after swipe/edit/delete. Plumbing only, never sign-off.
- **RP + CL (acceptance):** corpus of 40 opportunities frozen before inference; real Artemis replies (`send_generate`, thinking and
  inner voice on) on an authorized lane/GPU window; rater on the authoring route — opencode `openai/gpt-6.1-sol` by default,
  DeepSeek only as fallback when Sol cannot answer (route recorded per row), never Artemis — scores C2/C5 blind to the cue's
  lane. If the window or backend is unavailable, the gate is NOT green and the record says so.

## Privacy and spoiler notes

- Offers reach only the recipient's private block, filtered per recipient on the final rendered line at every generation
  (`keptFrom` with the member's names); never shared tiers, the resting view, the director or a player surface. Player
  surfaces identical with and without cues. Authored or private placement alone is not treated as proof of safety.
- Omniscient narrator recipient: its reply is shared with the player, so its offer line also passes the resting-audience
  content filter and `knownEntities`.
- Topic keys are matched on the player's own directly addressed line only; a keyword never unlocks a gated tier, so asking
  cannot extract a secret the author gated.
- Norm witnesses are authored; no inference of who saw what until v2.8 42 consumers pass.
- Author view and journal rows are author-only (`assert-player-clean`). Campaign adoption reviewed by another model; owner
  sees counts only.

## Invariants touched

- **Engine purity**: arbitration, latches, topic counters are pure in `engine/life/`; offer evidence enters as a frozen
  `EngineHost.offers()` value in `DerivedQualityView`, never an import of extras.
- **EngineHost is a clock seam plus `derive`**: `offers` is a read-only value read once per boundary, used only by derive
  writers; no effects through it.
- **One order per boundary** (`BOUNDARY_STEPS`): reaction latches in the latch pass (and after entry); `landed` and topic
  counters in derive; no second transition, no new step. `boundaryOrder.test.ts` unchanged.
- **Every compiled code key has a rollback check**: detectors `cues`, `cue-topics` added to `ROLLBACK_DETECTORS`.
- **Own slices roll back by message**: `rollbackCues` in quarantine, like promises/rumors/witness; receipts revision-bound.
- **Held secret never reaches a kept-out member**: final-line content filter in the channel plus `addPrivateSource`'s
  `withoutSecretLines`.
- **Disclosure is not knowledge**: offers write no epistemic row, no codex latch, no shared tier.
- **Story identity / update**: `diffCues` + `reconcileCues` keep wording edits, reset changed definitions, prune removals in
  engine state, history and extras.
- **Chance is seeded, never `Math.random`**: arbitration draws nothing.
- **Every authorable field has a guide topic**: `cues`, `topics`, `norms`; compact twin in `guideTopics*`.
- **Wizard writes only through tools**; new tools are edit ops (review / auto-draft), not provisioning.
- **No posted message**: offers never go through `EffectsApplier`; `npc_replies` remains the only speaking effect.
- **Agency policy**: cue copy names the player's actions and feelings as theirs; nothing narrates compliance.
- **Coordinators never import each other**: `cuePort` and 07's `echoPort` meet only through `addOfferProvider`.
- **Main bundle budget**: lazy chunk only.

## Dependencies and links

- v2.8 50 (story time keys in gates), 51 (labels/feelings in gates, beat repetition rule), 52 (SC1–SC5 shared contract, codex
  keys, `knownEntities`), 55 (as-built template), 56 (coordinate: norms vs permission revocation; neither writes the other's
  keys), 42 (runtime witness, slice F only), 22 (N05 reestablish, not here).
- v2.9 02: delivery voice (mood-conditioned wording) and S2's staging predicate + synchronous drafted-member rebuild, which
  the channel's pending offer relies on; cues must work without a `polish` field.
- v2.9 07: consumes §Offer API (echo provider, receipts, lapses, `reconcileEchoes` through the same update hook). 07 owns echo
  scheduling, due/cancel/expiry and the echo copy header.
- v2.9 05 may later register a provider for private pattern reactions; v2.9 09 maps the `cues` feature row.

## Decisions for the owner

1. **Authored cue format** as above (`roster[].cues`, `roster[].topics`, story `norms`). **Recommended: yes.**
2. **May topic progression use extraction** (slice F) rather than only direct-address key matches? **Recommended: not in
   v1; revisit after v2.8 42; if built, only as addressed evidence.**
3. **Campaign adoption**: write cues for the campaign after D floors are green, reviewed by another model, counts only to the
   owner? **Recommended: yes, after C1–C6 D rows.**
4. **Defaults**: may-cue member gap 2 boundaries, reaction window 3, must `max_offers` 3, one offer per recipient per
   generation, default priorities remark 0 / norm 15 / echo 20 / topic 30. **Recommended: yes.**

## Unresolved questions

- Topic raise with no vocative (member spoke last, line says "you"): count it? Proposed: no in v1 (C3 strictness); measure
  misses.
- Does Artemis honour a private "if it fits" cue often enough for C2 without the must phrasing? Unknown until RP.
- Is the applied-block read-back available on every generation path (group draft, `/trigger`, continue) without a second
  prompt build? Verify in `stHost` before slice A.

## Review 2026-10-21 (sol)

- **P1 topic raises not uniquely consumed / addressed** — applied. `RaiseOccurrence` keyed by chat, player message, revision,
  member, topic; consumed marker = the topic offer's receipt in `extras.cues.consumed`, rolled back by message and revision;
  preview and derive read the same marker; counter is a pure function of consumed evidence. New conservative
  `directlyAddressed` (vocative only, unique) replaces `addressedAmong` (`rules.ts:60`, `:95` verified as mention heuristic).
  Multi-member, regenerate, continue, edit, OOC, quoted and third-person cases added. Slice F must yield addressed evidence.
- **P1 landed latch lacks input** — applied. Latch view verified without host input (`engine.ts:516`); `landed` and topic
  counters move to derive with a frozen `EngineHost.offers()` value; same-boundary offers count from the next boundary
  (`messageId < lastMessageId`); negatives for never-offered, filtered, thought-only, invalidated offers.
- **P1 stale cue state on story update** — applied as slice E: `defRev` identities, `diffCues` (roster diff verified always
  compatible, `storyDiff.ts:315`), engine state + history pruning, `reconcileCues` extras hook before `swapStory`
  (`storyUpdate.ts:177`); update → rollback → reopen tests.
- **P1 cross-plan: offer API for 07** — applied: §Offer API (source union incl. echo, arbitration, eligibility, window/expiry,
  rendered-revision receipts counted only when the final filtered line reached the applied block); must vs topic vs echo
  pinned; scheduled/due/landed-to-channel/offered/realized mapping stated for 07.
- **P1 cross-plan: held-secret content filter** — applied: final-line `keptFrom` per recipient at each generation; resting
  audience + `knownEntities` for an omniscient narrator recipient; three adversarial fixtures in C4.
- **P1 cross-plan: new-only activation** — applied: `cues`/`topics` into `LIFE_MEMBER_FIELDS` and `LIFE_FIELDS`, `norms` into
  `usesGameLayer`, `life` built for them, staging predicate `hasOfferSources`; cue-only, topic-only, norm-only fixtures.
- **P1 cross-plan: settings through the resolver** — applied: `FEATURE_POLICY_FIELDS.cues`, chat override in
  `extras.overrides`, precedence stated; 09 mapping row.
- **P1 cross-plan: extras reconciliation on update** — applied in slice E (earned receipts kept under original `defRev`).
- **P2 cross-plan: model routing** — applied: rater Sol default, DeepSeek fallback only, route recorded; never Artemis.
- Floors C1–C6 unchanged. Thinking and inner voice untouched. Topic default priority moved 10 → 30 (arbitration default, not
  a floor) so a raised topic outranks a waiting echo; listed in owner decision 4.
