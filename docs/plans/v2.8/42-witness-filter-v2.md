# Plan 42 — Witness filter v2

**Status: v2.8, owner decision 2026-10-14 (moved from v2.9 02), not built. Revised 2026-10-14 against the Astra review
(owner approved; §13).** Option A shipped as v2.7 02 C2 and its K1/K2 fix (`7ee079f2`). This plan owns option B (an
extraction witness source with span/mixed-audience labels and explicit unknowns, measured offline) and, as a separate
later decision, option C (a host-channel-aware message filter). Was v2.7 22 → v2.9 02 (`docs/plans/v2.7/RENUMBER.md`);
`docs/plans/v2.9/02-sp9-witness-filter-v2.md` keeps the full spike history and now points here.
**Gate tiers** (v2.8 00 §Gate taxonomy): B implementation D, acceptance CL (extraction route + second-model labels);
C implementation D, acceptance RP/LT (live reply legs on an adolion-fresh lane).

## 0. Shared audience/provenance contract (v2.8 42, 43, 44, 47)

One vocabulary for every plan that decides who may receive a piece of story text. v2.8 43 (recall), v2.8 44 (rumors)
and v2.8 47 (promises) cite this section instead of defining their own. Nothing here is built yet; the pure types live in
one module (`src/memory/audience.ts`, proposed) that the four plans share.

**Source identity.** Every audience claim points at a **source span**, never at a content hash:

| Field | Meaning |
|---|---|
| `chatId` | the chat the span lives in (plus the run's `storyId` for stories that restart in place) |
| `messageId` | ST message index at the time of the claim |
| `revision` | `swipe_id` + a hash of that swipe's text; an edit or swipe makes a new revision |
| `speaker` | the message's author (`is_user` → player; else the character name ST stored) |
| `span` | `[start, end)` character offsets into that revision's text; whole message = `[0, len)` |
| `inputRange` | the read that made the claim: `{from, to}` message ids and the revision of each message it saw |

A content hash is allowed for dedup and integrity checks only; two identical lines in different scenes are different
sources.

**Five relations, never inferred from one another.**

| Relation | Means | Does not mean |
|---|---|---|
| **witnessed** | member perceived the span first-hand (heard or saw it) | that the member believes it, or that the player saw it |
| **told** | member received a report of it from a named teller, at a source span of its own (the telling) | that the member witnessed the original span |
| **believed** | member holds the proposition as true (an epistemic state with its own provenance) | that the proposition is true in the story |
| **player-visible** | the span or fact reached a player surface or the transcript the player reads | that any character knows it |
| **authorized disclosure** | an authored rule or event permits a reveal **to one named recipient** | a reveal to anyone else; removal of a restriction for others |

Every relation has an explicit **unknown** value. Unknown is never read as witnessed or authorized.

**Consumer rules.**
- **Adding text** to a member's request (43 recall, 44 hops, 47 reminders) needs a positive relation: witnessed, told
  (then only the telling span is eligible, not the origin), or authorized disclosure. Unknown or mixed → refused.
- **Removing text** (42 C filter) keeps unknown spans and reports them as a coverage gap; it removes only spans with a
  recorded "not witnessed".
- A held secret (`[hiding]`/`[unaware]`) restricts by recipient. A disclosure lifts it for that recipient only (v2.8 44
  §Recipient reveal); `keptFrom` (`src/memory/heldSecrets.ts:42`) stays as a lexical backstop after provenance.
- Hearsay is typed separately from truth: a told row records the teller, the claim and the receiver's belief state;
  extraction never promotes a told claim to a fact without a witnessed or authored source.
- Player-visible is computed from player surfaces (`runtime/playerProjection.ts`) and the transcript, never from
  character knowledge, and vice versa.

## 1. What it is

- In a group chat every drafted member's request carries the whole transcript, including asides and scenes that member
  was not present for. A character can "know" what it never heard.
- Private knowledge is protected today at **block level**: per-member epistemic block, per-member redaction of shared
  tiers. The transcript itself is shared.
- A witness filter would hide unwitnessed messages from each drafted member's request (on the interceptor's copy, never
  the chat). That needs a **witness source** that says, per span, which members heard it. None we have is accurate.
- **A message is not one audience unit.** A reply can hold public dialogue, an aside and private thought. B labels
  spans where the read can anchor them, flags the rest `mixed`, and says `unknown` when it cannot tell.
- B builds that source and measures it offline. C (the filter) is a stance change and a separate decision.
- The cheapest benefit of B is **safe retrieval eligibility** for v2.8 43, without removing any transcript context.
- Group chats only (v2.7 03). The record is the witness relation of §0 that v2.8 43 and v2.8 44 build on.

## 2. History and evidence

Bars declared in `docs/plans/v2.5/09-research-spikes.md` §SP9 (`:239-260`): F1 no chat mutation, F2 0 unwitnessed
messages in any drafted request, F3 J5 + J6 unaffected, F4 witness source ≥ 0.9 of 40 labels, F5 interceptor p95 ≤ 5 ms.

| When | Leg | Result | Citation |
|---|---|---|---|
| v2.5 live ×2 | F2 | 13 and 6 unwitnessed hits, all from ST Summarize's quiet generation; 0 with Summarize at interval 0 (427 checks) | `v2.5/09-sp9-spike-report.md:55` |
| v2.5 live ×2 | F4 | 0/40 (presence held name + roster id twice); name-only 0.80 / 0.825 | `:57` |
| v2.5 / v2.6 | F5 | p95 0.10–0.5 ms, PASS | `:58`, `:126` |
| v2.6 lab | F2 | Summarize off: 432/432 kept, **41 unwitnessed visible**, in Vector Storage's `Past events:`; Vector Storage off: 35 hits, all model mimicry of markers | `:123`; `v2.6/03-sp9-restated.md` addendum |
| v2.6 lab | F4 | presence vs 40 pre-run labels **4/40 = 0.10** ("presence is not hearing": asides, muted onlookers) | `:125` |

Lab: `lab/witness/` (37 messages, 11 asides, 24 generations, 40 labels, 9 secrets); records
`test/measurements/v2.6-03/sp9/summary.json`. **Verdict: drop**, removed in `301b0d5a`; stance "no message-level
hiding" kept (`v2.5/09-sp9-spike-report.md:136`). The worth review allowed a v2 only "if a witness source (extraction,
not presence) clears F4 first, with Summarize/Vector Storage/WI-scan named as channels to close".

Since then the same channels showed in play: v2.6 T2-2 (secrets through our shared tiers, fixed per member at block
level, `a19c7023`, merge `f0e62687`); v2.6 T7 (`test/sessions/T7/SUMMARY.md:15`); v2.6 T6-4 (`97156c2f`) Repair row;
v2.7 02 C2 (`e4eb410a`) player alert; K1/K2 fix `7ee079f2`.

**Host facts** (ST `7c3994196`, from source; H5 not measured):

| # | Fact | Where |
|---|---|---|
| H1 | Interceptors run ascending `loading_order`; ours 1, Vector Storage 100 | `public/scripts/extensions.js:49,2033`; our `manifest.json:3`; `extensions/vectors/manifest.json:3,8` |
| H2 | `IGNORE_SYMBOL` empties a message only at formatting; it stays in `coreChat` | `public/script.js:5838-5841` |
| H3 | The WI scan buffer is built from `coreChat` text after the interceptors, ignoring the symbol | `script.js:4564,4624` |
| H4 | Vector Storage splices hash-matched messages out of the array it gets and re-inserts them as `Past events:` | `extensions/vectors/index.js:776-854` (template `:88`; selection loop `:818-830`) |
| H5 | A message **spliced** out of `coreChat` by us would miss the WI buffer (H3) and Vector Storage (H4); splicing shifts depth injections | inference from H3/H4; does not close every vector/file/WI channel |
| H6 | Summarize builds one summary from the live chat (`context.chat.slice()`) and injects it everywhere; no per-member form | `extensions/memory/index.js:785` |
| H7 | `coreChat` is `chat` filtered (system rows dropped, last row popped on `swipe`) and regex-transformed **before** interceptors run, so array positions are not message ids | `public/script.js:4496-4505` |

## 3. Current state in code

Verified on master `211d8d96` (2026-10-14); re-checked on `3a716f2b` for the review.

- **K1/K2 fixed** (`7ee079f2`). `secretLeaks()` no longer depends on a held secret: it returns the copier names whenever
  the chat plays a group story (`src/runtime/transcriptCopiers.ts:3-4`); `copierWarning` carries `secretsHeld`
  separately (`:14-17`). `SECRET_LEAK_CHECK` (`transcript-copiers`, area privacy, audience player, severity degrades;
  `src/runtime/checks.ts:80-97`) uses `secretsHeld` only in the author `detail`; the `player` copy is the same with or
  without a held secret. Snapshot wiring `src/runtime/snapshotBuilder.ts:283`. Settings read
  `src/services/stHost/transcriptCopiers.ts`.
- **Removed spike:** `witnessFilter.ts`, `witnessFilterHost.ts`, `wiring/spikes.ts` listed in `DROPPED_SPIKES`
  (`src/runtime/lazyHarness.guard.test.ts:22-23`, planted import `:134`). `SPIKE_FLAGS` does not list it
  (`src/runtime/settingsModel.ts:105`).
- **Held secrets:** `heldSecrets()` turns active `[hiding]`/`[unaware]` rows into `HeldSecret {phrasings, knowers,
  onlyFrom}` (`src/memory/heldSecrets.ts:21-35`); `keptFrom`, `withoutSecrets`, `withoutSecretLines`, `sharedTierView`,
  `ledgerWithoutSecrets` redact per member (`:42-105`). The match is lexical (`restatesWords`, ≥ 2 shared content words
  at 60 % coverage, `src/memory/words.ts:25-31`); a secret with fewer than 2 content words after names are stripped is
  dropped from `heldSecrets` entirely (`heldSecrets.ts:24`).
- **Shared read window and gaps:** the window is the last 8 messages ending `stabilityLag` behind the newest on
  priority-1 reads (`src/extraction/sharedRead.ts:128-131`); with an empty quality scope the model is **not called**
  and the reply is `NO_DELTA` (`:244-246`). So some messages are never read, some are read late, and a failed read
  reads nothing.
- **Scene read `present`:** the judge scene read asks `present:<rosterId>` per cast member
  (`src/judge/scene.ts:98`), thresholds at `PRESENT_P` 0.7 (`src/judge/policy.ts:59`, `scene.ts:145`), and the
  coordinator keeps **only the latest** `SceneReadRecord` (`src/runtime/coordinators/sceneCoordinator.ts:127-129`).
  It is physical presence, not hearing.
- **Nearest existing witness signal:** the epistemic `WITNESS` rule (`src/memory/contract.ts:140`) and
  `dropCommonKnowledge` (`src/memory/epistemic.ts:203-220`). Fact rows, not a per-span witness set.
- **No witness line** in the shared read. Its parse returns `facts, memory, arcs, epistemic, ledger`
  (`src/extraction/sharedRead.ts:289-295`).
- **v2.8 21 E0 (A12):** ranking code is on master (`src/memory/e0Ranking.ts:12`, `c1764024`); the E0 winner is still
  undecided (private freeze owed). Presence of code is not a winner.

## 4. Design options

| | Design | Cost | Risk | Needs |
|---|---|---|---|---|
| **A. Block level + host-channel alert** | Built (v2.7 02 C2, K1/K2 `7ee079f2`) | done | none known | — |
| **B. Extraction witness source with span labels, measurement first** | The shared read emits witness lines for the messages in its window (format §5.1); parsed into a per-chat witness record of §0 claims keyed by source span and the read's input range; scored offline against labels **before** any consumer uses it | M: contract lines + parser + record + scorer | output tokens and truncation on every read; may crowd out DELTA recall | W-floors (§7) |
| B′. Separate witness pass | Same record, from its own model call per window | M+, one more call per read | doubles read cost | only if B's Wc fails and the accuracy rows pass |
| **C. Host-channel-aware filter** | B's record + our interceptor **splices** recorded-unwitnessed spans' messages from `coreChat` (H5), closing the WI-scan and Vector Storage channels; Summarize stays open (H6) and A keeps warning | L: filter, identity mapping (H7), depth-shift handling, nonce re-measure | stance change; depth injections move; a wrong witness hides what a member saw | separate owner decision after B; F-floors (§7) |
| D. Drop for good | Block level + A only | 0 | characters keep "knowing" missed scenes | — |

## 5. Recommendation

**B now, offline, with span/mixed labels and explicit unknowns. C is a separate decision after B.**

### 5.1 Witness lines

- One line per message in the window:
  `WITNESS m=<id> heard=<rosterId,…|all-present|unknown>` for a single-audience message, or
  `WITNESS m=<id> mixed` followed by `SPAN m=<id> from="<first 4–8 words of the span>" heard=<…|unknown>` per part.
- A `SPAN` anchor resolves only by exact substring match on the message revision the read saw; an unresolved anchor
  makes the whole message `mixed` with every span `unknown`. Spans may not overlap; uncovered text is `unknown`.
- Mixed-audience messages are **ineligible for recall** (v2.8 43) unless the recalled text is wholly inside one span
  with a positive witness claim for that member.

### 5.2 Coverage, freshness, outage

Every message id in a chat has exactly one witness state at any time:

| State | When |
|---|---|
| `classified` | an accepted read covered it and parsed a line for it |
| `pending` | newer than the newest accepted read's `to` (inside the stability lag, or arrived after the read started) |
| `no-read` | the read ran with empty quality scope and skipped the model (`sharedRead.ts:244`), or extraction is off |
| `outage` | the covering read failed, was refused or was truncated before its witness lines |
| `invalidated` | a message inside the covering read's `inputRange` changed revision or was removed (§5.3) |
| `unknown` | the read answered `unknown`, or the message was in the window but no line names it |

Consumers treat every state except `classified` with a positive claim as unknown (§0 consumer rules). B adds **no**
extra model call for `no-read`: empty-scope stories stay uncovered and the coverage floor reports it.

### 5.3 Rollback keyed by input range

- Each accepted read stores `{readId, inputRange: {from, to, revisions[]}, claims[]}`; the record is the list of
  accepted reads (cap 200, older reads fold into per-message accepted claims with their input range kept).
- A swipe, edit or delete of any message in `[from, to]` invalidates **every** claim from that read, including claims
  about earlier messages that survive (a later message may have been what said who heard the earlier one).
- Overlapping reads: for a message, the newest accepted read whose `inputRange` covers it wins; on equal recency, the
  read with more messages after it in its range wins. Losing claims are kept, so invalidating the winner restores the
  next valid claim (a before-image, not a re-run).
- Replay restores accepted results; it never re-runs the model. `rollback ≡ replay` is a property case (Wr).

### 5.4 Steps

1. Contract section + parser + `extras.memory.witness` per §5.1–5.3; pure types in the §0 module.
2. Score offline: the lab's 40 labels, then ≥ 40 messages from real group session transcripts labelled per
   (message, member) and per span (second model writes, third checks; disagreements go to an adjudicated stratum or are
   labelled `unknown`, never dropped). No consumer reads the record before the accuracy rows pass.
3. If accuracy passes and Wc fails, try B′. If accuracy fails, record it and stop: block level stays the stance, and
   v2.8 43 runs on the presence proxy only if v2.8 21 §6.2 passed on it.
4. Combined read budget run (RB, §7) before v2.8 47's promise lines and v2.8 15's merged read ship together.
5. C, if the owner decides for it after B, splices (never flags) and is measured with nonce markers. It is on by
   default once built (v2.8 rule 9); the owner can switch it off.

## 6. What C would add (only after B, separate decision)

- Filter in our interceptor (`loading_order` 1, H1): per drafted member, splice from the interceptor's `coreChat` the
  messages whose every span is recorded "not witnessed" by that member. Unknown or mixed messages are kept (fail open
  on missing data, fail closed on a recorded "not heard") and counted as coverage gaps.
- **Identity mapping (H7):** `coreChat` entries are mapped to chat message ids by object identity with `chat` before
  ST's transform, falling back to `send_date` + revision; a row that cannot be mapped is kept and logged. Cases:
  continued generations, aborted drafts, `swipe` (last row popped), nested quiet calls, impersonate.
- Depth-shift handling: our own depth injections are recomputed after the splice; F6 measures that they land at the
  same position relative to the kept messages.
- Summarize: no per-member form exists (H6); A's alert keeps naming it. No story requirement may force it off.
- Claims are worded per §7 F2a/F2b: "correctly filters classified messages" is distinct from "no unwitnessed text
  reaches any request", which holds only at coverage 1.

## 7. Predeclared floors

Committed before any run; never retuned (v2.8 rule 2). First added 2026-10-14 (never run), tightened by the review.

**B (accuracy is scored on (message, member) pairs unless stated):**

| # | Condition | Floor |
|---|---|---|
| W4 | Exact-set agreement per classified message (lab 40 **and** ≥ 40 real-session messages) | ≥ 0.9 on each set; reported, no longer the only accuracy row |
| W4fi | False inclusion: pair labelled not-heard, predicted heard | ≤ 0.02 of not-heard pairs on each set; 0 on the aside subset's kept-out members |
| W4fe | False exclusion: pair labelled heard, predicted not-heard | ≤ 0.10 of heard pairs |
| W4cov | Coverage: labelled messages the read classifies (not `unknown`/`mixed` without spans) | ≥ 0.85; `no-read`/`outage` counts reported by cause |
| W4u | Ambiguous stratum (adjudicated or labelled `unknown`) | reported separately; a prediction of heard for a pair labelled `unknown` counts as a false inclusion |
| W4m | Mixed-audience detection: messages labelled mixed that the read flags `mixed` | ≥ 0.8; span-level W4fi ≤ 0.02 on resolved spans |
| W4a | Asides subset (heard by a strict subset of present members) | ≥ 0.8 exact-set; presence's 4/40 shape counts as a miss |
| W4n | Null control: presence-as-witness on the same sets | reported; B must beat it on W4a by ≥ 0.3 |
| Wc | Cost | added **input** tokens per read p95 ≤ 120 **and** added **output** tokens per read p95 ≤ 160; `finish: length` rate ≤ baseline + 0.01; read latency p95 ≤ baseline × 1.15; live suite per-tier floors unchanged, `plotDeltaAccuracy` not below its last green |
| Wr | Reversal | witness record after swipe/edit/delete of any message in a read's input range equals the replay of the kept reads, 0 diffs over 4 seeds; an edit inside the range invalidates claims about earlier surviving messages (planted case) |
| Wf | Freshness/outage states | property test: every message id has exactly one §5.2 state; planted empty-scope, failed and truncated reads land in `no-read`/`outage` |

**RB — combined read budget (v2.8 42 + 47 + 15), CL, run before 47's lines ship with 42's:**

| # | Condition | Floor |
|---|---|---|
| RB1 | DELTA accuracy with witness + promise lines + merged cue/scene read on, vs all three off, same fixtures | `plotDeltaAccuracy` and every live-suite per-tier floor not below the off arm by more than 0.02 and not below its last green |
| RB2 | Truncation | `finish: length` rate ≤ off arm + 0.01; 0 reads losing their DELTA block to truncation |
| RB3 | Tokens | added input p95 ≤ 220, added output p95 ≤ 260 per read over the off arm |
| RB4 | Coverage under stress | fixture set includes ≥ 2 empty-quality-scope stories and ≥ 4 delayed or failed reads; witness and promise states land in `no-read`/`outage`, 0 claims invented for unread messages |

**C (only after B and an owner decision; v2.5 bars restated and split):**

| # | Condition | Floor |
|---|---|---|
| F1 | No chat mutation by us | 0 of our symbols in chat/`extra` (host writes recorded, not excused) |
| F2a | Filter correct on classified messages, nonce markers per message | 0 nonce hits from recorded-unwitnessed messages in any drafted request, Summarize off, Vector Storage on/off as separate rows; Summarize-on row reported, expected to fail |
| F2b | Coverage of drafted requests | share of transcript messages in drafted requests that are `classified`: reported; the claim "no unwitnessed text reaches any request" is made only for runs at 1.0 |
| F3 | Extraction and rollback | J5 + J6 ×2 with C on |
| F5 | Cost | interceptor p95 ≤ 5 ms |
| F6 | Depth injections | every `INJECTION_REGISTRY` block at the same position relative to kept messages, with and without C |
| F7 | Identity mapping | 0 mis-mapped rows over continue, aborted draft, swipe, nested quiet and impersonate cases (D, payload golden) |

## 8. Gates by tier

**Implementation (D):**
- B: `npm run gates`; jest for the witness parser (malformed, unknown member, out-of-window id, unresolved and
  overlapping `SPAN` anchors refused or downgraded to `unknown`), the §5.2 states (Wf), the record's
  `rollback ≡ replay` property case with an inside-range edit (Wr), the scorer (W4fi/W4fe/W4cov/W4u/W4m; a planted
  all-present control must fail W4a and W4fi), shared-read contract golden updated.
- C: `npm run gates`; jest for the splice (unknown kept, mixed kept, "not heard" removed, own injections re-placed),
  F6 and F7 as payload goldens (`so-payload-golden.mts`, no model call).

**Acceptance:**
- B (CL): offline accuracy rows on the lab + real-session sets through the extraction route; Wc and RB via
  `so-live-suite.mts run` with per-tier floors; ×2, run header diff around the batch.
- C (RP or LT): F1–F7 live ×2 on an adolion-fresh lane, run header diff around each batch; record names the tier.

## 9. Privacy and spoiler notes

- Real-session labels come from Adolion transcripts: written by one model, checked by a second, never shown to the
  owner (v2.8 rule 11). Labels and scored rows live in private `so-sessions`; only hashes, counts and scores here.
- Nonce markers are random per message and never shown in the player UI.
- The witness record is per chat, in `chat_metadata`, never written to World Info.
- Player surfaces must not change with the presence of a witness row or a held secret (K1 rule carried).

## 10. Dependencies and links

- v2.7 02 C2 + K1/K2 (`7ee079f2`): option A, built.
- v2.7 03: group chats only.
- v2.8 21 (A12): E0 ranking (code on master) + §6.2 presence-proxy evaluation; its VR1/VR2 result decides whether
  v2.8 43 may start from presence.
- v2.8 43 verbatim recall: consumes the witness relation of §0 (P5).
- v2.8 44 rumors and gossip: told/believed relations of §0; overhearing uses the witness record.
- v2.8 47 promises: source spans of §0; shares the read budget (RB).
- v2.8 15 cue + scene read merge: B adds a line family to the same read (RB).
- v2.8 13 J7.3 (epistemic via the judge): a possible second witness source; not scored here.
- v2.8 52 codex: needs player-character provenance, which this record does not give by itself.
- v2.9 02: history kept, status "moved to v2.8 42".

## 11. Decisions for the owner

1. Run B (extraction witness lines with span/mixed labels and explicit unknowns, offline measurement, no filter)?
   **Recommended: yes.**
2. Lines inside the shared read (B) or a separate pass (B′)? **Recommended: inside the read first; B′ only if the
   accuracy rows pass and Wc fails.**
3. Build C (message-level filter, a stance change)? **Recommended: a separate decision after B's record; default no
   unless sessions show characters acting on scenes they missed (not only secrets).**
4. Should a story be able to require Summarize / chat vectors off? **Recommended: warn only (kept from v2.9 02
   decision 4).**
5. Witness labels from real sessions: who writes them? **Recommended: one model writes, a second checks,
   disagreements adjudicated by a third or labelled `unknown` (never dropped); the owner never sees them.**
6. Empty-quality-scope stories: pay a witness-only read, or leave them `no-read`? **Recommended: `no-read` (no extra
   call); W4cov and RB4 report the gap.**

## 12. Unresolved questions

- Whether witness lines fit the read's output budget on long windows (Wc, RB decide).
- Muted onlookers and characters drafted later in the same turn: the label rubric must say whether "in the room,
  not addressed" counts as heard (rubric written before labelling).
- Whether the judge scene read should keep a `present` history for W4n, or W4n is computed offline from transcripts.
- Whether 4–8 word span anchors resolve reliably on Gemma-formatted replies (W4m shows it).

## 13. Review 2026-10-14 (Astra)

Source: `review-astra-2026-10-14.md` §Plans 42-47 (42). Verified on `3a716f2b`.

- **P0 — a message is not one audience unit.** Accepted. Verified: no span notion exists; the read's parse is
  message-free (`sharedRead.ts:289-295`). → §5.1 span/`mixed` lines with exact-substring anchors, `unknown` default;
  mixed messages ineligible for recall; W4m floor.
- **P1 — missing data makes F2 unattainable.** Accepted. Verified: lagged 8-message window (`sharedRead.ts:128-131`),
  model skipped on empty scope (`:244-246`). → §5.2 six witness states; Wf, W4cov, RB4; C's F2 split into F2a
  (classified) and F2b (coverage, claim only at 1.0).
- **P1 — message-keyed rollback insufficient.** Accepted. → §5.3 claims keyed by the read's input range and
  revisions; inside-range edits invalidate earlier claims; overlap precedence; before-images, no re-run; Wr planted
  case.
- **P1 — W4 conceals dangerous errors.** Accepted. → W4fi (≤ 0.02), W4fe, W4cov, W4u (ambiguous stratum retained),
  W4m; Wc now covers output tokens, truncation and latency.
- **P2 — H5 narrow; coreChat positions are not ids.** Accepted. Verified `script.js:4496-4505` → H7; §6 identity
  mapping; F7.
- **Recommendation (B first with span labels; C separate).** Adopted: decisions 1 and 3.
- **Cross-plan:** shared audience/provenance contract added as §0; combined read-budget experiment added as RB.
- **Stale claim:** E0 code now on master; §3 corrected.
- Rebutted: none.

## Harvest 2026-10-14 addendum

From `docs/plans/v2.8/61-harvest-triage-2026-10-14.md`. Ideas only (source licences: AGPL/GPL/none unless noted). First verified against master `9e96871d`; revised 2026-10-16 on `e8b9dd6d` after `review-astra-harvest-2026-10-16.md`. The owner decides with the rest of this plan.

- **H13c hidden messages and recall eligibility** (`docs/plans/v2.8/extension-research-2026-10-14/timeline-memory.md` P3, 3/S). `/hide` sets `is_system`; the read
  drops hidden rows at read time only (`src/extraction/windowHygiene.ts`), and plans 42, 43 and 47 never say whether a span
  hidden **after** it was read stays a witness source or recall candidate. Host fact: `is_system` is set by both `/hide` and
  summarizers, so the two cannot be told apart. Recommended rule for §0 (the shared contract): a message hidden at query time
  is not recall-eligible and not quotable; its witness record stays (who heard it does not change); a later unhide restores
  eligibility. Spans are addressed by message id **and revision** (as 47's `SourceRevision`, `src/memory/audience.ts:10`), so
  an edited message is a different span. Floor: 4 seeds (hide, unhide, summarizer-hidden, reopen) D.
- **H16c hold ST Summarize while a secret is held** (`docs/plans/v2.8/extension-research-2026-10-14/dooms-enhancement-suite.md` P1, 3/S). The `transcript-copiers` check
  only warns (`src/services/stHost/transcriptCopiers.ts`, `src/runtime/checks.ts`). Their trick holds Summarize without writing
  the user's setting (a getter on the summary state that reads as frozen while a flag is set). Two separate owner decisions:
  (a) **whether to build** a host interposition over another extension's state at all; (b) its default once built, which
  follows rule 9 (on by default) unless the owner says otherwise. The earlier "opt-in" wording conflicted with rule 9 and is
  withdrawn. Scope stated plainly: the hold stops **future** summaries only; existing summaries and Vector Storage are
  untouched, and `transcript-copiers` keeps naming both. Released on story end; never an install write. Needs a verified host
  fact (the Summarize state shape at the ST pin) before building; with C, the F2a/F2b rows measure it.

## Review 2026-10-16 (Astra)

Source: `review-astra-harvest-2026-10-16.md` §Addenda requiring correction. Verified on `e8b9dd6d`.

- **P1 — the Summarize hold was opt-in, contrary to the default-on rule; holding future summaries leaves existing summaries
  and Vector Storage untouched.** Accepted. → build approval separated from the default (rule 9 once built); scope stated;
  `transcript-copiers` keeps naming both.
- **43/47/55 — message ids need revisions.** Accepted here too. → spans addressed by id and revision (`src/memory/audience.ts:10`).
- Rebutted: none.
