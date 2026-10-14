# Plan 42 — Witness filter v2

**Status: v2.8, owner decision 2026-10-14 (moved from v2.9 02), not built.** Option A shipped as v2.7 02 C2 and its
K1/K2 fix (`7ee079f2`). This plan owns option B (an extraction witness source, measured offline) and, only after B
passes, option C (a host-channel-aware message filter). Was v2.7 22 → v2.9 02 (`docs/plans/v2.7/RENUMBER.md`);
`docs/plans/v2.9/02-sp9-witness-filter-v2.md` keeps the full spike history and now points here.
**Gate tiers** (v2.8 00 §Gate taxonomy): B implementation D, acceptance CL (extraction route + second-model labels);
C implementation D, acceptance RP/LT (live reply legs on an adolion-fresh lane).

## 1. What it is

- In a group chat every drafted member's request carries the whole transcript, including asides and scenes that member
  was not present for. A character can "know" what it never heard.
- Private knowledge is protected today at **block level**: per-member epistemic block, per-member redaction of shared
  tiers. The transcript itself is shared.
- A witness filter would hide unwitnessed messages from each drafted member's request (on the interceptor's copy, never
  the chat). That needs a **witness source** that says, per message, which members heard it. None we have is accurate.
- B builds that source and measures it offline. C (the filter) is a stance change and waits for B.
- Group chats only (v2.7 03). It is also the witness record v2.8 43 (verbatim recall) and v2.8 44 (rumors) build on.

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
| H4 | Vector Storage splices hash-matched messages out of the array it gets and re-inserts them as `Past events:` | `extensions/vectors/index.js:776-854` (template `:88`) |
| H5 | A message **spliced** out of `coreChat` by us would miss the WI buffer (H3) and Vector Storage (H4); splicing shifts depth injections | inference from H3/H4 |
| H6 | Summarize builds one summary from the live chat (`context.chat.slice()`) and injects it everywhere; no per-member form | `extensions/memory/index.js:785` |

## 3. Current state in code

Verified on master `211d8d96` (2026-10-14).

- **K1/K2 fixed** (`7ee079f2`). `secretLeaks()` no longer depends on a held secret: it returns the copier names whenever
  the chat plays a group story (`src/runtime/transcriptCopiers.ts:3-4`); `copierWarning` carries `secretsHeld`
  separately (`:14-17`). `SECRET_LEAK_CHECK` (`transcript-copiers`, area privacy, audience player, severity degrades;
  `src/runtime/checks.ts:80-97`) uses `secretsHeld` only in the author `detail`; the `player` copy is the same with or
  without a held secret. Snapshot wiring `src/runtime/snapshotBuilder.ts:283`. Settings read
  `src/services/stHost/transcriptCopiers.ts`. Invariant in `.claude/rules/architecture.md` §Memory and privacy names the
  check ("the `transcript-copiers` check names them").
- **Removed spike:** `witnessFilter.ts`, `witnessFilterHost.ts`, `wiring/spikes.ts` listed in `DROPPED_SPIKES`
  (`src/runtime/lazyHarness.guard.test.ts:22-23`, planted import `:134`). `SPIKE_FLAGS` does not list it
  (`src/runtime/settingsModel.ts:105`).
- **Held secrets:** `heldSecrets()` turns active `[hiding]`/`[unaware]` rows into `HeldSecret {phrasings, knowers,
  onlyFrom}` (`src/memory/heldSecrets.ts:21-35`); `keptFrom`, `withoutSecrets`, `withoutSecretLines`, `sharedTierView`,
  `ledgerWithoutSecrets` redact per member (`:42-105`). `memoryInjector.readModels()` exposes `secretsHeld`
  (`src/runtime/memoryInjector.ts:85-89`); private block per drafted member (`:119`, `onMemberDrafted` `:254`).
- **Scene read `present`:** the judge scene read asks `present:<rosterId>` per cast member
  (`src/judge/scene.ts:98`), thresholds at `PRESENT_P` 0.7 (`src/judge/policy.ts:59`, `scene.ts:145`), and the
  coordinator keeps **only the latest** `SceneReadRecord` (`src/runtime/coordinators/sceneCoordinator.ts:127-129`,
  `setScene`). There is no per-message or per-scene history of `present`. It is physical presence, not hearing.
- **Nearest existing witness signal:** the epistemic pass already has a `WITNESS` rule ("only some of the characters
  present observed something → a `[knows]` line for each", `src/memory/contract.ts:140`) and `dropCommonKnowledge`
  drops a `[knows]` given to ≥ 3 or everyone present (`src/memory/epistemic.ts:203-220`). These are fact rows, not a
  per-message witness set, and asymmetry-only by design (`contract.ts:138`).
- **No witness line** in the shared read. Its parse returns `facts, memory, arcs, epistemic, ledger`
  (`src/extraction/sharedRead.ts:289-295`).
- **v2.8 21 E0 (A12):** declarations and floors committed on branch `v2.8-a12-e0` (`6f2dc2d1`, code
  `src/memory/e0Ranking.ts` there); synthetic freeze recorded, private freeze owed; not on master yet.

## 4. Design options

| | Design | Cost | Risk | Needs |
|---|---|---|---|---|
| **A. Block level + host-channel alert** | Built (v2.7 02 C2, K1/K2 `7ee079f2`) | done | none known | — |
| **B. Extraction witness source, measurement first** | The shared read emits one `WITNESS` line per message in its window: `WITNESS m=<id> heard=<member,…>`, parsed into a persisted per-chat witness record keyed by message id (reverses with the message). Scored offline against labels **before** any filter | M: contract line + parser + record + scorer | prompt tokens on every read; may crowd out DELTA recall | W4 / W4n / Wc floors (§7) |
| B′. Separate witness pass | Same record, from its own model call per window | M+, one more call per read | doubles read cost | only if B's Wc fails and W4 passes |
| **C. Host-channel-aware filter** | B's record + our interceptor **splices** unwitnessed messages from `coreChat` (H5), closing the WI-scan and Vector Storage channels; Summarize stays open (H6) and A keeps warning | L: filter, depth-shift handling, nonce re-measure | stance change; depth injections move; a wrong witness hides what a member saw | B passes; F1–F6 (§7) |
| D. Drop for good | Block level + A only | 0 | characters keep "knowing" missed scenes | — |

## 5. Recommendation

**B now, offline; C only after B passes.**

1. Add the `WITNESS` line family to the shared read behind its own contract section, parse it into
   `extras.memory.witness` (per message id: `heard` roster ids, `source` read id, `window`). Rows drop with
   `rollbackEpistemic`-style keying on message id; `rollback ≡ replay` property case.
2. Score offline: the lab's 40 labels, then ≥ 40 labels from real group session transcripts (second model writes,
   third checks; disagreements dropped). No filter code until W4 passes on both sets.
3. If W4 passes and Wc fails, try B′ before giving up. If W4 fails, record it and stop: block level stays the stance,
   v2.8 43 runs on the presence proxy only if v2.8 21 §6.2 passed on it.
4. C, if reached, splices (never flags) and is measured with nonce markers. It is on by default once built (v2.8 rule
   9); the owner can switch it off.

The witness record is useful without C: v2.8 43 filters recall by it and v2.8 44 uses it to decide who overheard what.

## 6. What C would add (only after B)

- Filter in our interceptor (`loading_order` 1, H1): per drafted member, splice unwitnessed messages from the
  interceptor's `coreChat`, never the chat. A message with no witness row is kept (fail open on missing data, fail
  closed on a recorded "not heard").
- Depth-shift handling: our own depth injections are recomputed after the splice; F6 measures that they land at the
  same position relative to the kept messages.
- Summarize: no per-member form exists (H6); A's alert keeps naming it. No story requirement may force it off
  (v2.9 02 decision 4, kept).

## 7. Predeclared floors

Committed before any run; never retuned (v2.8 rule 2).

**B:**

| # | Condition | Floor |
|---|---|---|
| W4 | Extraction witness vs labels, exact-set agreement per message | ≥ 0.9 on the lab's 40 labels **and** ≥ 0.9 on ≥ 40 real-session labels (labelled before scoring); route recorded |
| W4a | Asides subset (messages heard by a strict subset of present members) | ≥ 0.8; presence's 4/40 shape (aside scored as "all present") counts as a miss |
| W4n | Null control: presence-as-witness on the same sets | reported; B must beat it on W4a by ≥ 0.3 |
| Wc | Cost | added prompt tokens per read p95 ≤ 120; live suite per-tier floors unchanged (`so-live-suite.mts`, `plotDeltaAccuracy` not below its last green) |
| Wr | Reversal | witness rows after swipe/edit/delete equal the replay of the kept messages, 0 diffs over 4 seeds |

**C (only after B; v2.5 bars restated):**

| # | Condition | Floor |
|---|---|---|
| F1 | No chat mutation by us | 0 of our symbols in chat/`extra` (host writes recorded, not excused) |
| F2 | Filter correct, nonce markers per message | 0 nonce hits in any drafted request with Summarize off and Vector Storage on/off as separate rows; Summarize-on row reported, expected to fail |
| F3 | Extraction and rollback | J5 + J6 ×2 with C on |
| F5 | Cost | interceptor p95 ≤ 5 ms |
| F6 | Depth injections | every `INJECTION_REGISTRY` block at the same position relative to kept messages, with and without C |

## 8. Gates by tier

**Implementation (D):**
- B: `npm run gates`; jest for the `WITNESS` parser (malformed, unknown member, out-of-window id refused), the record's
  `rollback ≡ replay` property case (Wr), the scorer (exact-set, asides subset, planted all-present control must fail
  W4a), shared-read contract golden updated.
- C: `npm run gates`; jest for the splice (missing row kept, "not heard" removed, own injections re-placed), F6 as a
  payload golden (`so-payload-golden.mts`, no model call).

**Acceptance:**
- B (CL): offline W4/W4a/W4n on the lab + real-session sets through the extraction route; Wc via `so-live-suite.mts run`
  with per-tier floors; ×2, run header diff around the batch.
- C (RP or LT): F1–F6 live ×2 on an adolion-fresh lane, run header diff around each batch; record names the tier.

## 9. Privacy and spoiler notes

- Real-session labels come from Adolion transcripts: written by one model, checked by a second, never shown to the
  owner (v2.8 rule 11). Labels and scored rows live in private `so-sessions`; only hashes, counts and scores here.
- Nonce markers are random per message and never shown in the player UI.
- The witness record is per chat, in `chat_metadata`, never written to World Info.
- Player surfaces must not change with the presence of a witness row or a held secret (K1 rule carried).

## 10. Dependencies and links

- v2.7 02 C2 + K1/K2 (`7ee079f2`): option A, built.
- v2.7 03: group chats only.
- v2.8 21 (A12, branch `v2.8-a12-e0`): E0 ranking + §6.2 presence-proxy evaluation; its VR1/VR2 result decides
  whether v2.8 43 may start from presence.
- v2.8 43 verbatim recall: consumes the witness record (P5).
- v2.8 44 rumors and gossip: uses the record to decide who overheard; pairs with this plan.
- v2.8 15 cue + scene read merge: B adds a line family to the same read.
- v2.8 13 J7.3 (epistemic via the judge): a possible second witness source; not scored here.
- v2.9 02: history kept, status "moved to v2.8 42".

## 11. Decisions for the owner

1. Run B (extraction witness line, offline measurement, no filter)? **Recommended: yes.**
2. Line inside the shared read (B) or a separate pass (B′)? **Recommended: inside the read first; B′ only if W4 passes
   and Wc fails.**
3. If B passes, build C (message-level filter, a stance change)? **Recommended: decide after B's record; default no
   unless sessions show characters acting on scenes they missed (not only secrets).**
4. Should a story be able to require Summarize / chat vectors off? **Recommended: warn only (kept from v2.9 02
   decision 4).**
5. Witness labels from real sessions: who writes them? **Recommended: one model writes, a second checks, disagreements
   dropped; the owner never sees them.**

## 12. Unresolved questions

- Whether one `WITNESS` line per message fits the read's output budget on long windows (Wc decides).
- Muted onlookers and characters drafted later in the same turn: the label rubric must say whether "in the room,
  not addressed" counts as heard (rubric written before labelling).
- Whether the judge scene read should keep a `present` history for W4n, or W4n is computed offline from transcripts.
