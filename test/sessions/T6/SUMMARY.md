# T6 summary

## T6-4 Judge off (lane 2, `test/sessions/T6/T6-4-1` VALID)

- **T6-4-1 (VALID):** played 2026-10-02 15:48-16:08Z on lane 2 (seeded at pin be0696b, then `start --no-seed`, see harness), served bundle `133b12aa92a0` (dev, master `811d19d6`), media off, thinking overlay default, judge fully off (master switch and every use). Player mode, persona Max Nightriver, chat `2026-10-02@12h47m22s751ms`. 11 player turns, T2-2's lines plus the card's "I'll stand as the Crown's second.", 2 flags. Route nightriver-house -> fathers-summons (turn 3) -> whispers (turn 5, the stop condition) -> the-duel (turn 11). Stop: header diff 0 blocking (warning: repo `dist` rebuilt mid-run, served bundle unchanged); `assert-player-clean` ok; lane 2 left unleased.

| Row | Score | Evidence (T6-4-1) |
|---|---|---|
| silent fallback | works | x-judge-fetch-count-end.json, evidence-*.json judgeCalls [], session.json spend |
| speaker direction without judge | works | turns.jsonl:1, journal.jsonl:14, :17, :30 |
| memory without judge | annoying | payloads.jsonl:65, :143, evidence-*.json epistemic (retired@5) |

Live checks (detail in `T6-4-1/findings.md` "Live checks"): 0 requests to the judge plugin (in-page counter), `extras.judge.calls` empty, meter 0; director = LLM director (7) + mention rule (3); warden stood down silently (no record); lore select = ST keyword scan (20 fired rows, no lore flags); memory verify skipped (72 rows, 0 verifyDrops); all 20 loud TC requests carry the 5 `reasoning_budget_*`/`generation_prompt` keys with budget 400 (the 3 without are ST Summarize quiet calls); `selected_world_info` [] at start and end, the 4 books met by `story`; empty replies 0 of 20 (17 with reasoning, 1146-1667 chars, no leaks); DeepSeek 73 calls all primary (0 fallback, 0 failed), 166,951 in / 27,652 out; no judge notice, error or console error.

Must-not checks: no judge-unavailable message (none); no stall T2-2 lacked (the digest's whispers stall is an evidence-count read issue, it advanced 3 min later; T2-2 ended at whispers); **Natalia learned about the seals** (msg 15, flagged), and Ronan recited Shiya's private report (msg 24, flagged): same class as T2-2, not worse.

Findings:
- HIGH (product, carried from T2-2, judge-independent): the secret reaches excluded members outside the private block, through session-details memory, the ledger and ST Summarize (`payloads.jsonl:65`, `:143`).
- MEDIUM (product): every `[hiding]` epistemic row retired at its creation boundary (`retired@5`, `retired@8`), so no hiding row reaches a private block; cause unverified.
- MEDIUM (product): the mention rule drafted Natalia after "Natalia must not hear it." (`journal.jsonl:17`), as in T2-2.
- MEDIUM (extraction): the monotonic count `evidence` was re-read as 1 eight times after a second authored clue (`journal.jsonl:201`-`:330`), parking whispers 10 boundaries until a reconcile set 3.
- MEDIUM (pacing): the-duel's herald post (msg 33) skipped past Natalia's direct question (msgs 31-32).
- LOW (voice): narrator messages open "Shiya:" (msgs 4, 21) and speak Natalia's lines (msg 32).
- Harness: `adolion-fresh seed` fails on `$.selected: length 16 vs 0` for any lane whose last good seed predates cf9ce13c (`lastGoodSeed` never moves past it); `start --no-seed` after a clean `adolion-fresh check` was the workaround. `media.variant "full"` label while media is off. Judge plugin `/status` has no served-call counter.
- Spend: DeepSeek 73 calls 166,951 / 27,652; judge 0; main RP 23 requests (20 loud + 3 ST Summarize). Pod about 30 min (seed 15:37-15:45 + play 15:48-16:08).

## T6-3 Harness routing (lane 1, `test/sessions/T6/T6-3-1` VALID, harness route NOT exercised)

- **T6-3-1 (VALID):** played 2026-10-02 15:46-16:20Z on lane 1, using `start --no-seed` after the seed failed the drift check (as in T6-4). Served bundle `133b12aa92a0` (dev, master `811d19d6`), media off, thinking overlay default. Author mode. Stop: header diff 0 blocking, with the wizard allowance covering +4 cards, +1 book, +1 group and +1 story (`the-redrawn-kingdom@1`); the repo `dist` was rebuilt mid-run but the served bundle was unchanged (warning).
- **Blocker (host config):** opencode is not offered. The ST plugin dir `plugins/story-orchestrator-harness/` has no `config.json`, so `/status` reports `offered:false`, `agentBridge:false` and `cacheWarm:false`, and the settings panel offers no harness. Enabling it is a host-owner change in the shared ST tree, so it was not made. The harness-vs-local question stays open until `config.json` sets `{"harnesses":{"opencode":{"offer":true}}}`, the opencode cache is warmed, and T6-3 is re-run.
- What ran instead:
  - Fallback visibility: the Wizard role was routed to `harness:opencode:openai/gpt-6-astra-fast` by a settings write, then both wizard entries were run. Both refused and neither fell back to the local route.
  - The local-route agent wizard in review mode: 1 run plus New goal plus 4 Continues, 47 review cards accepted, 17 provisioning cards applied one by one. Story saved.
  - The Envoy Marrow group gap was fixed by hand with `/member-add`.
  - 9 player turns, 1 flag.

| Row | Score | Evidence (T6-3-1) |
|---|---|---|
| harness route | not-noticed (not exercised: not offered) | shots/002-capabilities-harness-unavailable.png, shots/003-authoring-unavailable-harness.png, console.jsonl:2 |
| fallback visibility | annoying | shots/006-agent-call-failed-harness.png, shots/004-authoring-test-result.png, console.jsonl:2, :30, journal.jsonl:666 |

Fix-wave live checks (detail in `T6-3-1/findings.md` "Fix-wave live checks"):
- Start `cast_changes` are written by names and take effect: 3 members muted, only Halden spoke for 7 turns, Marrow was enabled at courier_offer, 0 `CAST_UNRESOLVED`.
- Agent output: the one done summary matched the draft; 0 `patch: {}`; drive and motive cards preview real values.
- Reply budget: 10/10 loud TC requests carry the 5 `reasoning_budget_*`/`generation_prompt` keys with 400; the 2 without are ST Summarize.
- Lore: the story book is met by `story` and its entries fired; lane `globalSelect` stayed [].
- Judge plugin 1.5.0.
- Empty replies 0/10 (10 with reasoning, 0 leaks).
- Routes: every executed agent step ran local (219/219, first-try valid 182/219). The tool bridge never opened.

Must-not checks: the harness wrote nothing (it never ran). All provisioning waited for Create it: chars 163->167, books 24->25, groups 12->13. No silent fallback.

Findings:
- BLOCKER (host config): harness not offered (above).
- HIGH (product, agent): the local agent never finishes.
  - Run 1 spent 28 of 40 steps on `readGuide` and ended "Finished" at step 38 (~223k tokens), recommending "a fresh budget" while only New goal was offered.
  - The next runs looped through 219 steps and ~1.46M tokens (45 `readCheckpoint`, 28 `readStory`, 28 `lookupCharacters`, 37 refused, including 9 re-creates of its own assets) and ended Out of budget.
- HIGH (product, agent): the group was created before the 4th card and never updated, so the saved story was not ready in its own group (shots/020). The agent believed provisioning was done.
- MEDIUM (product): invalid values (`tension_target` 1/3/5/"high", `agency` as a string) are dropped silently and reported as "this changes nothing in the draft", which drives retry loops. A mixed card was accepted showing only its valid half.
- MEDIUM (product UX): harness failures show only "…failed; the details are in the browser console", and the role Test says "failed its self-test" with no reason. The actionable reason is in the console only.
- MEDIUM (wizard story): every gate is `>= 1` and the Varn members are never enabled. The finale came at turn 8, with Ysolde and Casimir muted through their own scene. Diagnostics said "No issues".
- LOW:
  - Contradictory lore entries (Alderhelm vs Alderan, both fired); greeting names "House Vell".
  - A no-change requirements card was offered.
  - The ledger omits the created group.
  - New goal drops the previous run's transcript.
  - The agent refusal with no chat open is not in the model-call ring.
- Harness:
  - Seed drift (`$.selected 16 vs 0`) as T6-4.
  - No so-session/so-ui verb to accept agent review cards or apply agent provisioning cards (an operator loop was used, `x-accept-loop.js`).
- Spend: DeepSeek 273 calls, 1,679,980 in / 42,628 out, all primary. Judge 51 (4 timeouts). Main RP 12 (10 loud + 2 ST Summarize). Pod about 25 min of play. Assets left on lane 1's copy.
