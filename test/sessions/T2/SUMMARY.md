# T2 summary

## T2-2 Secrets (lane 5, `test/sessions/T2/T2-2-1`)

- Played 2026-10-01 19:48Z (turn 1), then paused for the DeepSeek outage (19:48-21:32Z) and the Artemis pod swap (replacement `m4dmlnzn70qgj2` at 21:36Z, same model and flags; flagged), resumed 21:42-22:13Z. Chat `2026-10-01@16h48m24s730ms`, persona Max Nightriver, served bundle `8319f7535e1e` (master 948e0d13 -> eb996a74 during the run), campaign 884380b, 26 main RP requests, 18 player turns, 5 flags. Lane override: lane 5 (lane 2 busy with spikes). Reached Whispers in the Halls with Natalia and Welden tested (stop condition). `stop` valid (only `build.head` moved, served bundle identical); `assert-player-clean` ok.
- Start: the first start (19:25Z) was refused at the pin. The overlay's prefill-only `last_output_sequence` became stop strings, so the Connection Manager probe got '' (`start-failed-attempt0.json`). The lead fixed it on master eb996a74 (`sequences_as_stop_strings: false`). After a reseed: `session.json` `presetOverlay` has 3 edits, probe "\nPONG". The first payload ends `<|turn>model\n<|channel>thought\n<channel|>\nShiya:`: in a group the speaker name follows the empty thought channel (`payloads.jsonl:2`).
- Turn 1 was read after the outage: cadence audit msgs 0-3 at 21:30:39Z produced Shiya knows / Natalia unaware / Max hiding-from-Natalia; nothing was dropped (unlike T2-6).

| Row | Score | Evidence |
|---|---|---|
| private knowledge (epistemic) | annoying | payloads.jsonl:238, :243, :254; evidence-*.json:3845 |
| secrets kept | broken | turns.jsonl:21, :24, :28; payloads.jsonl:235 |
| Memory tab | annoying | memory-tab-after-stop.txt:140, :172, :273 |
| speaker direction | works | turns.jsonl:11, :18, :24, :28 |

Flags (5): DeepSeek outage (msg 3); pod swap (msg 3); msg 35 Shiya knows 'poisoned' from a line only Natalia heard; msg 37 Ronan claims Shiya told him the secret (never happened); msg 42 Welden talks about the failing seals and the Witch King calling, untold and before trust.

Findings:
- HIGH (product): the secret reaches every drafted member outside the private block. The private blocks themselves are scoped correctly: Natalia's carries only the false well story (req 139, `payloads.jsonl:243`), and Welden's carries no seals (req 145, `:254`). But every prompt also holds it through our session-details memory ('Max told Natalia that the old well ... is poisoned'), the ledger (`active_goal=warn others about the poisoned old well`) and the Facts tier. Two host extensions add more: ST Summarize (`1_memory` [Summary: ... seals ... failing]) and Vector Storage (`3_vectors` 'Past events'), both enabled in the lane copy. Result: 3 must-not-happens (Shiya, Ronan, Welden; `turns.jsonl:21`, `:24`, `:28`). The shared group transcript is the card's known limit; the memory, ledger and summary paths are not.
- HIGH (product): the epistemic store loses the original secret and keeps a confabulation. Turn 1's entries (Shiya knows the seals are failing, Natalia unaware, Max hiding from Natalia, msg 3) are gone at the end. Shiya now 'believes Max told her, when she first heard it from Ronan' (`evidence-*.json:3845`), and Ronan 'knows Shiya told him'. My guess is that dropCommonKnowledge dropped the seals fact once 3+ subjects knew it, but I did not verify that. Ronan's invented line was stored as a Fact and shows in the Memory tab (`memory-tab-after-stop.txt:172`).
- MEDIUM (product): session-details dedup still fails. Shiya's prompt (req 130, `payloads.jsonl:226`) repeats 'Javon named Natalia the Crown's second' about 6 times. The Memory tab holds 86 rows (46 facts), many near-duplicates; epistemic rows repeat too (Javon hiding x3).
- MEDIUM (product): the shared read hit its 1024-token cap 6 of 30 times (finish=length; requests 71/75/77/79/87/92 in `payloads.jsonl`), cutting off the trailing [knows]/[arc] lines. The dedicated epistemic pass did NOT truncate: 13 calls, all stop, max output 550 tokens, so the 768-token cut is fixed. Ledger: 13 at 768, all stop. [hiding] lines: 17 stored, 0 rejected.
- MEDIUM (authoring): the `path` quality never committed from the card's own line "I'll go to Father's study." or from 4 turns of digging into Father, the decree and the seals (`turns.jsonl:6-9`). The rubric wants "commits to the Witch King thread", a name the player never hears in fiction. It latched only on "...whatever you need me to do about the seals and the Witch King" (reconcile:path, `journal.jsonl:282`). Likewise the card's refusal line "No. I won't duel Leevon for your politics." did not set `duel_refused`; it took the second refusal (`turns.jsonl:15`).
- MEDIUM (product): Whispers was reached on `evidence = 1` taken from Shiya's "The old well? No. Nothing." (`journal.jsonl:835`), which is not a clue. `heir_is_second=false` was set at Natalia Named, and it is a latching bool: taking the place back might not land (not exercised).
- LOW: chained voice: Javon's msg 17 repeats the narrator's msg 16 closing paragraph verbatim (`turns.jsonl:11`). The scripted sceneBreak line "Welden turns up in the library..." fired while the scene was in Father's study (msg 10). The narrator invented Kane as a 'royal advisor' (msg 14), although Kane is the Winstonehl heir. 'Max committed to the Witch King thread' (meta wording) became a Fact. 10 save-lost entries are all from the outage window (every 10 min, 20:20-21:20Z); 2 model-call failures are the outage timeouts. One empty-private-block (Ronan, req 134, `payloads.jsonl:235`).
- Model: no loops or word drops in 26 replies (0 model defects; T1-2/T1-3 had garbling and loops, T1-4 none).

T1 fix checks: generated-chain beat skipping not exercised (no generated chain). Tension sane (0.25 -> 0.63 at the refusal/naming -> 0.53). No player-less time skips or moves, except the scripted line above. "catching up..." not stuck: the pipeline went idle once DeepSeek returned. Judge busy fallback 7.7% (31 of 401; 5 timeouts; 5 console 429s) at 36/min. Commit phrases: see `path`/`duel_refused` above. Session-details dedup: still failing. Chained voices: one duplicate.

Spend: DeepSeek 129 calls 196408/41637 tokens (89 measured / 40 estimated); judge 263 calls (1 cached, 36 fallbacks) 1301687/118667 tokens; cost n/a; main RP 26 requests. Pod: about 31 min of play on the replacement pod (21:42-22:13Z), plus about 25 min on the original before it was idle-stopped (19:25-19:50Z).

## T2-6 Two chats, one story (lane 3, `test/sessions/T2/T2-6-1`)

- Played 2026-10-01 19:49-19:59Z and 21:36-22:11Z (paused 19:59-21:36 for the DeepSeek outage and the Artemis pod replacement). Group Adolion - The Adventurer's Road, chat A `2026-10-01@16h48m27s720ms` (Red Hands), chat B `2026-10-01@16h48m39s936ms` (Starlit Blades). Persona Max Nightriver in both (deviation: the tooling makes no second persona; party name and Talis carried the isolation checks). Served bundle `8319f7535e1e`, campaign pin 884380b. Preset overlay applied: 3 edits (`last_output_sequence`, `sequences_as_stop_strings=false`, `min_p` first), read back live. The first payload ends `<|turn>model\n<|channel>thought\n<channel|>\nEllie:` (ST appends the group speaker prefix). 36 main RP requests, 20 alternating turns (10 per chat, switched every two turns, 9 switches) plus one in-group switch-mid-gen attempt. End: A at Lights Behind the Palisade (generated on-the-road chain), B at The Road North. `stop` valid; only warning is build.head moved with the served bundle identical.
- Earlier start attempts kept: `T2-6-1-startfail-overlay` (probe empty reply: the first overlay made `<|channel>thought`/`<channel|>` stop strings via `sequences_as_stop_strings`; fixed by the lead in eb996a74).
- Backend changes during the session: DeepSeek hung from about 19:50Z, which affected turn 1 only (`turns.jsonl:1`, scheduler stuck at depth 1 for 600 s; flag `journal.jsonl:78`). The Artemis pod was replaced at 21:36Z: new pod m4dmlnzn70qgj2, same model file and flags. This was not a bundle change (flag `journal.jsonl:91`).

| Row | Score | Evidence |
|---|---|---|
| chat isolation | works | chat-full-A:773, chat-full-B:789, turns.jsonl:24, shots/026 |
| memory isolation | annoying | journal.jsonl:319, :729, shots/010 |
| lore follows the chat | works | runtime-A:18611, :19210, runtime-B:22787, turns.jsonl:14 |
| switching | annoying | journal.jsonl:242, :806, :982, turns.jsonl:13 |

Flags (3): DeepSeek outage, pod change, chat A's lost queued deltas (`journal.jsonl:319`).

Findings:
- HIGH (product): switching away from a chat drops its queued deltas, and the recovery read cannot see the commitment. Chat A's first real read (21:36:52, msgs 0-4; it covered the outage-affected msgs 1-2) queued 8 deltas: party_name The Red Hands, path wendhope, location north_road and more. I switched to chat B before chat A's next boundary. Chat A's boundaries 4-6 then applied nothing ("nothing applied (gate)"). The next cadence read covered msgs 2-9 and no longer held "We take Wendhope as the Red Hands." (msg 1), so path=wendhope was held by the commit guard ("no line the player wrote in the window shows the commitment"). Chat A sat at The Guild Hall for 5 player turns while riding north, and a reconcile read over msgs 0-17 recovered it at 21:56 (`journal.jsonl:319`, `:729`; stall anomaly `:713`). The same will happen to any player who switches chats before the boundary that applies a read.
- MEDIUM (product): every switch journals a status line in the new chat that names the PREVIOUS chat's checkpoint. Examples: chat A shows "Following Who Is Looking for a Party" (chat B's checkpoint) at `journal.jsonl:242`, `:431`, `:682`, `:885`, and chat B shows "Moved into The Empty Mile", chat A's transition, at `:806`. It is corrected at the next boundary. The "host change … reverted when this chat reloaded" records are also tagged with the arriving chat while carrying the leaving chat's boundary and message id (`:155`, `:238`). Whether the HUD showed the wrong name for those ~4 s was not captured.
- MEDIUM (harness/host): `switch-chat-mid-gen` within one group did not switch. The page stayed on chat B while its group round generated, and the verb failed with "the open chat did not settle within 60000 ms" (`turns.jsonl:13`). The line and its reply landed correctly in B. So within one group, ST (or the navigation helper) does not switch mid-reply, contrary to the runbook's claim.
- LOW: the narrator voiced members: in B msg 4 it wrote Talis' answer before Talis spoke herself (msg 5), and in A msgs 4 and 11 it wrote Dalan's and Belle's dialogue. Rydel and Talis were drafted in B with an empty private block while holding 6 and 11 private entries (`payloads.jsonl:98`, `:170`). 2 extraction lines were rejected as evidence only in the player's line.
- Harness: (1) `flag` brings the session's primary chat (B) forward, so flags meant for chat A are filed in chat B (`journal.jsonl:319` is tagged B). (2) Lane screenshots worked here.
- Fix checks: lore after each switch carries only the open chat's own gated entry (all 9 switches; `extras.lore.fired`). The generation hold does not stall: switch to first reply took 14-39 s, the same as non-switch turns (15-46 s). The digest has a "By chat" section, and events carry chatId (with the status/tag mismatch above). Seeded rolls differ per chat (`wall_breached` A false, B true, rerolled per checkpoint entry). Rydel's north-road gossip appeared only in B.
- T1 fix checks: no loops and 0 model defects in 36 replies with the overlay (one word slip, "Too notice", A msg 16). Tension was sane (0.075-0.25). Judge busy 1.7% (7/413, memoryPairs), plus 2 timeouts. "Catching up…" never stuck: both chats were idle at the end. Location was stable (A north_road; B aegis_guild_hall, then road). Generated chain: in A, road-to-wendhope lasted one boundary before the generated gen_on-the-road_1 → gen_2, so The Road North got no player turn (`journal.jsonl:793`, `:901`). Commit phrases: "put the Starlit Blades down for Wendhope" committed in B. In A, the original acceptance was lost to the dropped queue (above), not to phrasing. Session-details dedup was not exercised. Chained voices: several members per round (Belle and Dalan) answered in order.
- Spend: DeepSeek 73 calls, 145643/28052 tokens (57 measured, 16 estimated); judge 393 calls (8 cached, 11 fallbacks), 2450327/239419 tokens; main RP 36 requests; cost n/a. Pod: about 45 min of play (19:49-19:59, 21:36-22:11Z), on two pods.

## T2-4 Away and back (lane 1, `test/sessions/T2/T2-4-1`)

- Played 2026-10-01 22:13-22:37Z, continuing T1-1's chat `2026-10-01@11h05m47s358ms`. It ran at the lane's OLD pin 59e8821 (the story index is 884380b), recorded by `start` as "continued at the lane's pin" after the lead's f485ce96 fix. It ran WITHOUT the preset overlay: lane 1 has no overlay record (the pre-overlay presets copied from the real install). Served bundle `8319f7535e1e`, `--age 24`; the recap fired (`journal.jsonl:713`). The lane judge ran at 60/min, not the planned 36/min (server already up). 17 main RP requests, 10 turns after the recap (incl. the "where were we?" provocation). Reached The Lord Spirit of Needlehaven at msg 98 (knows_spirit true). `stop` valid, no warnings. The first start attempt is kept as `T2-4-1-startfail-pin` (refused on the pin before the fix).

| Row | Score | Evidence |
|---|---|---|
| away recap | annoying | recap-popup.json:3, journal.jsonl:713, turns.jsonl:4 |
| Overview threads | works | overview-cold.json:3, turns.jsonl:12 |

Flags: 0 (I missed flagging the stale recap at the time; it is recorded in the score note).

Findings:
- MEDIUM (product): the recap is player-clean but not current. It has no ids and no spoilers, and "Where you are" names Into Needlehaven. But "Recently" only says the scene moved and not what I last did (fighting the first Screechers in the forest at dusk). One open thread is stale (something scraping in the tunnel, which the party had left at msg 74) next to the true one, and "Where you are" says "daylight is the only cover" at dusk. "The story so far" still ends at the guild hall with "the commitment unconfirmed" (the T1-1 finding, unchanged). The narrator's OOC answer to "where were we?" (msg 79) was more accurate than the recap.
- LOW (quality, no overlay): Artemis repeated tics in nearly every reply ("set and hard", "shifts her weight", "lets out a shaky breath") and slipped words three times: msg 91 "looks back up at Duggy" (Duggy is the speaker), msg 96 "raspberry-like", msg 102 "She looks at the and her face". The defect detector counted 0. There were no degenerate loops in 17 replies.
- LOW (harness): `shot` timed out twice on lane 1 (`page.screenshot: Timeout 30000ms`, turns.jsonl:2-3), so the recap evidence is the popup text read from the page (`recap-popup.json`, `overview-cold.json`).
- T1 fix checks: the away recap fires after a 24 h gap and is player-clean (above). Tension stayed sane (0.55-0.66 during a fight). No player-less moves: the narrator took the party to the clearing only after I said to follow the flowers. Location stayed stable. Judge busy 3.4% (9/266) plus 4 timeouts. "Catching up…" never stuck. No beat skipping: into-needlehaven → the-lord-spirit on the spirit's reveal. Commit phrases, session-details dedup and chained voices were not exercised.
- Spend: DeepSeek 42 calls, 108289/20531 tokens; judge 252 calls (1 cached, 14 fallbacks), 1245515/118154 tokens; main RP 17 requests; cost n/a. Pod: about 24 min (22:13-22:37Z).

## T2-1 Long run (lane 4, `test/sessions/T2/T2-1-2`)

- Played 2026-10-01 19:56Z (turn 1), paused for the DeepSeek outage and the Artemis pod swap, resumed 21:36-23:30Z. Chat `2026-10-01@16h56m09s049ms` (group Adolion - The Saga), persona Max Nightriver, served bundle `8319f7535e1e`, campaign 884380b, lane preset overlay with 3 edits (Gemma 4 `last_output_sequence` = empty thought channel, `sequences_as_stop_strings: false`, `min_p` first). 89 main RP requests, 54 turn records (about 50 answered player turns), 4 flags. Lane override: lane 4 (lane 1 leased to T2-4). Stopped at the 2-hour play limit at Home for the Recess (nightriver-house) after the act change; Father's Summons not reached, 80 turns not reached. `stop` valid (only `build.*` moved, served bundle identical).
- Start history: `T2-1-1` = `start-failed.json` (pin probe "empty reply", the 2-edit overlay turned `<|channel>thought` into a stop string). A second attempt ran from my worktree with a probe fix and was abandoned when the lead fixed the overlay on master (eb996a74); its session dir exists only in `C:\dev\so-t2-probe-wt` (branch `v26-t2-probe-overlay`, commit 2d73d89d, not merged, superseded).
- Overlay check: `session.json` `presetOverlay` holds the 3 edits with `live` matching. The first main prompt (`payloads.jsonl` request 1) ends `<|turn>model\n<|channel>thought\n<channel|>\nAdolion Narrator:`, stop list is `<turn|>` plus names only, samplers start with `min_p`. The probe answered "\nPONG".
- Outage impact: 2 turns. Turn 1 got its reply, but the scheduler never drained (DeepSeek hang, `turns.jsonl:1`). Its msgs 0-2 were re-read at 21:30Z after recovery (`journal.jsonl:123-141`), so nothing was dropped. Turn 2 hit ECONNREFUSED on 18080 (pod gone) and left an empty Naomi message 4 (`payloads.jsonl` response for request 52). It was deleted (`turns.jsonl:6`) and resent (`turns.jsonl:7`). Both are flagged.

| Row | Score | Evidence |
|---|---|---|
| long-run memory | works | turns.jsonl:57, evidence-*.json:591 |
| chapter seal | broken | journal.jsonl:3043, 3047; evidence-*.json:18020 |
| story so far / Previously | annoying | evidence-*.json:18020; T2-3-2 shots/001-start.png |
| Memory tab | annoying | evidence-*.json:591, 761 |
| act change | annoying | turns.jsonl:52, 66; journal.jsonl:2973; snapshot-*.json:32060 |
| 07 Q-M legs | recorded | turns.jsonl:57, 58, 60; runtime-*.json:69908 |

Flags (4): the DeepSeek outage (msg 2), recovery (msg 2), the main backend gone (msg 4), and the chapter record wrong at the act change (msg 121).

Findings:
- HIGH (product, chapters): the act-change seal produced a wrong chapter record. The journal says "chapter sealed: The Adventurer's Guild (without a written summary)" after 4 `chapterSeal` calls, 2 of them at the 1024-token output cap (`journal.jsonl:3043-3047`). playerTitle "The Adventurer's Guild" names an act that was Driftmere and the mines. The summary is stitched scene summaries: it starts mid-descent ("The party advanced down a twisting tunnel") and is cut with "…" before the Devourer fight. One consequence places the vanished expedition "in Wendhope" (it was Driftmere; evidence-*.json:18020). The Overview "Your story" and the "Previously" popup on the next open (T2-3-2 shots/001-start.png) both show this text. Must-not "chapter record invents an event / recap wrong" was met.
- MEDIUM (authoring, adolion-saga): Father's Summons cannot be reached by digging. The `nightriver-house -> fathers-summons` gate is `acad_path == witch_king`. The extraction_hint says "set once the heir starts digging into Father, the duel, the marriages or the seals", but the quality rubric says "once the player commits … until they actually commit, say nothing". Four turns at Javon's desk asking about seals, marriages and the Witch King produced no acad_path reading (unset at stop, snapshot-*.json:32060).
- MEDIUM (product, extraction): the "evidence only in the player's line" rule rejects player-driven moves 16 times (findings.md: extraction-rejected). Examples: `entered_mines` "We go down", `location` for "I go up to Father's study" x5, `saga_called_home` "we go to Aegis City" x2. They landed later only when the narrator echoed them, which delayed transitions (3 stall anomalies).
- MEDIUM (product, generation): generated chains still skip a beat. `the-first-descent -> gen_between-the-floors_1` (22:01:59) was followed by `_1 -> _2` at the very next boundary (22:03:05, same player round, msg 47) on the same gate `descent >= 1`, which had been true since entry (`journal.jsonl:1001, 1030`). "The Breathing Dark" got one narrator reply.
- MEDIUM (quality, model): persona bleed. Naomi's "-nya" tic spread to Riyo (msgs 64, 66, 76, 84, 93, 105, 121) and Belle ("Fuck your ascension-nya", msg 86; "Guest-nya", msg 119). The loop guard does not count this; it reports 0 model defects. The narrator also voiced members (Belle msg 80, Riyo msg 84, Belle msg 123), and the warden flagged house-rule breaks.
- LOW: memory duplication. 45 facts with the oath x4, the butler line x3, and the grieving mother x3, injected as-is. 24 "save not confirmed" (7 during the outage). Location flip deep_mines -> upper_mines -> deep_mines (turns 23-24). Code rolls of other stories (wall_breached, night_moon, war_turn, esha_her_gaze) flip inside a checkpoint at boundaries (turns.jsonl:49). The scripted "Welden turns up in the library" line re-posted after a swipe.
- Harness: (1) `shot` timed out 6 times from 23:12Z: the headed lane browser rendered 0 animation frames (occluded window). The same cause failed the first `start T2-3` at reload. Fixed on lane 4 by relaunching Chrome with `--disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling`; the lead put it on master as 4bae6a69. (2) `swipe-new` for the Q-M plain arm would have targeted the scripted Welden line (msg 124), not the chaptered reply. I deleted msg 124 first (`turns.jsonl:58`).
- Q-M: 1 pair recorded (chaptered msg 123 swipe 0 answers fully; plain swipe 1 is one stage sentence). The stop's rating-pack says 1 of the 20 pairs plan 07 needs exist.
- Judge: 1446 calls, 192 busy (13.3%, mostly memoryPairs), 43 timeouts at 36/min.
- Spend: DeepSeek 310 calls, 1398820/134179 tokens; judge 238 metered calls (5 cached, 57 fallbacks), 1310544/145082 tokens; main RP 89; cost n/a. Pod: about 115 min of play (21:36-23:30Z), plus turn 1 at 19:56Z on the old pod.

## T2-3 Contradiction (lane 4, `test/sessions/T2/T2-3-2`)

- Played 2026-10-01 23:36-23:49Z on the T2-1 chat, Author view on, `chapters.fold` on. 8 main RP requests, 7 turn records, 1 flag. Three contradictions plus both provocations (self-contradiction twice, narrator-only fact). Stopped after the queue was read. `T2-3-1` is a `start-failed.json` (reload timeout, the 0-frame browser above). `stop` valid; the fold requirement was met (turns folded 116 messages; 2 turns `folded: null`).
- The "Previously" popup on open blocked the first send. `turn` does not dismiss popups (`turns.jsonl:2`, no message sent, shots/003). I pressed Continue and resent.

| Row | Score | Evidence |
|---|---|---|
| contradiction handling | annoying | turns.jsonl:4-8 |
| memory queue | annoying | shots/012-memory-queue.png, turns.jsonl:10 |
| continuity warden | broken | shots/011-scheduler-warden.png, turns.jsonl:7 |
| chapter fold | broken | shots/012, shots/001, turns.jsonl:7 |

Flag (1): msg 143, the narrator agreed Serenola is a bearded dwarf.

Findings:
- HIGH (product, fold): with fold on, every mines-act fact is "held out: folded" (Memory tab, shots/012, including "Serenola is a dark green-skinned woman with red eyes"). The story-so-far sent in their place is the truncated chapter text that stops before the Devourer. So a contradiction of a sealed-act fact goes unchecked: "Serenola is a dwarf, isn't she?" -> narrator "The description is precise - a stout silhouette with braided beard" (msg 143). A short-term compaction then stores "Max identified Baroness Serenola as a dwarf" as live memory. Must-not "a character agrees with the contradiction" was met.
- HIGH (product, warden): review-mode warden notes can never be approved in a group. All 4 notes this session (and T2-1's) were house-rule notes that lapsed ("a newer reply came first") within the same round, before the player could act (shots/011). The warden raised nothing about the dwarf agreement or the seal/crew contradictions.
- MEDIUM (product): no claim was held. The card's established facts were never locked, authored or decided, so the queue logic (by design) holds nothing. "We never went past the seal", "Riyo's two ordinary arms" and "the crew came home alive" were not stored at all. Characters pushed back in fiction (Javon cites the Guild report, msg 136; Belle corrects the crew claim, msg 140), so the established version still steered when it was in recent messages.
- MEDIUM (product): the memory queue shows "Needs your decision (40)", almost all memory-vs-ledger pairs that agree (B-rank fact vs ledger rank=B-rank; estate gates x2). Plain words and clear buttons, but a real conflict would be buried.
- LOW: Natalia knows about Max's accusation of Javon in the study without having been present (msg 141). Possible eavesdropping, but unprompted.
- Judge: 163 calls, 27 busy (16.6%, memoryPairs), 4 timeouts.
- Spend: DeepSeek 32 calls, 238947/25804 tokens; judge 130 metered calls (2 cached, 32 fallbacks), 711505/80573 tokens; main RP 8. Pod: about 14 min.

## T2-5 Memory tab (lane 4, `test/sessions/T2/T2-5-1`)

- Played 2026-10-01 23:50Z-2026-10-02 00:06Z on the T2-1 chat (fold off). Pin/Edit/Exclude ran in player view (Author view off), Lock in Author view. The Memory tab was driven by DOM clicks through `st-eval`; `so-session` has no memory verb, so the evidence is shots and flags. 8 main RP requests, 4 turns, 1 swipe, 1 reload, 2 flags. All four actions were tried and both provocations done (swipe right after pinning, reload right after the edit). `stop` valid. The digest's harness-error is the deliberate reload ("page restarted 2 times").

| Row | Score | Evidence |
|---|---|---|
| pin | works | shots/001-pinned-riyo.png, turns.jsonl:2 |
| edit | annoying | shots/003-edited-natalia.png, turns.jsonl:4 |
| exclude | annoying | shots/005-after-exclude.png, turns.jsonl:6, :7 |
| lock as canon | broken | shots/008-locked-canon.png, turns.jsonl:9-11 |
| Memory tab usability | annoying | shots/001, shots/005 |

Flags (2): an excluded fact returns through Open threads (msg 151); the locked fact did not win (msg 156).

Findings:
- HIGH (product, lock): locking "killing the Devourer released them into dust" as canon left the row "held out: folded". It was in no later prompt (payloads: the locked text is absent from all 3 later requests). Then "We left the Devourer alive, didn't we?" was stored LIVE twice ("Max admits the party left the Devourer alive and only sealed it back in"), with no held or conflicted row, and Natalia answers "Finally, the truth comes out" (msg 156). Must-not "a locked fact loses to your contradiction" was met. A lock on a folded row should probably unfold it, or force-inject it.
- MEDIUM (product): the card's Naomi edit is impossible. 0 of 95 player-visible rows mention Naomi; her 5 rows are all `foldedInto: adv#1`, and the player view hides folded rows without saying so. The Natalia/Serenola fact I edited instead was saved and survived the reload. It was not injected into the next prompt (payloads index 0/1), so the reply did not use it.
- MEDIUM (product): exclusion removes the fact rows (gone from the next prompt), but the same content stays in `[Open threads]` ("Javon demands Max explain his conduct at the mines…") and the reply uses it (msg 151).
- MEDIUM (product, dedup): "[Details from this session]" duplicates are still injected. Belle's "crew turned to dust" exists 11 times and Riyo's "panicked about her arms" 7 times; prompt 0 carries at least 4 copies of the Tzarak/Javon facts.
- Pin: works and survives swipe and reload. Find + count ("Showing 10 of 74") work, and nothing internal shows in player view.
- Judge: 77 calls, 0 busy, 1 timeout.
- Spend: DeepSeek 19 calls, 129271/12618 tokens; judge 70 metered calls (1 cached, 1 fallback), 526218/64206 tokens; main RP 8. Pod: about 16 min.

### Fix checks (T2-1/3/5)

- Generated chains don't skip beats (held on entry): **not fixed**. `_1 -> _2` fired at the next boundary of the same round (T2-1 `journal.jsonl:1001, 1030`).
- Tension tracks recent messages: **confirmed**. It rose to 0.74 in the mine fights, fell to 0.30-0.49 at the estate, and never read "critical" on calm play.
- No time skip / party move without the player's choice: **confirmed**. Every move followed a player line. The guard over-rejects player-driven moves, though ("evidence only in the player's line" x16).
- "Catching up…" chip doesn't stick: **confirmed**. The pipeline was `idle` after every turn outside the outage.
- Location doesn't flip-flop: **partly**. deep_mines -> upper_mines -> deep_mines on two consecutive turns (T2-1 turns 23-24); stable at the estate.
- Judge busy fallbacks: T2-1 13.3% (192/1446) + 43 timeouts; T2-3 16.6% (27/163); T2-5 0% (0/77). All at 36/min derived for 5 lanes.
- Loop guard / Artemis loops and word drops with the overlay: **0 model defects in about 105 main RP replies across the 3 cards** (T1: T1-2 garble, T1-3 5 loops, T1-6 3 loops + 1 corrupt, T1-5 8, T1-7 several). The guard never fired. New defect class it misses: "-nya" persona bleed (about 9 replies).
- Commit phrases incl. ones containing the trigger word: **not exercised** (no commit_evidence quality on this path).
- Epistemic budget (no truncated epistemic replies): **confirmed**. No epistemic rejections, 0 empty-private-block.
- "[Details from this session]" dedup: **not confirmed**. Heavy duplicates in the store and in the prompt (T2-5 above).
- Chained voices waited for: **confirmed**. Every round was settled before the next turn; no late replies.
