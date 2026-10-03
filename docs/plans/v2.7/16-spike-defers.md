# Plan 16 — SP5/SP6/SP1/SP10 defers (index)

**Status: SEED from v2.6, not approved.** Source: `docs/plans/v2.6/v2.7-seeds.md` row "SP5/SP6/SP1/SP10 defers". Split
2026-10-03 into one self-contained plan per spike; this file is the index. Overview: `00-overview.md`.

v2.6 plan 03 re-ran the v2.5 spikes on the Adolion lab and gave each a call (`v2.6/03-spike-reevaluation.md`). Four were
left over: SP5 was included but its build (`SP5.b`) never landed, and SP6, SP1 and SP10 were never run
(`v2.6/14-review-pack.md:449`). Each now has its own plan with history, code state, options, a proposal, decisions,
floors and gates. Plan 02 rows C1 (SP5) and C5 (SP6/SP1/SP10) point at these files.

| Spike | File | Recommendation | Tier |
|---|---|---|---|
| SP5 story-owned scenario | `16a-sp5-story-scenario.md` | build `SP5.b` (typed `effects.scenario`, out of the dev chunk, Studio field, C5 note in author view); triage the T7 red first; scenario stays held while requirements are unmet | 1 (live legs make no model call); listed under 3 until the user moves it (16a decision 5) |
| SP6 complication pool | `16b-sp6-complication-pool.md` | measure K2–K5 here (~3 lane-hours); on PASS build in plan 19 Q6 as the pacing tool shared with plan 17's pressure; on FAIL drop | 3 |
| SP1 swipe-back cache | `16c-sp1-swipe-back-cache.md` | park: code stays dev-only, add a swipe-back counter, decide at 300 of the user's own player turns or v2.7 freeze; likely drop | none now (S4 from the user's play); 3 only if reopened |
| SP10 tool-call turns | `16d-sp10-tool-call-turns.md` | README note on tool-calling turns + remove the dev-only Q1 probe | 1 |
