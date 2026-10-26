# v3.0 17 — Reply polish: integration review

**Status: PLANNED (owner 2026-10-26). Polish stays OFF (`characters.polish: false`) until this plan's gates pass. Source plan:
`docs/plans/v2.9/03-per-character-reply-polish.md` (S0-S2 built and merged in shadow mode; S3 auto-write not built; dropped
from v2.9 by owner decision 10).**

## Why it is off (beyond the owner's call)

1. P0 thought carry: an accepted polish makes `withoutStaleReasoning` (`src/runtime/reasoningRevision.ts`) drop that reply's
   reasoning from inner-beat carry and the reasoning harvest. That conflicts with the owner rule "thinking and inner voice stay
   on". The preserved-carry design (provenance edge in `extras.polish`) is proposed, not built.
2. Only shadow mode exists; S3 (auto write) is not built.
3. Rating floors never ran (zero change, preference >= 60 %, attribution gain). Self-rating caveat: route and rater are both Sol.
4. Shadow pilot: 24/24 untouched outside the edited sentences, but 5 accepted / 6 refused / 4 rate-limited.
5. Latency: one extra remote call per flagged reply (floors p50 <= 12 s, p95 <= 30 s, hold <= 45 s); in group rounds the next
   member usually starts first and the polish abandons.

## Review steps (in order; each gates the next)

1. Re-read v2.9 03 against the current runtime (controller round 3, chat-first queue, MTP, member cache): does the hold/abandon
   design still fit? Any new consumer of the original reply (prefix-stability A0, witness W2, promises) that polish breaks?
2. Build the preserved-carry path (provenance edge; the inner beat reads the original thought only through it) with tests;
   the K6b hide count drops to 0 on the stand-in corpus. No owner exception needed if it holds.
3. S2 rating at plan size (`test/measurements/v2.9/03-s2/`): zero change, preference, attribution. Rater: a model other than
   the polish route if available (else record the self-rating caveat). Floors as written in v2.9 03, declared before the run.
4. Decide the route: remote (Sol, rate limits) vs local (the controller's queue: cost against chat TTFT under chat-first).
5. S3 isolated-lane integration (lane 30+, `mode: "auto"`): accepted-write latency, downstream consumers, group coverage
   (>= 50 % of eligible targets), rollback/swipe behaviour; then the cross-feature regression list.
6. Owner play check with polish on; adopt only if the owner's flags (repetition, lost voice) improve.

## Inputs from the owner's playtest

Flags about repetition, tics or a character losing their voice are the demand signal. No such flags = keep it parked.

## Unresolved questions

- Local or remote polish route, given chat-first and the member cache?
- Which second model rates polish if Sol writes it?
