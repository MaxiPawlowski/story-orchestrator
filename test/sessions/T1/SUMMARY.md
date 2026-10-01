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
