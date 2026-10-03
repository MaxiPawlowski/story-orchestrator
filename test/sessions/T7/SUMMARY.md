# T7 summary

## T7 Freeze (lane 4, `test/sessions/T7/T7-1` VALID)

- **Setup:** played 2026-10-03 06:07-07:18Z on lane 4, re-seeded fresh by `so-session start T7 --lane 4` (adolion-fresh, drift 0). Frozen build: tag `v2.6-freeze-1` = master `10a74535`; run header served dev bundle `6b4715ad8f9d` at both ends, judge plugin 1.6.0, harness 1.2.0. Media off, player mode, default settings (reply thinking on, medium budget). Main reply `Artemis RunPod RP` on pod `56mm8ipo8octok` (shared with the final suite); orchestrator roles on DeepSeek flash. `stop` valid, no problems, no warnings; lane 4 stopped.
- **Played:** 27 turns + 5 mutations (swipe-new ×2, delete last, edit, regen), 1 flag. Overview opened 3×, Memory 1×, player mode only. Round latency p50 97 s, max 333 s (two requests in parallel on the shared pod).
- **Checkpoints:** guild-hall → road-to-wendhope (turn 5) → gen_on-the-road_1 (generated, turn 10) → at-the-walls (turn 17) → first-night (turn 21, boundary 30); ended at boundary 45 mid-scene.
- **Rubric:** overall = **works**; would you ship it? = **annoying** (see verdict). `rubric.json`.

### Earlier-tier findings checked

| Finding (tier, sev) | Result | Evidence |
|---|---|---|
| T6-1-2 swipe out of a generated checkpoint freezes the story (HIGH) | did not reappear: delete last, then swipe of the reply that moved gen_on-the-road_1 → at-the-walls; rollback `applied`, re-commit, boundaries kept advancing to 45, no console errors | `turns.jsonl:20-22`, `console.jsonl` |
| T2-2/T6-4 secret spread (HIGH, unfixed) | **reappeared at prompt level**: a secret told to one member (msg 22) is in another member's main-reply prompts from msg 24 through our short-term `[Recent events]` block and ST Summarize's `[Summary]`; never voiced in chat; facts and epistemic blocks did not carry it | flag `journal.jsonl:988`; `payloads.jsonl:102,104,115,122,185,218,226` (1-based) |
| T6-4 [hiding] retired at birth (MEDIUM) | did not reappear (6 rows; 4 live, 2 retired 2-6 boundaries later) | `evidence-*.json` |
| T2-2/T2-5 memory duplicates (MEDIUM) | did not reappear (105 rows, max 2 copies) | `evidence-*.json` |
| T0-3/T1-2 commitment held at the hall (HIGH) | did not reappear | `turns.jsonl:4-5` |
| T0-1 raw ids in Overview (HIGH) | did not reappear; `assert-player-clean` 0 findings over 111 selectors | `shots/006,026,037` |
| T0-2 scene-direction echo / hidden truth in replies (HIGH) | did not reappear | `chat-full-*.json` |
| T0-3 transition chat note (MEDIUM) | did not reappear | `turns.jsonl:32` |
| T6-3-3 reasoning leak / T5-5 damaged name starts (HIGH) | did not reappear (0 leaks, 0 repairs needed) | `chat-full-*.json` |
| T5-1/T6-1 empty replies (MEDIUM) | did not reappear | `findings.md` |
| T1 model degeneration (HIGH quality) | did not reappear; one merged-word glitch at msg 62 (LOW) | `chat-full-*.json` |
| T1-6 tension overshoot, T0-1 stuck "catching up", T0-1/T1-1 stale Overview (MEDIUM) | did not reappear | shots |
| T1-1 runaway scripted line (HIGH) | did not reappear | `chat-full-*.json` |
| Generated road chain at the walls (MEDIUM; LOW in T6-1) | mild recurrence (LOW): at-the-walls fired 2 turns after arrival; `reached_walls` rejected 4× as evidence only in the player's line | `findings.md`, `turns.jsonl:16-19` |
| T1-6/T2-1 chain beat skip (MEDIUM) | did not reappear | `turns.jsonl` |
| Members voicing other members (LOW) | recurs at LOW; the player character was never voiced | `chat-full-*.json` |
| Narrator decides for the player (must-not) | did not happen | `chat-full-*.json` |
| Not exercised | chat switch, restart, away recap, chapters, wizard/Studio/Repair, warden review ring, judge providers | n/a |

### Other anomalies

- stall (LOW): 10 boundaries at first-night during the authored night scene, not a freeze (`journal.jsonl:1215`).
- judge timeouts (LOW): 11 of 657 while the pod was shared; fallbacks invisible in play.

### Verdict

Would you ship it? Not as-is for group play that relies on private knowledge; yes otherwise. The one must-not finding is the T2-2 secret spread (HIGH, carried since T2): fix wave started 2026-10-03, then the affected rows re-run ×2. Pod about 71 min.
