# Plan 02 — SP9 witness filter, v2

**Status: DEFERRED to v2.9 (user, 2026-10-03).** Was v2.7 plan 22; moved at the version split
(`docs/plans/v2.7/RENUMBER.md`). Not scheduled until v2.8 closes. Its option A shipped as **v2.7 02 C2**; what stays
here is the witness source (B) and the message-level filter (C). Source: `docs/plans/v2.6/v2.7-seeds.md` row "SP9
witness filter, v2". Overview: `00-overview.md` (this folder).

## What it is

- In a group chat every drafted member's request carries the whole transcript, including asides and scenes that member
  was not present for. So a character can "know" what it never heard.
- SP9 tried hiding unwitnessed messages from each drafted member's request, on the interceptor's copy, without touching
  the chat. That would change the product stance from "no message-level hiding; private knowledge by prompt block only".
- v2.6 dropped it. The only witness source (scene presence) was wrong 90 % of the time. Two ST extensions (Summarize,
  Vector Storage) re-inserted the hidden text through their own channels. And the model copied the test markers, which
  polluted the measurement.
- v2 = a design aware of those host channels, with a better witness source, or a decision to stay at block-level privacy.
- Stories run in group chats only (v2.7 03), so this is the only chat shape it concerns.

## History and evidence

**Bars** (`v2.5/09-research-spikes.md` §SP9, lines 239–260):

| # | Condition | Bar |
|---|---|---|
| F1 | No chat mutation | byte-identical chat file and `extra` |
| F2 | Filter correct | 0 unwitnessed messages in any drafted request, 100 % of witnessed kept |
| F3 | Extraction and rollback unaffected | J5 + J6 ×2 with the filter on |
| F4 | Witness source accuracy | ≥ 0.9 of 40 labels |
| F5 | Cost | interceptor p95 ≤ 5 ms |

| When | Leg | Result | Citation |
|---|---|---|---|
| v2.5 jest | F1, F2 | pass on the toy transcript (61 witnessed checks); controls caught | `v2.5/09-sp9-spike-report.md:54-55` |
| v2.5 live ×2 | F1 | FAIL as declared: host writes (`extra.memory` from Summarize, `extra.reasoning` from ST), none by the filter | `:54` |
| v2.5 live ×2 | F2 | 13 and 6 unwitnessed hits, all from ST Summarize's own quiet generation; **0** with Summarize's interval at 0 (427 checks) | `:55` |
| v2.5 live | F3 | J5 7/7 ×2; J6 failed on the shared-read throw (product defect, since fixed `7663bbb0`) | `:56` |
| v2.5 live ×2 | F4 | 0/40. Presence sets held name + roster id twice; name-only reading 0.80 / 0.825 | `:57` |
| v2.5 live | F5 | p95 0.20 / 0.10 ms → PASS | `:58` |
| v2.6 lab | F1 | FAIL as declared (ST's `extra.reasoning: ""` write; 0 own symbols) | `:122` |
| v2.6 lab | F2 | Summarize on: not measured (Summarize's quiet pass blocked generations 10–11). Summarize off: witnessed kept 432/432, **41 unwitnessed visible**. Diagnostics: the leaks sat in Vector Storage's `Past events:` block. With Vector Storage really off, 35 hits remained, **all model mimicry** (the model ends replies with marker-like tokens) | `:123`; `v2.6/03-sp9-restated.md` addendum |
| v2.6 | F3 | not run (F2, F4 already fail) | `:124` |
| v2.6 lab | F4 | presence vs 40 pre-run labels **4/40 = 0.10**, exactly the lab's prediction ("presence is not hearing": asides, muted onlookers) | `:125` |
| v2.6 | F5 | p95 0.3–0.5 ms → PASS | `:126` |

The v2.6 setup was lane 2, adolion-fresh at `e1c91fb`, dev bundle `ceb15ac19ec0`. Lab `lab/witness/`: 37 messages,
11 asides, 24 generations (8 members × 3), 40 labels written before the run, 9 secrets (`v2.6/03-sp9-restated.md`
§What changed). Records: `test/measurements/v2.6-03/sp9/summary.json`.

**Verdict: drop**, removed in `301b0d5a`. **The "no message-level hiding" stance stays**: private knowledge by prompt
block only (`v2.5/09-sp9-spike-report.md:136`). The worth review allowed a v2 seed only "if a witness source (extraction,
not presence) clears F4 first, with Summarize/Vector Storage/WI-scan named as channels to close".

**Since then, the same host channels showed up in real play.**
- v2.6 T2-2 found secrets in other members' prompts through **our** shared memory tiers. The fix wave made private
  knowledge per drafted member at block level: sentence-level redaction of the shared tiers against `[hiding]`/`[unaware]`
  rows (`v2.6/14-findings.md` T2-2 item 1; commits `a19c7023`, merge `f0e62687`).
- The same finding lists ST Summarize (`1_memory`) and Vector Storage (`3_vectors`) as host leaks. These are "not ours".
- v2.6 T7 saw a secret in another member's prompts through our `[Recent events]` block and ST Summarize's `[Summary]`
  (`test/sessions/T7/SUMMARY.md:15`). The fix above landed after that session.
- v2.6 T6-4 (`97156c2f`) then shipped a block-based author-only Repair row, and v2.7 02 C2 (`e4eb410a`) extended it into
  a settings read plus a player alert (§Current state).

## Why it was deferred

- F2 and F4 failed as declared. F4 is the root problem: no witness source we have is accurate.
- A correct filter is still not private while other extensions build prompt text from the whole chat.
- Shipping the stance change would promise a privacy the host does not keep (`v2.5/09-sp9-spike-report.md:135`).
- User 2026-10-03: option A yes (built as v2.7 02 C2); message-level privacy kept "as a candidate for next version".

## Current state in code

Verified on master `c7967323`.

- **Removed:** `witnessFilter.ts`, `witnessFilterHost.ts`, `wiring/spikes.ts`, the `spikes.witnessFilter` flag, the
  fixtures (`301b0d5a`). Guarded by `DROPPED_SPIKES` (`src/runtime/devOnly.guard.test.ts:29-32`). `SPIKE_FLAGS` no longer
  lists it (`src/runtime/settingsModel.ts:87-90`).
- **Block-level privacy in prod:**
  - Per-member epistemic staging (`onMemberDrafted`).
  - Per-member checkpoint guidance (v2.6 C13: `guidance {all, members}`, `v2.6/04-remaining-builds.md:413`).
  - Per-member redaction of shared memory tiers and the ledger (`src/memory/heldSecrets.ts`, `src/runtime/memoryInjector.ts`;
    test `src/runtime/secretSpread.review.test.ts`).
- **Host-channel warning: built (option A = v2.7 02 C2).**
  - Settings read `src/services/stHost/transcriptCopiers.ts` (Summarize on; `vectors.enabled_chats`), unioned with the
    v2.6 T6-4 block read (`1_memory` / `3_vectors` prompt present) in `src/runtime/transcriptCopiers.ts` `secretLeaks()`
    → `snapshot.secretLeaks` (`src/runtime/snapshotBuilder.ts:213-214`).
  - Surfaced through the check registry: `SECRET_LEAK_CHECK` (`transcript-copiers`, area privacy, **audience player**,
    severity degrades; `src/runtime/checks.ts:45-60`) → Repair, settings and the HUD `#so-hud-setup` chip.
  - **Known defect K1 (review 2026-10-03, urgent, fix owned by v2.7):** `secretLeaks()` returns `[]` unless a secret is
    held, while the check's audience is `player`. So the player alert appearing reveals that a hidden `[hiding]`/`[unaware]`
    row exists. Fix: the player copy shows whenever a copier is on in a group story; `secretsHeld` gates only the author
    detail. Gate: identical player-visible output with and without held secrets. K2 updates the held-secret invariant in
    `.claude/rules/architecture.md` (it still says "author-only Repair row") together with K1. This plan does not fix
    K1; it must not be reopened on top of the unfixed form.
- **No witness source exists.** Presence was spike-only. Extraction has no witness line. The scene read records a
  per-scene `present` set, which v2.8 21 uses for its offline witness proxy.

**Host facts** (ST `7c3994196`, read from source; the last two are not measured):

| # | Fact | Where |
|---|---|---|
| H1 | Interceptors run in ascending `loading_order`. Ours is 1, Vector Storage's 100, so ours runs first | `public/scripts/extensions.js:49,2033`; our `manifest.json:3`; `extensions/vectors/manifest.json:3,8` |
| H2 | `IGNORE_SYMBOL` empties the message only at formatting time. The message stays in `coreChat` | `public/script.js:5838-5841` |
| H3 | The World Info scan buffer is built from `coreChat` text after the interceptors, without checking the symbol | `script.js:4564,4624` |
| H4 | Vector Storage's interceptor walks the `chat` array it is given, takes the messages whose text hash matches the query, **splices them out** and re-inserts their text as `Past events:` | `extensions/vectors/index.js:776-854` (template `:88`) |
| H5 | So a message **spliced out** of `coreChat` by our interceptor (instead of flagged) would not be in the WI buffer (H3), nor findable by Vector Storage (H4). Not measured. Splicing changes message counts, which shifts depth-based injections; that is why ST offers the symbol (`script.js:5839` comment) | inference from H3/H4 |
| H6 | Summarize builds one summary from the **live** chat (`context.chat.slice()`), not the interceptor's copy, and injects it into every generation. No per-member form exists | `extensions/memory/index.js:785`; `v2.6/14-findings.md` T2-2 |

## Options

| | Design | Cost | Risk | Needs |
|---|---|---|---|---|
| **A. Stay at block level, warn about host channels** | **Built as v2.7 02 C2** (player alert + author detail through the check registry; K1 fix in v2.7) | done | the K1 leak until fixed | — |
| **B. Witness source first (measurement only)** | An extraction-sourced witness: the shared read emits a witness line per message, or a per-scene pass does. Score it offline against the lab's 40 labels and real session transcripts, **before** any filter exists | M (prompt + parser + scorer). One more line family in the shared read, or one more pass | Prompt cost on every read. Could crowd out DELTA lines | F4 restated for extraction; 40 lab labels + ≥ 40 labels from real sessions |
| **C. Host-channel-aware filter** | B's source + a filter that **splices** unwitnessed messages out of the interceptor's `coreChat` (H5), closing the WI-scan and Vector Storage channels. Summarize stays an open channel (H6), so A's alert keeps warning about it. Re-measure F2 with per-message nonce markers that the model cannot predict, so mimicry cannot score as a leak | L. Filter + depth-shift handling + persisted witness records (v2.5 found in-memory records forget everything on reload, `v2.5/09-sp9-spike-report.md:110-111`) | Changes the stance. Depth-based injections move. A wrong witness hides what a member did see. Silent when another extension adds a new channel | B passes F4 first; user decision 2 |
| **D. Drop for good** | Nothing beyond today's block-level privacy and A's alert | 0 | — | — |

## Recommendation

**A is done (v2.7 02 C2, once K1 is fixed).** Block-level stays the stance:
- Our own blocks are now per member.
- The remaining leaks are host extensions we cannot filter per member (H6), and the alert names them.

**B only if message-level privacy becomes a goal.** It is the cheapest honest next step: no filter is built until a
witness source clears F4. **C not before B passes.** v2.8 21's offline presence-proxy measurement is the first data
point: if presence-from-scene-read clears its "no unwitnessed text" floor there, B may start from it; if not (v2.6
measured 4/40 at message level), B needs an extraction witness line.

## Decisions for the user

1. Build A (Repair row warning about ST Summarize / chat vectors in group stories that hold secrets)?
   **Recommended: yes.** (Carried into v2.7 as `02-v26-carry-in.md` C2; v2.6 takes no more changes.) yes
2. Is message-level privacy ("a member never sees a scene it was absent from") a product goal, or is block-level privacy
   ("secrets live in private blocks; the transcript is shared") the permanent stance? **Recommended: block-level stays.
   Revisit only if sessions show characters acting on scenes they missed in the transcript (not only on secrets).** Ok, lets keep it around as a candidate for next version
3. If 2 = goal: run B as a measurement-only spike? **Recommended: yes, offline first (lab labels), no filter code.** as you recommend
4. If C is ever built: should a story be able to require Summarize / chat vectors off (a requirement that blocks), or only
   warn? **Recommended: warn only. They are the user's install-wide tools.**  Lets do as you recommend

(Answers kept verbatim. Decision 1 is built as v2.7 02 C2; the "next version" in decision 2 is this v2.9 plan.)

## Floor and measurement before building

- **A:** built; its gates are v2.7 02 C2's plus K1's (identical player-visible output with and without held secrets).
- **B (predeclared, committed before any run):**

  | # | Condition | Floor |
  |---|---|---|
  | W4 | Extraction witness vs authored labels | ≥ 0.9 exact-set agreement on the lab's 40 labels **and** on ≥ 40 labels from real session transcripts (labelled before scoring), route recorded |
  | W4n | Null control | presence as v2.6 measured it (0.10) is the floor to beat by construction; a source that matches presence on asides fails |
  | Wc | Cost | added prompt tokens per read and DELTA-line recall unchanged within the live suite's floors (`so-live-suite.mts`, per-tier) |

  Labels from Adolion session transcripts are written and checked by a second model, never shown to the user (review
  B4, no-spoiler rule); the labelled set lives in the private `so-sessions` repo.

- **C (only after B):** F1–F5 as v2.5 declared, with these changes stated before any run:
  - F2 uses nonce markers.
  - F2 runs with Summarize on, with Vector Storage on and with both off, as separate rows. Summarize-on is expected to
    fail and is reported, not excused.
  - F3: J5 + J6 ×2.
  - Plus a new F6: depth-based injections land at the same depth with and without the filter.

## Gates

- A: built (v2.7 02 C2 gate record; K1 fix in v2.7).
- B: extraction prompt change → `npm run gates` + live suite (`so-live-suite.mts run`, per-tier floors) + the W4 scorer.
- C: as SP9's original live legs, ×2 on an adolion-fresh lane, run header diff around each batch.

## Links

- v2.7 02 C2 (option A, built) and K1/K2 (its privacy fix and invariant update, v2.7).
- v2.7 03 group-chats-only: stories are group-only; no solo variant of this plan.
- v2.8 21 smart-context harvest: its runtime verbatim recall (P5) needs B's witness records; v2.8 21 does E0 + the offline
  presence-proxy evaluation only, runtime recall waits here (`05-deferred-items.md`).
- v2.7 10 / v2.8 01 SP2 re-commit v2: the other dropped spike that needed a new design.
- v2.8 20 character life: richer characters raise the cost of a character "knowing" what it missed.
- v2.8 12 J6d shadow record, v2.8 13 J7 judge ideas (J7.3 epistemic via the judge could feed a witness source).
- v2.8 15 cue + scene read merge: B adds lines to the same shared read.

## Review 2026-10-03

Applied from `docs/plans/v2.7/review-2026-10-03.md` (old numbers there): **C8** (current state reflects built v2.7 02 C2
and code finding **K1**/**K2**), **F07** (deferred status), **B4** (second-model labels for Adolion evidence), **B11**
(`SPIKE_FLAGS` at `settingsModel.ts:87-90`), **B12** (version-qualified refs), **F36** (cross-refs to new numbers), split
item 9 (runtime verbatim recall waits on this plan). Group-only per v2.7 03.
