# T1 summary

## T1-2 Refuse the hook (lane 3, `test/sessions/T1/T1-2-1`)

- Played 2026-10-01 14:22-14:48Z, chat `2026-10-01@11h22m01s847ms`, persona Max Nightriver, served bundle `6525728b22b7`, 23 main RP requests, 16 player-side actions (14 turns, 2 swipe attempts). Stopped on The Road North with party Ash Lanterns (msg 32). `stop` valid (only `build.head` moved, served bundle identical). Author view never needed (the story did not hold: the tavern exit was taken), steward alternate not exercised.
- Start needed two retries: first `adolion-fresh seed` failed on `group Adolion - The Saga: cast left behind after its chat was left: disabled [Domas.png, Rydel.png]` (`C:\dev\so-lanes\3\adolion-fresh\report-2026-10-01T14-04-00-453Z.json`), second failed only because the inventory drifted from that failed seed (`sameAsPrevious=false`, exit 1); third clean.

| Row | Score | Evidence |
|---|---|---|
| agency (refusal handling) | annoying | turns.jsonl:4, :8, journal.jsonl:577 |
| transition timing | annoying | journal.jsonl:396, :631 |
| speaker direction | annoying | turns.jsonl:8, :20, journal.jsonl:163 |
| timeline at level 1 | works | shots/016, shots/024 |
| HUD | works | shots/006, 016, 024 |

Flags (3): msg 8 (Tobias addressed with the second refusal never answers; director hands back, composite 0.53), msg 26 (replies degrade into dropped-word garble msgs 23/25/26), msg 28 (two natural acceptances held by commit_evidence; story stuck in the tavern).

Findings:
- HIGH (product/authoring): `path` commit_evidence misses natural acceptances. The card's own beat-4 sample line "Fine. Triple the fee, and we ride as the Ash Lanterns." (msg 24) and "write us in for Wendhope as the Ash Lanterns" (msg 27) never commit: journal "1 commitment reading(s) held: no line the player wrote in the window shows the commitment" x3 (`journal.jsonl` around 577), although Ellie registered the party in-fiction (msg 28). Only "We take the Wendhope posting" (msg 29) moved the story. Pattern (`adolion-adventurer` quality `path`) has no `we ride`, `write us (in|down)`, `sign us up`(ok)/`register us`, `double it is`. Also arguable: a conditional acceptance ("triple the fee") is a negotiation.
- HIGH (quality, main RP): from ~45k-char prompts Artemis output drops function words (msg 23 "smile falis", msg 25 Dalan unreadable, msg 26 Belle). Sampler identical to early turns (DRY 0.8/1.75/allowed 2/last_n 4096, `payloads.jsonl` requests 1 vs 39/42); DRY over a 4096 window on a long group prompt is the likely cause. Recovered at msg 28 but with loops ("hard as river stones" x4).
- MEDIUM: addressed member skipped. Msg 7 names Ellie and Tobias; only Ellie answers, director then "silence"/hand back (`journal.jsonl:163` area, composite who=the player 0.53). The T0 fix ("hand-back needs no addressed candidate") does not cover a second addressee after the first answered. Many turns draft 4-6 members but render one reply (`generations.drafted` vs `received` in turns.jsonl).
- MEDIUM: narrator voices named NPCs (Tobias + Ellie, msg 28; warden flagged house-rule `journal.jsonl` stagecraft at boundary 18) and invents a nameless scarred veteran ("I'm the last one who came back", msg 22) while Rydel is enabled.
- MEDIUM: replies call the PC "the player" (10 of 16 character replies). Source: steering/agency clauses and authored guidance in the prompt ("never on a question asking the player what they do", "Let the player look over the board").
- LOW: extraction raised `guild_reputation` 0->1->2 from "The Guild will not be made a fool of" and from Tobias declining (journal deltas at boundaries 7, 19); empty private block for Dalan at boundary 15 (`payloads.jsonl:63`); road cast drops Talis although the party recruited her in play.
- LOW (harness): `swipe-new` refuses when the chat is not scrolled to the bottom (the HUD covers the off-screen arrow; turns.jsonl:5); scrolling `#chat` to the end made it hit-testable and the retry worked (turns.jsonl:7). `assert-player-clean` reports 46 findings that are the Author-view toggle tooltip ("Show gates, blackboard…") and settings-panel labels, not player leaks (`rubric.json` playerClean). The turn record calls a per-key supersession a `rollback.happened:true` (turns.jsonl:10).
- Known spike defect (effects lost after the first cast write): NOT seen. Effect ledger full, background/cast changed at both transitions (`runtime-*.json`, shots/024).
- T0 fixes: no raw ids in Overview (Overview text at end: "The Journey North", no enum values) - confirmed; no "Scene direction" echo in any reply - confirmed; no transition chat note by default - confirmed (shots/024); HUD scene titles (player names) - confirmed; refusals not counted as acceptance - confirmed ("No. We'll find something else" never committed); commitment after edit rollback and swipe-back re-commit - not exercised.
- Spend: DeepSeek 41 calls, 118982/25149 tokens; judge 210 calls (1 cached, 89 busy fallbacks at SO_JUDGE_RATE_PER_MIN=15, 15 console 429s), 1233998/125163 tokens; main RP 23 requests; cost n/a. Pod: about 26 min (14:22-14:48Z).

## T1-1 Follow the hook (lane 1, `test/sessions/T1/T1-1-1`)

- Played 2026-10-01 14:06-14:53Z, chat `2026-10-01@11h05m47s358ms`, persona Max Nightriver, served bundle `6525728b22b7`, 46 main RP requests, 28 player turns. Lane deviation: the lane plan puts T1-1 on lane 3; the lead assigned lane 1. `start` ran with `--no-seed` after the seed it launched had completed cleanly (`problems: []`) but exited 1 only on inventory drift from the previous pin (e1c91fb → 59e8821, `adolion-fresh.mts:489` treats `sameAsPrevious === false` as failure). Stopped on reaching Into Needlehaven (msg 76). `stop` valid (`build.head` moved, served bundle identical). Both provocations done (two hall turns before accepting; "*I wait.*" at the gate, msg 22). Lane 1 is now leased to T2-4.

| Row | Score | Evidence |
|---|---|---|
| transition timing | annoying | journal.jsonl:222, 304, 337, 496, 548, 675, 1303, 1905; shots/009 |
| agency (never narrates you) | works | turns.jsonl:21, 22, 37 |
| speaker direction | works | journal.jsonl:539, turns.jsonl:14, 20, 22 |
| pacing / tension | works | journal.jsonl:1095, 1103; shots/019, 001 |
| secrets kept | works | turns.jsonl:29, 30, 34 |

Flags (5): msg 16 (at Wendhope's gate, but the story is in a generated road beat: HUD "First Night on the Road" in daylight, Overview Recently "moved into Turned Away at the Gate"), msg 23 (stall at the gate: the wall voice never answers for two rounds), msg 54 (scripted "The light is going…" line right after dawn), msg 63 (same line twice in a row), msg 68 (runaway: same line 6 times, maxTriggers 2).

Findings:
- HIGH (product): runaway `npc_replies` `sceneBreak` scripted line. what-wendhope-knows' "The light is going. Along the wall, Halena…" (authored `maxTriggers: 2`) posted at msgs 54, 62, 63, 66, 67, 68, 71, 73: three back to back after one turn. `firedNpcReplies` keys carry a scene counter (`what-wendhope-knows:sceneBreak:Adolion Narrator:0:8` … `:0:13`, runtime-2026-10-01@11h05m47s358ms.json:14816), so the cap is per scene. Each scripted post is a `command` message that commits a boundary, the scene detector then sees another break, and the line fires again. It floods the chat, and the narrator copied "the light is going" into a morning scene (msg 75). Flags turns.jsonl:28, 33, 35; shots/032.
- MEDIUM (product): a latching quality's pending true read was discarded by a later false read over the same turns. `reached_walls=true` (msgs 12-19, journal.jsonl:466) was dropped at boundary 13 as superseded by a cadence read saying false (journal.jsonl:496), which held the story in generated road beats for about 4 more rounds.
- MEDIUM (product/quality): the generated chain for on-the-road ran while the party stood at the walls (road-to-wendhope → gen_on-the-road_1 → _2 on the narrator's one-message "after a few days… they reach Wendhope", msg 13; first_camp=true was read from that skip). The HUD said "First Night on the Road" (the replaced stub's inherited player_name) in daylight at the gate, while Overview Recently said "moved into Turned Away at the Gate". Two names, neither right. at-the-walls landed only at msg 25, once the narrator wrote archers (the `reached_walls` rubric requires the archers' challenge). journal.jsonl:304, 337, 548; shots/009.
- MEDIUM (product): Overview "The story so far" never refreshed after the hall. At msg 77 it still ends "Tobias had not yet written the party's name in the ledger, leaving the commitment unconfirmed" (shots/009, shots/038). The Overview showed no open-threads section at all, though the card expects the fog and the mine listed.
- LOW (campaign/authoring): the what-wendhope-knows `sceneBreak` scripted line describes dusk but fires on a morning scene break.
- LOW: "5 updates next turn" in the HUD before the first turn (T0 LOW, unchanged; shots/001). Overview showed "Repair: changes not saved yet — they go with the next save" mid-session (shots/009); digest counts 1 save-lost (journal.jsonl:1664).
- LOW (config): judge 331 fallbacks (318 busy, 13 timeout) and 41 console 429s at `SO_JUDGE_RATE_PER_MIN=15`, so the judge director and lore were mostly bypassed. Speaker direction still looked right.
- Harness: (1) `score` keeps only the first `--evidence`; extra positional paths after it are silently dropped (`so-session.mts:646`, the usage line says `--evidence <path:line|png> ...`), so repeat `--evidence`. (2) `turn` sometimes returned before the round's last reply: the narrator's msg 43 and Dalan's msg 39 landed after the next `turn` call had started, so they appear above the player line that follows. (3) The `adolion-fresh` seed exits 1 on expected pin drift (above).

T0-fix check: no raw ids in the Overview (works: "At Wendhope's gate.", forest prose; shots/009, 038); no "Scene direction" echo (works: guidance is now `[Scene state: …]`, nothing copied into chat); no transition chat note by default (works: 0 comment messages); HUD shows scene titles (works: "The Wendhope Job", "The Journey North", "Turned Away at the Gate", "The First Night on the Wall", "Into Needlehaven"); commit guard: acceptance from the player's own lines advanced the story with no "commitment held" record (works). Coordinator's known defect (effects lost after the first cast write) NOT seen: background switched at what-wendhope-knows and the effect ledger holds 21 rows.

Spend (BUDGET.md): DeepSeek 187 calls, 407052/86671 tokens (181 measured / 6 estimated); judge 168 calls (0 cached), 893434/89665 tokens; cost n/a. Main RP 46 requests. Pod: about 47 min of shared pod time (14:06-14:53Z).

## T1-3 Group direction (lane 4, `test/sessions/T1/T1-3-1`)

- Played 2026-10-01 14:14-14:57Z, chat `2026-10-01@11h14m14s121ms` (group Adolion - Fire and War), persona Max Nightriver, served bundle `6525728b22b7`, 40 main RP requests, 21 player turns (1 more failed in the harness, turns.jsonl:21), 4 flags. 13 addressed turns at the council, commission taken (msg 28), Fort Vicinitas at msg 36, 4 turns at the front incl. the Kanna parley. Stopped early at the coordinator's request (bundle restage), short of "5 at the front". `stop` valid (only `build.*` moved, served bundle identical).
- Start: first `start` died to my own 590 s shell timeout mid-seed; the second seed completed (`problems: []`) but exited 1 only because the inventory drifted from the lane's previous seed at the old pin e1c91fb (`sameAsPrevious=false`); started with `--no-seed` on that fresh seed (inventory commit = index commit 59e8821, lane held no chats).

| Row | Score | Evidence |
|---|---|---|
| speaker direction (named) | works | turns.jsonl:2,3,6,7,8,23,27 (13/13 named first) |
| speaker direction (open questions) | works | turns.jsonl:5,14,28 |
| cast changes | works | turns.jsonl:18, shots/019-at-front-hud.png, evidence-*.json effect ledger |
| secrets kept | annoying | turns.jsonl:8-9, findings.md:70 |

Flags (4): msg 5 (Vallie named, reply is stage business with no answer, then hand-back), msg 16 (Haley says outright "She is not necromancer" in open council after only the Melisande provocation), msg 48 (narrator loop "The valley is quiet." x~60), msg 51 (Kanna loop "The air is still." x~70; every later reply looped the same way, msgs 53/54/56).

Findings:
- HIGH (quality, main RP): degenerate repetition loops in 5 consecutive replies once the scene reached the front (msgs 48, 51, 53, 54, 56), each to the 600-token cap. Samplers identical to the council turns (temp 1, DRY 0.8, last_n 4096, `payloads.jsonl` requests 129-164). Same family as T1-2's garbling and T0's narrator loops.
- MEDIUM (product): 4 extraction `[hiding]` lines for Haley/Alexander rejected as "invalid epistemic line" (findings.md:70-75), e.g. `[hiding] Haley / Her doubt about the rumour ..., from the King and the council.` The secrets the card is about never reached the private store.
- MEDIUM (product or detector): empty-private-block x13 (findings.md:77): Forre, Alexander, Belle, Dalan, Kanna drafted with no private block while holding 1-9 private entries.
- LOW (product): talk log records a pick that never generates in the round (Alexander m26, `turns.jsonl:14`; Belle m39 arrived late as msg 40). Vallie's first answer (msg 5) was empty of dialogue and her second opens with the same sentence verbatim (msg 20).
- LOW: judge 183 calls, 113 fallbacks (busy, `SO_JUDGE_RATE_PER_MIN=15`; 24 console 429s); the director fell back to the LLM director 4 times without visible harm. "save not confirmed" x3 at msg 32 (findings.md:267).
- Harness: (1) `turn` closes before the group round ends: msg 40/41 (Belle, Dalan) were generated after turns.jsonl:20 returned, so the next `turn` failed on a hidden `#send_but` (turns.jsonl:21); I waited for `body[data-generating]` to clear before each later turn. (2) `adolion-fresh seed` exits 1 on any drift from the lane's previous inventory, which every campaign pin bump causes, so a fresh lane needs a second seed or `--no-seed`.
- T0 fixes touched: commitment after a real player line works (msg 28 "we take the King's commission" accepted from the player's own line, journal.jsonl:506; the one "held" at msg 27 was a read whose window ended before my line). No transition chat note (default off) confirmed (no comment messages in the chat). HUD shows a scene title ("Holding the Ridge"), not "Current scene". Overview player-clean: only the drawer `[title]` "blackboard" and settings-panel tooltips flagged by `assert-player-clean` (rubric.json playerClean), no raw enum values. Swipe/edit/refusal fixes not exercised on this card.
- The coordinator's import defect (effects lost after the first cast write) was NOT seen: ledger 21 rows, background, cast, onEnter all applied at both checkpoints.
- Spend: DeepSeek 63 calls 239327/37297 tokens; judge 183 calls (4 cached, 113 fallbacks) 1156015/106563 tokens; cost n/a. Pod: about 43 min (14:14-14:57).

## T1-5 Off the map (lane 5): NOT RUN

- 2026-10-01 16:38Z, `start T1-5 --lane 5` (bundle `6566f7f8e418`, pin `6ebe71a`; judge rate derived as 18/min for 5 lanes on a 90/min account) failed at the seed: `st-lanes seed 5 --fresh` hit `ENOSPC: no space left on device` copying `data/default-user/characters/Akari/laughing.png`. C: had about 2.6 GB free afterwards, and one seeded lane's `data` is about 2 GB (lane 1: 1,991 MB). The partial lane-5 copy (~500 MB, `C:\dev\so-lanes\5`) was left in place for the lead. No session dir was created, and nothing was played.

## T1-4 Effects (lane 4, `test/sessions/T1/T1-4-1`)

- Played 2026-10-01 16:49-17:24Z on the restaged bundle `6566f7f8e418` (campaign 6ebe71a), chat `2026-10-01@13h49m34s295ms` (group Adolion - The Eastern Road), persona Max Nightriver, 30 main RP requests, 19 player turns, 2 mutations (swipe after the Academy transition, reload mid-generation at the Academy), 1 flag. Reached The Final Before the Emperor (stop condition) at msg 46. `start` seeded cleanly in one go (seed exit 0 on pin drift: confirmed). `stop` valid (only `build.*` moved, served bundle identical); `assert-player-clean` ok.

| Row | Score | Evidence |
|---|---|---|
| backgrounds | works | shots/001, 005, 015, 025; turns.jsonl:4,6,24 |
| cast joins and leaves | annoying | turns.jsonl:4,14,24,26 |
| checkpoint lore | works | runtime-*.json:1203 (lore.fired), turns.jsonl:26 |
| timeline at level 2 | works | shots/015-rounds-transition.png |
| Overview | works | shots/027-overview-final.png, rubric.json:74 |

Flag (1): msg 12, "We sign under Honami's name." held as a commitment, story stuck at the Academy.

Findings:
- HIGH (product, commit guard): a commitment whose verb is the transition's own trigger word is held when the value has no words (bool). `east_entered` (commit_evidence has `sign`, the Academy->Rounds `extractor_trigger` has `sign|register|our names|join`). For "We sign under Honami's name." `sentenceIsAbout` excludes the intent hit because it lies inside the matched verb (`affirmedHit(..., verb)`, `src/extraction/commitGuard.ts`), the bool value has no words, and the window-about fallback only takes a deal term, a gate partner or a pointing-back verb. So it was held twice (journal.jsonl:313, :339) and the story stayed at the Academy for 4 player turns (stall anomaly, findings.md:48) until I said "We signed the register" ("register" is an intent hit outside the verb; queued journal.jsonl:450, transition at msg 22). "Our names are on the register" (msg 17) matched no commit verb at all. Same family as T1-2's held acceptances.
- MEDIUM (pacing/cast): The Hattaxi Shadow lasted one reply. Dalan found the thread and Honami read it in the same round (msgs 44-45), `east_plot_known` and `east_final_called` both landed, and the Final's onEnter post (msg 46) called the final at once. The night scene was skipped, Tanya and Rikako (joined there) never spoke, and Hanzo never spoke all session.
- LOW (product): `east_upset`, a seeded code roll, flipped true -> false -> true across checkpoints (turns.jsonl:4, :14, :26). The "progress_toward_east-the-long-way-home" counter climbs from the Academy on (1 -> 4), and its macro is skipped ("not registered: a macro key must be lowercase letters, digits and _", journal.jsonl:9).
- LOW (extraction): 16 rejected lines. 4 come from `q=<east_entered>` written with angle brackets ("unknown quality", findings.md:56), 2 from an evidence quote followed by narration ("unrecognized line"), 7 from `east_odds value=null`, and 6 from location evidence "only in the player's line".
- LOW: the line sent by `reload-mid-gen` was lost (chat stayed 10 messages, turns.jsonl:7). Same as T0-2. I re-sent it as a turn.
- Model loops: none in 30 replies (no repetition, no garbling). The "front-line looping" did not recur on this story.
- T1 fixes confirmed: the seed exits 0 on pin drift; `turn` waited for the whole group round every time (no late replies, no hidden-send failures in 19 turns); no empty-private-block anomalies; no looped or corrupt replies, so the loop guard was never needed. T0 fixes: no transition chat note, HUD shows scene titles ("Signing for the Tournament", "The Night Before the Final"), Overview has no raw ids, step-back on a swipe without a checkpoint change showed no notice. The held signing (above) is a gap the T0 commit-evidence fix does not cover, not a regression of it.
- Spend: DeepSeek 113 calls 278772/56226 tokens; judge 245 calls (11 cached, 44 fallbacks) 1348428/135004 tokens; cost n/a. Pod: about 35 min (16:49-17:24).

## T1-6 Pacing (lane 3, `test/sessions/T1/T1-6-1`)

- Played 2026-10-01 16:49-17:38Z, chat `2026-10-01@13h48m59s000ms`, persona Max Nightriver, served bundle `6566f7f8e418`, campaign pin `6ebe71a`, 43 main RP requests, 22 player turns. Start clean (first try). Stopped on the 50-minute limit at The Welcome of Eshalanore. The Empty Bed / Green Knight were never reached: in two nights at court the story never made Belle vanish, so the rush beat was not playable. `stop` valid (only `build.*` moved, served bundle identical). `assert-player-clean` passed (0 findings).

| Row | Score | Evidence |
|---|---|---|
| tension follows play | annoying | turns.jsonl:5, :6, :14, :16 |
| pacing hint (does the story wait?) | annoying | turns.jsonl:21, journal.jsonl:795 |
| HUD tension readout | works | shots/007, 015, 026 |
| secrets kept | works | transcripts.jsonl:1, turns.jsonl:3, :17 |

Tension trace (`tension_current`, smoothed): chapel 0.25 -> 0.325 on the one rushed turn -> 0.34 -> 0.29 when slowed back down; stones 0.28 -> 0.34 -> 0.38 -> 0.49 -> 0.62 -> 0.71 ("critical", expected 0.5); court 0.54 -> 0.53 -> 0.38. Transitions: chapel -> stones msg 20 (`journal.jsonl:405`), stones -> generated road-in msg 35 (`:753`), -> gen_2 msg 37 (`:795`), -> court msg 38 (`:798`).

Flags (5): msg 35 (tension "critical" during a polite escort, climbing on de-escalating lines), msg 49 (feast silence answered by a one-reply time skip to dawn that moved the party), plus 3 automatic loop-guard flags (msg 37 Ashliel "and a truth that" x16; msgs 56/57 "And then she is" loops).

Findings:
- HIGH (quality, main RP): degenerate loops are back at long contexts: msg 37 (Ashliel, ~50 lines of "And a truth that is…"), msg 56 (Elowyn, ~70 lines of "And then they"), msg 57 (Belle); msg 43 doubled words; msg 39 dropped words ("asliel walks behind the and Belle"). The `turn` loop guard detected all of them (digest "Model defects": loop 3, corrupt 1) and swiped 2. Msg 37 could not be swiped (not the last reply) and msg 56 was not swiped. So the guard detects the loop but cannot remove one that is not the last reply.
- MEDIUM: a generated chain collapsed. `gen_esha-the-road-in_1` -> `_2` fired on `esha_at_border == true`, which had been true since the chapel, then `_2` -> court at the next boundary, all inside one player turn (msgs 37-38). "The Road In" was never played, and the court arrived while the scout was still saying "a few hours' walk". `gen_1` is also named "The Shrine Stones", the previous checkpoint's name (author copy only; the HUD shows "Escorted In").
- MEDIUM: the stones tension rose on every turn, including kneeling, sheathing and asking to be led (0.38 -> 0.71), and the HUD read "critical" during a calm escort. The stones' target is "tense", so the direction is right but the scale overshoots.
- MEDIUM: the narrator time-skips after player silence (msg 49): an hour of feast, the night and the next dawn in one reply, deciding that the party rises and is assigned rooms.
- MEDIUM: the narrator still writes member dialogue (msg 16 Belle/Sali/Dalan, msg 23 Dalan). Members also voice each other (msg 45 Elowyn writes Belle's line, which Belle then contradicts in msg 46). Belle repeats "she's ready to swing her axe / not waiting for an order" in nearly every reply (msgs 30, 35, 38, 46, 54, 57, 59).
- LOW: the "catching up…" chip stayed on from msg 49 to the end at court (exit `esha_belle_missing` pending, scheduler idle; shots/026). `location` flipped road_in -> border -> road_in -> castle_hall (msgs 37-49). The code roll `esha_her_gaze` re-rolled true/false across boundaries. Judge health: 654 calls, 159 busy (24%, mostly memoryPairs), 11 timeouts; 21 console 429s.
- Expectation (card): the empty bed depends on the story removing Belle (`esha_belle_missing`). Two nights, a knock on her door and asking to rest never produced it, so beat 4 (rush) cannot be reached by play inside 50 minutes.
- T1 fixes confirmed:
  - {{user}} wording: no "the player" in any reply; replies use "you" / "Max".
  - Swipe scrolls into view: the loop-guard swipe of msg 57 reports `revealed.scrolledToBottom: true`, `clickable: true`.
  - The loop guard in `turn` detects loops and corruption.
  - `turn` waits for the round: `round.settled` on every turn; scripted npc_replies were included (msg 3, msg 21).
  - Player-clean is scoped (0 findings).
  - `start` derived the judge rate: no env var was passed.
  - Seed reset muted members: the seed was clean on the first try.
- T1 fixes not confirmed:
  - "Narrator only for scene work": regressed or partial (msgs 16, 23).
  - Second addressee answers: not exercised; no line named two characters.
  - Commit recall: not exercised (this story has no commitment line in play).
  - Injection diet: not separately measured.
- T0 fixes: no raw ids in player surfaces (player-clean green); no "Scene direction" echo; no transition chat note; HUD scene titles ("The Last Shelter", "Past the Shrine Stones", "Escorted In", "The Welcome of Eshalanore").
- Spend: DeepSeek 101 calls, 229382/52820 tokens; judge 209 metered calls (3 cached, 56 fallbacks), 1385989/126918 tokens; main RP 43 requests; cost n/a. Pod: about 49 min (16:49-17:38Z), with slow rounds (one turn took 335 s).

## T1-5 Off the map (lane 5, `test/sessions/T1/T1-5-1`)

- Played 2026-10-01 16:57-17:58Z after the disk was freed (the ENOSPC note above is the first, failed start). Chat `2026-10-01@13h56m53s812ms`, persona Max Nightriver, served bundle `6566f7f8e418`, campaign `6ebe71a`, judge 18/min (derived by `start`). 52 main RP requests, 30 player turns. Stopped on arrival at Castle Dracul ("The Castle's Two Owners", msg 73-76) at about 60 min. `stop` valid (`build.head` moved, served bundle identical), playerClean true. Both provocations done (three refusals of the castle, msgs 59/62/64; OOC "skip to the castle", msg 68).

| Row | Score | Evidence |
|---|---|---|
| generated routes | annoying | journal.jsonl:782, 798, 1276; turns.jsonl:26, 27; shots/025 |
| detour handling | works | turns.jsonl:29-33 |
| agency | works | turns.jsonl:4, 9, 11, 34 |
| Overview during generated play | works | shots/025, turns.jsonl:25, 35 |

Flags (5): Kayla never answers and is disabled (turns.jsonl:7), looping at Zariah (turns.jsonl:14), stutter degeneration spreading (turns.jsonl:28), Dalan's msg 70 degenerate plus the OOC skip teleporting to the castle (turns.jsonl:33).

Findings:
- HIGH (quality, model): speech degeneration took over every voice. It started from Zariah's authored stammer at Kelger Falls ("I-I", "t-the"), spread to Belle (msgs 32, 44, 57, 73), Nyl (55, 66, 69), Fael (58, 67, 75) and Dalan (70, 74: unreadable, cut at the token limit). The digest counts 8 model defects (loop 3, corrupt 5) and the `turn` loop guard swiped 0 times, though it recorded the defect (turns.jsonl:32 `modelDefect corrupt`, msg 69). The Long Night was unplayable as prose by the end. Sampler: DRY 0.8 / temp 1.0 after Kelger (Kelger's preset at temp 1.15 disarmed correctly on leaving, payloads.jsonl).
- MEDIUM (harness/card, or product): seeding by `activateCheckpoint` jumps over the skipped checkpoints' cast changes. Only Kelger's `enable Zariah` ran on top of night-the-slums' disables, so Kayla and Erevan (who "travel with the party" per the card) stayed disabled (`extras.effects.cast`). Kayla never answered three direct addresses (msgs 6, 8, 10), the narrator still mentioned Erevan (msg 5), and without the authored helper the fog scene looped for about 8 turns (msgs 9-35) before the player forced a solution. Either `start` should replay the path's cast, or activate should apply the cumulative cast of the path; until then the card's Zariah/Kayla beat is not exercised.
- MEDIUM (expectation): an OOC "skip to the castle" moved the party from a campfire to Castle Dracul's gates in one narrator reply (msg 71) and fired night_castle_sighted (journal.jsonl:1276). The player asked for it, but the card's must-not ("jumps to Castle Dracul without the party travelling there") is met literally.
- LOW (product): the generated Long Night had only two beats, both gated on the same `night_fog_broken` and taken on consecutive turns (journal.jsonl:782, 798), so the "generated stretch" was effectively one beat and arrival rode on night_castle_sighted.
- LOW (product): the narrator voices other cast members inside its own reply (msg 5: Belle, Dalan, Erevan); at the castle three members each answered in turn and the narrator only added scene lines.
- LOW: the story so far conflates places ("the Aegis slums of Kelger Falls", shots/025); the pipeline stayed "stalled-rechecking / catching up…" from about msg 12 to the fog break, though cadence reads ran every turn (7 reconciliation events).
- Judge: 570 calls, 496 answered, 64 busy (11.2%), 10 timeouts at 18/min. Much better than T1-1's 318 busy at 15/min.

T1-fix check (bundle `6566f7f8e418`):
- Confirmed in play: threads window (the Overview showed exactly 2 current threads, nothing stale); canon budget / story-so-far refresh (the story so far was updated through the boat trip, unlike T1-1's frozen hall text); the HUD showed scene titles, no generated ids ("The Long Night"); no transition chat note; `turn` waits for the round (every reply landed before the next turn; T1-1's out-of-order replies did not recur); multi `--evidence` (scores keep every path); per-lane judge rate derived by `start` (18/min); no "Scene direction" echo.
- Seen but not confirmed: the loop guard in `turn` detected a corrupt reply (msg 69) and did not swipe; "second addressee answers" could not be tested fairly (Kayla was disabled); "narrator only for scene work" partly holds (msg 5 is a counter-example; later the narrator kept to scene lines).
- Not exercised here: the scripted-reply cap per checkpoint (only one onEnter line fired, msg 76; no repeat), latch-aware supersession, commit recall/negation, the cast-restore single write, [hiding] shapes.
- Coordinator's known defect (effects lost after the first cast write): not seen. The ledger holds 19 rows; presets, backgrounds (`_black.jpg` at Kelger) and casts applied, and the castle onEnter reply posted.

Spend (BUDGET.md): DeepSeek 93 calls, 247987/40878 tokens (91 measured / 2 estimated); judge 240 metered calls (7 cached), 1647776/150721 tokens; cost n/a. Main RP 52 requests. Pod: about 61 min of shared pod time (16:57-17:58Z), plus about 10 min of seeding with no pod calls.

## T1-7 Second story (lane 4, `test/sessions/T1/T1-7-1`)

- Played 2026-10-01 17:33-18:09Z on bundle `6566f7f8e418`. Chats: adventurer `2026-10-01@14h33m02s449ms` (5 turns: Wendhope taken as the Iron Kettles, The Road North at msg 8; 1 more turn after the switch back) and aegis `2026-10-01@14h33m14s529ms` (8 turns: Homecoming -> Advice Over Ale (msg 9) -> A Wager in the Market (msg 19)). 27 main RP requests, 7 flags. Stopped at the 40-minute limit in the market, before the rivals beat (Curio Shop not reached). `stop` valid (only `build.*` moved, served bundle identical); `assert-player-clean` ok.

| Row | Score | Evidence |
|---|---|---|
| story isolation | broken | runtime-2026-10-01@14h33m14s529ms.json:7456, runtime-2026-10-01@14h33m02s449ms.json:8179, payloads.jsonl:77 |
| chat switching | annoying | turns.jsonl:11, 13, 15, shots/016 |
| Memory tab | annoying | shots/025-aegis-memory-tab.png |
| transition timing | annoying | turns.jsonl:7-10, 18 |

Flags (7): msg 1 (aegis, card line "put our names down for the C-rank exam" held x3), msgs 17/19 (one-line mood filler tails), msg 21 (narrator to the cap in fragments, voicing Alarise and Konako), msgs 23-24 (loops) + a correction (the loop guard did swipe msg 24, and the new swipe loops too).

Findings:
- HIGH (product, isolation, must-not-happen): the first generation after a chat switch carries the previous story's checkpoint lore, in both directions. Aegis msg 2 (Vallie) fired the adventurer's `CP road-to-wendhope - Scene` and `Cast - The Party`, and the prompt holds "[Scene state: the frontier road north to Wendhope, second day out ...]" (payloads.jsonl:77, runtime aegis `lore.fired[0]`). Adventurer msg 15 fired `Cast - Aegis`, `Aegis - The Promotion Exam` and `CP aegis-the-tavern - Scene` (runtime adventurer `lore.fired`). Every later generation was clean, so the gated-set release/replay on CHAT_CHANGED lands after the first generation's World Info scan. Repro: two Adolion chats on one install, play one, `turn --chat <other>` right after the switch, read `extras.lore.fired` for the first reply.
- HIGH (product, commit guard, same as T1-4): the card's sample line "put our names down for the C-rank exam" never commits (journal.jsonl:683/701/713). The matched commit phrase is also the transition's trigger phrase, so it is excluded as "inside the verb"; "for the C-rank exam" then defeats the points-back rule (`NAMES_ITS_OBJECT`); the bool value has no words of its own. "We'll sit the exam" committed. Aegis aside, everything else was isolated: the aegis blackboard has no `party_name`/`path`, aegis memory has no Iron Kettles, and the Wendhope facts there come from my own provocation (msg 4, Tobias answered from world lore).
- HIGH (model quality, the front-line looping recurs): aegis prompts grew from 18k to ~47k chars, and from msg 17 replies trailed into one-line filler, then looped. Belle msg 23 had "And the fight continues." x5, and Dalan msg 24 "And as." x~30 to the 600-token cap (samplers unchanged: temp 1, DRY 0.8/2/4096). The loop guard caught both (`modelDefects`, turns.jsonl:22) and swiped msg 24 (`autoRepair.swiped`), but the new swipe loops too ("And he waits." x~20), and Belle's msg 23 stays because it is not last. The digest also lists a "corrupt" Tobias msg 2 swiped once.
- MEDIUM (product): the narrator voices cast members itself (Alarise, Konako, msg 21). The talk log picks a speaker who never generates in the round (Alarise m21). The same symptom as T1-3 remains after the fixes.
- LOW: near-duplicate memory facts ("names on the exam list" stored 4-5 times in different words). One empty-private-block for Fiana (findings.md:116; the corrected digest still reports one). Judge 279 calls, 50 fallbacks (busy).
- Harness: (1) `switch-chat-mid-gen` to a chat of another group never left the open group: it passed the origin's group with the target chat id (turns.jsonl:11). Fixed in my worktree `C:\dev\so-t1c-wt`, branch `v26-t1c-harness`, commit 61d09265 (target group/groupId from `session.chats`, failing-first test in `sessionLive.test.mts`; `typecheck`, `lint` and `debug:typecheck` green; `test:debug` 796/797, the one failure is `so-run-header.test.mts` "build half reads plan 08's nested manifest", which needs a built `dist/manifest.json` the fresh worktree lacks). Re-run with the fix (turns.jsonl:13): ST refuses a group switch while a group generates (`openGroupById`: `!is_send_press && !is_group_generating`), so a cross-group mid-reply switch is impossible in the host; the card's provocation cannot be played as written. (2) The journal tail labels the other chat's events with the primary chat id (journal.jsonl:481 `party_name = Iron Kettles` tagged with the aegis chat while the adventurer chat was open), so the digest reports 24 "rollbacks" and 2 "unexpected jumps" (guild-hall -> road-to-wendhope "not authored") that are boundaries of the other story.
- T1 fixes confirmed: the seed exits 0 on pin drift (both starts went through in one pass); `turn` waits for the whole group round (no late replies in 15 turns); the loop guard detects and swipes. Not fixed: the swiped reply looped again, and "no mood filler" did not hold at ~45k-char prompts. The `[hiding]` parse fix was not exercised (no rejected epistemic lines in T1-4 or T1-7). T0 fixes: no transition chat notes, HUD scene titles, the Overview player-clean.
- Spend: DeepSeek 89 calls 244423/43545 tokens; judge 279 calls (8 cached, 50 fallbacks) 1682953/169117 tokens; cost n/a. Pod: about 37 min (17:33-18:10).
