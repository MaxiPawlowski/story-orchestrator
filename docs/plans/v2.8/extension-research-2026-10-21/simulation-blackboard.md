# Simulation Blackboard — 2026-10-21 harvest
meta: https://github.com/st1ksi/Extension-Blackboard · `pre-refresh-2026-10-21`..`2cfb553` (3 commits: 1.13.1, 1.14.0, 1.15.0; 105 files,
+7k/−2.3k) · **AGPL-3.0: ideas only, no code** · read: CHANGELOG, private-modes.js, campaign-layers.js, prompts/campaign/*.md, diffs of
review.js, transaction.js, private-runner.js, issue-ledger.js, state.js, turn-instructions.js, compact-base.md, ultra-base.md,
game-common.md · skipped: dashboard/settings UI, the six new game-system profiles (coc7e, pf2e, gurps, cyberpunk, vtm, swade), tests,
sync scripts, report store internals · prior: `docs/plans/v2.8/extension-research-2026-10-14/simulation-blackboard.md` (P1–P7, triaged
in 61 as H1, H1b, H1c, H1d, H2, R22, R70); follow-up plan `62-quantum-ogre-and-prepared-facts.md`.

## What it is / what changed
- Still a single-character CC extension with a model-edited markdown board. New since the last round:
- **Light Private Turns** (1.13): one combined detect pass + one correction pass, no model verification (`private-modes.js:7-34`).
  Still holds the reply until it passes and publishes via `saveReply`; ≥ 3 requests per turn, no streaming.
- **Durable private reports** per account/character/chat in browser storage (`private-report-store.js`), saved before publication.
- **Per-chat settings** (1.14): global defaults or a chat copy, frozen per private turn.
- **Campaign layers** (1.15): append-only, independent selectors — simulation focus (General / Relationships & Social), campaign style
  (6), tone (3), narration style (Concise / Evocative) — each also emits review criteria (`campaign-layers.js:8-33,77-99`).
- **Doctrine edits**: removed mandatory faction alertness meters, NPC loyalty/bribe meters, "every NPC has a lever"; a "player authors
  their feelings/thoughts/beliefs" line plus a bounded exception for rules-imposed mental conditions; six new rules profiles.

## How it works (new detail only)
- **Light correction contract** (`private-modes.js:36-65`): every recorded issue lists `affected` record ids (or `candidate`); the
  correction must resolve each exactly once as resolved/rejected/blocked with exact-quote evidence; `resolved` needs an actual change in
  an affected record, or a changed candidate when only the candidate was affected (`:51-58`); editing unrelated prose or another block
  cannot close it; "Do not manufacture changes to justify this pass" (`:26`); a clean report still runs the one correction stage
  (`transaction.js` diff `+325-338`). Correction cannot move the resolved clock unless detection recorded a grounded `time_correction`
  (`private-modes.js:21`, transaction diff `+439-448,+510-514`). `affected` cannot be relabelled across reports (review.js diff `+268-269`).
- **Presentation vs world defects** (`campaign-layers.js:94`): a narration-style finding is labelled presentation-only and repaired in
  candidate prose only, from existing player-perceptible facts: no board rewrite, invented fact, added speech content or action,
  changed result, removed required information or extra elapsed time; speech meaning, knowledge boundary and action boundary preserved;
  a world defect is recorded separately ("shortening prose cannot repair it"); "apply the selected requirement, not a personal prose
  preference". Evocative check (`:74`): cite a concrete unfulfilled task (generic mood labels, interchangeable speech); no quota.
- **Layer contract** (`prompts/campaign/contract.md`): layers steer only genuinely undefined future preparation; changing a selection is
  not an in-world event or licence to rewrite causes; "never choose a hidden truth because the player's approach would benefit".
- **Frozen instruction snapshot** (`campaign-layers.js:102-125`, transaction diff `+339-366`): exact texts of quality, game profile,
  layers and review criteria are frozen with the turn; a paused turn under changed instructions refuses to resume.
- **Social focus** (`prompts/campaign/relationships-social.md`): prepare dispositions, significant memories (event / how learned /
  recollection / interpretation kept apart) and directed attitudes before social contact, including reachable calls/messages and incoming
  participants; "repeated compliments, chat turns or a mandated slow burn are not progress counters"; "silence creates no automatic
  jealousy, reconciliation, forgetting"; depth per quality tier (`social-depth-*.md`).

## Does the new code change anything plan 62 assumes?
No assumption breaks. 62 cites the doctrine (N−1, closed contents, root truth, prepared lie); all survive in `compact-base.md` and
`ultra-base.md`, and P7 (pre-publication private turn) is still blocking in Light mode, so R70 SKIP stands. Three small inputs:
- **Distance-2/3 skeletons now hold "relevant knowledge/root facts" instead of "key secret"**, and the faction/Psyche sections now say
  do not manufacture secrets, debts, vulnerabilities or meters to fill a template (ultra-base diff, compact-base diff). → 62 stage 3
  (model-filled facts): add one prompt rule and one Q-row: a fill answers its authored hint only; it never adds a secret, debt or
  lever the hint does not ask for. Stage 2 is unaffected (no model).
- **"Never choose a hidden truth because the player's approach would benefit"** (`contract.md`). 62 stage 2's seeded pick keyed
  hash(chat, story, hint id) and committed at distance one already satisfies this by construction; state it in the `prepare` guide
  line so an author editing alternatives mid-run understands why the pick is not re-drawn.
- **62 unresolved question "is an NPC the player is about to question a third axis?"**: their social focus treats reachable
  calls/messages and incoming participants as contacts. Supports adding "a roster member present or arriving" as a due trigger;
  still an owner call, not a new row.
- 62's stage 1 record (0/60, 0/20 on Sol) is untouched by this repo; nothing here supplies an Artemis datum.

## Patterns for SO

### P1. Player authors their feelings, thoughts and beliefs, not only acts — pattern · agency prompt + warden · partial · value 3 · effort S
What: the player authors speech, thoughts, beliefs, interpretations, subjective feelings and voluntary choices; narration never
invents or extends them; a rules-imposed condition is a bounded exception with cause, scope and end (`contract.md`,
`relationships-social.md` §8, ultra-base diff "The player authors…").
Our state: `PLAYER_ACTION_CLAUSE` forbids narrating the player "acting, accepting, agreeing or refusing" (`src/engine/agency.ts:24`);
nothing forbids "you feel a pang of guilt", "you realise she is lying". The warden reuses the same clause (`src/judge/warden.ts:117`).
Fit: one clause extension ("…or what {{user}} feels, thinks or concludes") and the same words in the warden's agency check. Player feels
it directly (a reply that tells them their emotion is a common RP complaint). Flag: check plan 54's carried thought / inner beat
("Your intent this turn") is a member-side prompt, not narration of the player's mind; if the inner voice is the player's own voice
by design, the clause must exempt it — raise with the owner before changing, per the thinking/inner-voice rule. Payload goldens
change (declared hunk). Not covered by 61.

### P2. Polish-pass safety contract — pattern · per-character polish (owner idea) · absent · value 4 · effort M (with the feature)
What: the presentation-vs-world split and the Light correction rules are the safety contract a reply-polish pass needs (see
§For per-character polish). Not covered by 61 (R3–R8 are Recast interop fixtures, not a polish feature).

### P3. "Not a progress counter" for relationship steps — pattern · life/labels (51) · present (partial) · value 2 · effort S
What: repeated compliments or turn count are not relationship progress; silence decays nothing by itself.
Our state: the fresh-beat guard holds a feeling step whose evidence repeats the last beat within 4 boundaries
(`src/engine/life/beats.ts`, via `heldJournal.freshBeats`; architecture.md §Relationship labels). Only add: a read-prompt line
"the same kind of gesture again is not a new beat" and a fixture of 5 compliments in 5 turns → ≤ 1 step. Fold into 51's fixtures.

### P4. Frozen instruction snapshot for long passes — pattern · director/wizard · present · value 1
Their paused turn refuses to resume under changed instructions. Ours: no paused passes; living ops are checked at proposal and apply
(`checkDirectorOps`), wizard runs are owned by `RunOwnership`. Nothing to take.

## For per-character polish
Mechanism there: no per-character polish exists. The closest is the narration-style layer (global per chat, Concise/Evocative),
checked inside the private turn's narration aspect and repaired in candidate prose before publication. Per-character voice is
**prepared actor state**, not author config: every distance-1/2 actor carries a "speech manner" in its Psyche (`compact-base.md`
distance 1–2 line; `ultra-base.md` distance 1), and the evocative check flags "interchangeable speech". So: one global style choice,
per-character voice data written by the model into the board.

Safety against adding facts or player actions (the part worth taking, ideas only):
- Presentation finding ≠ world finding; a presentation repair may change prose only, from player-perceptible facts already in the reply:
  no new fact, no added speech content or action, no changed outcome, no dropped required information, no extra time; speech meaning,
  knowledge boundary and action boundary kept (`campaign-layers.js:94`).
- No finding, no rewrite: "do not manufacture changes to justify this pass" (`private-modes.js:26`); every edit closes a recorded finding
  with exact-quote evidence, and a finding cannot be closed by editing something else (`:51-60`).
- "Apply the selected requirement, not a personal prose preference" (`campaign-layers.js:94`) — the polisher enforces the member's
  configured notes, never its own taste.
Cost there: Light = simulate + detect + correct (≥ 3 requests), Heavy ≥ 5; reply held until done.
Swipes/edits/streaming there: no streaming in private mode; the polished candidate is what gets published, so a swipe is a whole new
private turn; board snapshots per swipe (`swipe_info[i].extra`, unchanged since last round).
Per-character config kept: none authored; speech manner lives in model-written board blocks.

Sketch for SO (owner idea, per roster member):
- Config: `roster[].voice?: { notes, lexicon?: string[], avoid?: string[], rhythm? }` — absent today (`RosterMember`,
  `src/engine/schema.ts:326-339`; voice lives only in the card). Guide topic + Studio Characters editor (every authorable field has a topic).
- Timing: post-render, not pre-publication (keeps streaming; Artemis thinking untouched; a group send is N loud generations, so a held
  reply multiplies latency). Rewrite through the existing own-write path `rewriteReplyText` (`src/services/stHost/chatMessages.ts:18-31`,
  swipe-synced, used by thought-leak repair via `src/runtime/replyEffortLive.ts:29`), owned by a `RunGuard` keyed to the reply revision,
  and landed **before** the boundary's extraction read takes the window, or else treated as a genuine rewrite (69 K6/K6b: a revision change
  rolls back and invalidates `extra.reasoning` readers). Decide which; the first needs the polish to finish inside the flush window.
- Detect then correct, two calls on the authoring/memory role (never Artemis), drafted member's voice notes only. Detector output =
  findings with exact spans (repetition, `avoid` term, voice-note breach); empty → no rewrite.
- Deterministic guard before the write (no model trust): names in output ⊆ names in input; quoted-speech segments same count and each
  output quote maps to an input quote; no new sentence with {{user}} as subject (P1 clause); length within a band; every changed span
  overlaps a finding span. Any fail → keep the original, journal it (author-only).
- Privacy: the polisher sees the reply, the member's voice notes and the resting view only — never another member's private block.
- Floors to predeclare: facts added 0 (rater + guard) over N replies; player-mind/action additions 0; voice-distinctness blind pairwise
  preference informational; swipe/edit/delete of a polished reply ≡ unpolished (rollback ≡ replay).

## Host facts
- None new. `saveReply` publication and dry-run capture were recorded last round. Their report store keys by
  `getCurrentUserHandle()` from `user.js` (private-runner diff `+93-94`) — an account-scoped key; irrelevant to us (one user).

## Not worth taking
- Light/Heavy private turns: still hold the reply (R70 SKIP stands; judge never blocks).
- Campaign style/tone selectors: SO stories are authored; `briefing.tone` / `living.tone` exist (`src/engine/schema.ts:453,523`); a
  genre layer over authored checkpoints adds little at the table.
- Per-chat settings copy: SO already has per-chat overrides over install defaults (architecture.md §State homes).
- Durable private reports in browser storage: our evidence lives in `chat_metadata` rings and the session journal.
- Six tabletop rules profiles, dice cadence, session-vs-world time: game-system specific; our checks/chance cover our needs.
- Removing faction meters: SO factions are authored code ints with band words (plan 53), not model-written meters.
