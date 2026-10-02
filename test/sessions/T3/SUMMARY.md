# T3 summary

## T3-4 Spoiler hunt (lane 2, `test/sessions/T3/T3-4-1`)

- Played 2026-10-02 02:13-02:48Z on a fresh lane 2 seed (pin 884380b, preset overlay applied with 3 edits and read back). Chat `2026-10-01@23h13m05s002ms` (Adolion - Between the Roads), persona Max Nightriver, served bundle `7a1e95c3c47c` (master 58695ff3), timeline level 2, media off. 30 main RP requests over 18 recorded turn rows, plus one unrecorded turn (see the harness note). Route: Homecoming -> Advice Over Ale (tavern) -> A Wager in the Market -> Sophie's Deliveries (curio shop: Sophie, then Calithra) -> Bedding for the Orphanage -> A Challenge at Victory's Tusk (Kass, Yrelra introduced). `stop` valid; the only warning is that the repo build moved while the served bundle stayed identical. `assert-player-clean` passed at start, mid-session and stop. Stop condition: every surface was read at least twice.
- Surfaces read: HUD on every turn; Overview 5x (including with the drawer held open during a generation); Memory tab 3x; every level-2 chip text scanned 3x (114 and then 154 texts, regex for ids, `_`, checkpoint/quality/gate words, dragon/succubus: 0 hits); every `title` and `aria-label` in the drawer, HUD, inline hosts and settings panel; `/story`, `/story recap`, `/story threads`, `/story flag`, plus `/cp state` and `/so-mem list`, which a player can type.

| Row | Score | Evidence |
|---|---|---|
| HUD | works | shots/001, shots/019 |
| Overview | works | rubric.json:53, shots/007 |
| Memory tab | annoying | runtime-*.json:22021, :22046, :22069 |
| timeline level 2 | annoying | journal.jsonl:23, shots/001 |
| slash commands | annoying | journal.jsonl:513, chat-full-*.json:801, shots/015 |

Flags (4): msg 0 Cast chip; `/cp state` leak; one test flag ("looks fine", from `/story flag`); the harness deviation note.

Findings:
- MEDIUM (product, spoiler): at the greeting, the inline Cast & direction chip (L1, so the player sees it) shows "Cast & direction: 34" with 34 rows of "<name> left". The rows name the whole future cast before any of them appears: Sophie, Calithra, Yrelra, Celeste, Kass, Karrus and more (`journal.jsonl:23`, `shots/001-greeting-inline-cast.png`). "left" is also false, because they never arrived. The likely cause is the checkpoint's cast-disable effect rendered as departures. Later transitions say "Fiana/Rydel/Kaian/Jasira joined" before those characters are on stage. T3-6 shows the same thing in adolion-adventurer (12 rows: Domas, Rydel, Fiana, Talis…).
- MEDIUM (product, spoiler): `/cp state` is not gated by Author view. A player who types it gets quality names, raw values and a future checkpoint id posted into the chat as a system message: `aegis_examiner_watching: true (code)`, `progress_toward_aegis-the-board: 2`, `location: aegis_curio_shop` (`chat-full-*.json:801`). The first of these also hints at the hidden examiner. `/so-mem list` prints the tier ids `[session_details]`/`[facts]`. The help string calls /cp an author tool, but nothing enforces it. These system messages do not reach the main model: `aegis_examiner_watching` appears only in expansion (DeepSeek) prompts, which carry it by design.
- LOW (product): Memory-tab dedup. 102 rows after 25 turns (50 facts). The cutpurse incident is stored 5+ times, The Oddity's Nest and The Velvet Shadow twice each. Sophie's cover story ("a simple lizardkin shopkeeper") is stored as a plain Fact. There is no leak: dragon and succubus never appear in any panel.
- LOW (product): scripted narrator lines fire out of place. The tavern's "kitsune bard changes key" line fired at msg 10 after the party had left for Market Street. The "night wears on at Victory's Tusk" line fired twice, at msgs 45 and 48. At msg 17 the narrator introduced Sophie, and then Sophie's own scripted greeting repeated the introduction (msg 18).
- LOW (copy): checkpoint display names run slightly ahead of the fiction. "Sophie's Deliveries" was on the HUD before Sophie offered any deliveries. The Health chip shows "changes not saved yet — they go with the next save" to a player. 2 save-not-confirmed entries at 02:45:49Z (`journal.jsonl:1061`).
- The secrets were kept in every surface and in the chat. Sophie deflected with "just a simple lizardkin" (msg 20), and Kass introduced Yrelra as "the elf girl… shy as a rabbit" (msg 49). No preview, driver or curator control appeared in player mode. Tooltips carry no internals: the only one that names internals is the Author view toggle's own warning.
- Harness: (1) `so-ui drawer-tab` fails when the drawer is closed, and every `turn` closes ST's drawers (sending clicks outside them). So "open the drawer during a transition" needs `open-drawer` while a turn is in flight. (2) I ran one `turn` in the background (`&` in a Bash call) so I could hold the drawer open. Its process died when that shell exited, so msgs 50-52 are in the chat but have no `turns.jsonl` row. Flagged (`journal.jsonl:1142`); use the tool's background mode next time. During that generation the drawer stayed open and the HUD/Overview stayed clean, but no transition happened, so the provocation is only partly covered.
- Fix checks: secrets out of player surfaces: confirmed. Status lines belong to their chat: not exercised (one chat). Away recap: not exercised (`getAwayRecap()` null, no `--age`). Generated beat names in HUD/Overview: not exercised ("Preparing the road ahead…" ran at Victory's Tusk; no generated beat entered). Party moves accepted: partly. Moves landed, but the checkpoint lagged one turn behind walking to Market Street (msg 8 -> market-street at msg 12). Generated beats wait for a player turn: not exercised. Lazy expansion generation loads: confirmed (no chunk errors; `console.jsonl` has only 4 judge 429s). Loops or word drops with the overlay: 0 model defects in 30 replies.
- Judge: 491 calls in the digest, busy 10.2% (memoryPairs 46, lore 3, director 1), 7 timeouts, 36/min.
- Spend: DeepSeek 119 calls, 285697/54050 tokens (all measured); judge (metered at stop) 248 calls (4 cached, 48 fallbacks), 1093136/113882 tokens; main RP 30 requests; cost n/a. Pod: about 35 min (02:13-02:48Z).

## T3-6 Small screen (lane 2, `test/sessions/T3/T3-6-1`)

- Played 2026-10-02 02:57-03:07Z on a fresh lane 2 reseed (pin 884380b, overlay 3 edits). Viewport 390x844, recorded in `session.json`; every command was prefixed with `ST_DEBUG_VIEWPORT=390x844`. Chat `2026-10-01@23h56m55s897ms` (Adolion - The Adventurer's Road), served bundle `7a1e95c3c47c`, media off. 7 main RP requests, 3 player turns (plus one that never landed, below). Reached The Journey North (`road-to-wendhope`) on "We take Wendhope as the Short Straws…", which committed at once. Visited: drawer (player and author tabs), HUD, inline chips and an opened detail, the Author view confirm, Studio (Graph/Checkpoints/Transitions/Diagnostics/Story, then Close), the settings panel, and drawer + settings together. `stop` valid, with no warnings; `assert-player-clean` ok. Stop condition: every surface visited.
- Method: an in-page measure at 390 of each root's `scrollWidth` against `clientWidth`, controls outside the viewport, and `elementFromPoint` at the send button and the HUD; plus `so-ui hit-test` on the drawer toggle, the tabs, the flag button, Author view, Edit story and the Extensions toggle.

| Row | Score | Evidence |
|---|---|---|
| drawer (narrow) | works | shots/003, shots/008 |
| HUD (narrow) | works | shots/006, shots/018 |
| timeline (narrow) | annoying | shots/004, shots/006 |
| Studio (narrow) | annoying | shots/009, shots/011 |

Flags (1): the settings panel covers the send button.

Findings:
- MEDIUM (product/layout): with ST's Extensions drawer open at 390, our settings panel content is the topmost element at `#send_but`. The `turn` verb typed the line, but the send never landed ("the line did not land", `turns.jsonl` seq 14; flag `journal.jsonl:175`). This is ST's drawer layout, but the element on the button is our panel. Closing the drawer fixes it. ST's toggle is reachable (hit-test clickable), though a scripted `element.click()` on `.drawer-icon` does not close it; jQuery `trigger('click')` on `.drawer-toggle` does.
- LOW (layout): Studio Transitions tab scrolls sideways (tabpanel 391 > 345; the row "the-sheridan-steward → road-to-wendhope" overflows its card, `shots/011`). The Graph tab is an unreadable vertical sliver at this width (`shots/009`). The title field is truncated, and the tabs wrap to 3 rows. No control is offscreen, and Close works.
- LOW (layout): the chat area at this emulated width (desktop layout, not mobile UA) is only about 240 px tall. One opened chip detail (the greeting's 12 "X left" Cast rows, the same defect as T3-4) fills it (`shots/004`).
- Works: no horizontal page scroll anywhere (document 390). Drawer 377 inner, no overflow in Overview/Memory/Blackboard/Scheduler/Payload; tabs wrap; toggle, tabs, flag and Author view are all topmost. Edit story sits about 3000 px down the author drawer (scroll). The HUD is one line just above the input and never covers send. The chips wrap within the 297 px column on 9 hosts, and the transition chip sits under the reply that moved the story. The Author view confirm buttons are on screen. Opening our drawer closes ST's Extensions drawer (they are mutually exclusive), so "drawer and settings together" cannot both be open.
- Fix checks: party move accepted: confirmed (Short Straws, Wendhope, first turn). Lazy chunk loads: confirmed (Studio opened, console has no errors). Loops or word drops: 0 in 7 replies. Away recap, generated beats and status lines: not exercised.
- Judge: 78 calls, 0 busy.
- Spend: DeepSeek 18 calls, 48055/11292 tokens; judge 76 calls (2 cached), 471524/45422 tokens; main RP 7; cost n/a. Pod: about 10 min of play (02:57-03:07Z), plus the 02:49-02:57Z reseed.

## T3-1 Everything on (lane 3, `test/sessions/T3/T3-1-1`)

- Played 2026-10-02 02:13-02:41Z on a fresh lane 3 seed (pin 884380b, preset overlay `4af4006b7801`, 3 edits, read back). Chat `2026-10-01@23h13m06s765ms` (Adolion - Crimsonwing & Ebonwing), persona Max Nightriver, served bundle `7a1e95c3c47c`, timeline level 1, inner voice harvest and beat on, media off: the scene-image and sprite rows are not exercised. 34 main RP requests, 15 turns, 1 swipe provocation, 1 reload-mid-gen provocation, 2 C3 swipes. Route: Two Wings at One Counter -> Crimsonwing at the North Gate -> The North Road -> Carrow Keep -> The Altar in the Great Hall (stop condition: inside the keep, about 28 min).
- `stop` was INVALID on one reason: "required artifact harvestedReasoning: 0 captured". The cause is structural. The overlay prefills an empty thought channel, so all 109 stored replies carry `reasoning: ""` and the harvest can never fire. The lead ruled that this is not an artifact gap. The harness fix on branch `v26-t3-harness-setting-harvest` (859f20c7, not merged) bases the rule on the evidence: when no reply carries reasoning, the requirement becomes the warning "not applicable: the model produced no reasoning". `reverify` with that branch reads the session as valid (`artifacts.json` replyReasoning 0). The pre-reverify session.json is kept at `C:\dev\so-lanes\3\t3\T3-1-1.session.before-reverify.json`. Inner voice is re-covered by the T3-3 re-run without the overlay (lead).

| Row | Score | Evidence |
|---|---|---|
| inner voice | annoying | journal.jsonl:58, :106, inline-end.json:66, turns.jsonl:15 |
| timeline at level 1 | works | shots/023-timeline-level1-end.png, inline-end.json:5 |
| overall presentation | annoying | journal.jsonl:585, turns.jsonl:8, :22, shots/023 |
| 06 C3 inner voice leg | recorded | turns.jsonl:15, :17, :20 |
| C5/C6 surface decisions | recorded | shots/023, turns.jsonl:22 |
| scene images / sprites | not exercised (no-media) | |

Flags (1): the story was stuck at the north gate (`journal.jsonl:585`).

Findings:
- HIGH (product/authoring): the story stalled 6 turns at Crimsonwing at the North Gate. `deep_set_out` (evidence_from `world`) was rejected 10 times as "evidence only in the player's line". DeepSeek quoted my move line ("We fall in behind the cart and leave the city.") every time, even after the narrator wrote four days of marching (msg 18) and Ced said "the one we've traveled". In the same read, `location` was accepted from that same line by the new party-move rule, and so was a FACT "the party left Aegis City". So the party-move fix covers `location` and `evidence_from: party` only, and this quality is a party move authored as `world`. Two remedies to choose between: author `deep_set_out` as `party`, or have the read re-ask for a non-player quote after a player-only rejection. The stall detector fired (`journal.jsonl:607`). The story moved only when the narrator's reply itself named the climb and the keep (turn 8).
- MEDIUM (product): inner beats rarely reach a reply. Over 24 inner passes the journal records 16 "used" (narrator only, plus Ced once), 13 "unused" ("dm: the beat on message N was never drafted": the beat is built for the narrator while the director drafts a member), 16 "stale" for Ced (built on an older reply every time) and 65 "No inner beat". The beat was never shown in chat (beat texts absent from chat-full; player-clean ok).
- MEDIUM (harness, fixed on branch): `setting <dir> memory.innerBeat false` wrote the settings store but never refreshed the runtime. The beat was still used on the "plain" C3 swipe (turns.jsonl:17, journal 02:36:08), and the read-back reported null for false. A proper plain swipe was taken after `rt.setMemorySettings({innerBeat:false})` (turns.jsonl:20, no inner journal entries). Only 1 usable C3 pair exists (msg 37: swipe 0 = beat, swipe 2 = plain); swipe 1 is contaminated.
- LOW (product): The North Road had no player turn: gate -> road -> fort in one round (turns.jsonl:8). The scripted arrival notes re-describe an arrival that was already played: msg 24 "Carrow Keep comes out of the dusk" after a mid-afternoon sighting, and msg 40 "the doors swing inward" when we were already inside, with a throne scene that contradicts the banquet shown (turns.jsonl:22). The background stayed a moonlit town street inside the keep (shot 023). A stale read queued `location=deep_ritual_fort` after the transition; it was correctly superseded in T3-2.
- LOW (model): the narrator voiced Ced's dialogue in msg 19. 0 model defects (no loops or word drops) in 34 replies with the overlay.
- Judge: 10.4% busy (52 memoryPairs, in bursts at 02:20, 02:29-02:30, 02:40-02:41) plus 13 timeouts at 36/min with 5 lanes. There were 5 console 429s and no other console errors.
- The provocations held. The swipe right after a beat was prepared rolled the reply back cleanly (turns.jsonl:10). The reload mid-generation lost the unsaved player line (ST behaviour), reverted and re-applied the host changes, and recorded "away recap not due" (turns.jsonl:11).
- Spend: DeepSeek 115 calls, 252225/45578 tokens (112 measured); judge 258 calls (2 cached, 40 fallbacks), 1303936/125565 tokens; main RP 34; cost n/a. Pod: about 29 min (02:13-02:42Z).

## T3-2 Timeline levels (lane 3, `test/sessions/T3/T3-2-1`)

- Played 2026-10-02 02:48-03:07Z, continuing T3-1's chat on lane 3 (same pin and overlay). Served bundle `7a1e95c3c47c`. 19 main RP requests, 10 turns, 1 swipe provocation, 1 level switch while a reply was generating. Route: The Altar in the Great Hall -> The Cells of Nahalbuk -> What Unira Says (stop condition: all five levels and the inspector tried, about 19 min). T3-2 inherits T3-1's inner voice settings, so `stop` was INVALID on the same harvest reason; after `reverify` with the branch it is valid with the waiver warning. The pre-reverify copy is at `C:\dev\so-lanes\3\t3\T3-2-1.session.before-reverify.json`. Player-clean ok at stop.

| Row | Score | Evidence |
|---|---|---|
| timeline level 0-2 | works | inline-L0-t3.json, inline-L1-t3.json, inline-L2-t1.json, inline-swipe-before/after.json, turns.jsonl:7, :9 |
| timeline level 3-4 | annoying | inline-L3-playermode.json, inline-L3-t0.json:1768, inline-L4-t0.json, shots/011 |
| message inspector | works | inspector-65.json:9, shots/013-inspector-65.png |
| A1 inspector decision input | recorded | inspector-65.json:9, shots/013 |
| C5/C6 surface decisions | recorded | shots/011, inline-L1-t3.json, inline-L2-t1.json |

Flags: 0. None of the 3 must-not-happens occurred. Level 2 player text had no ids, gate keys or gated names (regex scan clean). Author levels did not show without Author view: request 3 stayed at effective 2 and the select offered 0-2 only. Kela's and Ced's part did not come up in Unira's account (msg 65).

Findings:
- MEDIUM (UX): levels 3-4 are dense. One message carried 34 "Model calls" and 23 "World Info" items. Player messages carry chips too. Raw floats are not rounded (`tension_current: 0.6152645516717542`). Turning Author view on jumps straight to the level remembered from the earlier player-mode request (3).
- LOW (product): the inspector lists the same `deep_unira_truth = true` delta twice (the evidence differs only by a trailing "and—"), and its header repeats "Message 65 / message 65". Facts dedup is only partial: 5 near-duplicate fact pairs out of 49 live facts (Jaccard > 0.5, e.g. two "woman in knight's rags" facts). The "The story is deciding how the world answers that" and "changes not saved yet" chips linger under the last reply (save-lost 0). The background was black in the dungeon (shot 011). The curator re-proposed the same party/Crimsonwing entry update at every checkpoint (review mode, 7 proposals, none applied).
- Model: 0 defects (no loops or word drops) in 19 replies with the overlay. The narrator dropped the shaman confrontation between msgs 63 and 65.
- Judge: 0 busy, 2 timeouts.
- Spend: DeepSeek 50 calls, 119067/18229 tokens; judge 187 calls (1 cached, 2 fallbacks), 1100627/107356 tokens; main RP 19; cost n/a. Pod: about 19 min (02:48-03:07Z).

Fix checks (T3-1 + T3-2, lane 3):
- Secrets kept out of shared tiers per draft: not exercised (no secret setup; 0 empty private blocks).
- No lost queued updates after a chat switch: not exercised (one chat). Across reload-mid-gen, queued deltas were applied at the next boundary (T3-1 boundary 22 onward).
- Status lines belong to their chat: not exercised (one chat; every event tagged with it).
- Away recap current: not exercised (the reload recorded "away recap not due").
- Chapter seal, established rows never folded, folded facts recalled: not exercised (chapters off on this card).
- Warden notes reviewable: not exercised (50 warden/wardenLore judge calls, no flagged reply).
- Party moves accepted: partly. `location` was accepted from "We set out ... up the north road" and "We fall in behind the cart and leave the city", but `deep_set_out` (`world`) was not (see the HIGH finding).
- Generated beats wait for a player turn: not exercised. The one generated chain (deep-the-march) went stale before entry because the authored route fired first.
- Excluded facts don't return via threads: not exercised (no exclusion made).
- Facts dedup: partly (5 near-duplicate fact pairs of 49).
- Shared-read cap 2048: confirmed. All 44 shared reads at max_tokens 2048 finished `stop` (max 1277 output tokens); no re-asks for length.
- Canon recovery: confirmed in the sense that all 17 canon calls returned ok with no cut reply, so no recovery was needed.
- Lazy expansion generation loads: confirmed. 2 `generation` passes ok (02:17, 02:26), and the console shows no chunk errors (only 5 judge 429s).
- Loops and word drops with the overlay: 0 model defects in 53 replies across both cards; one voicing slip (narrator spoke as Ced, msg 19).

Harness branch `v26-t3-harness-setting-harvest` (worktree `C:\dev\so-t3-harness-wt`, commits 57c8eef2 + 859f20c7, not merged):
- `setting` now calls the section's runtime setter so the in-memory view refreshes, and a false flag the store drops counts as landed.
- harvestedReasoning becomes a recorded warning only when no exported reply carries any reasoning (swipes included). Reasoning present but not harvested stays INVALID, and a missing chat export fails closed. The rule is evidence-based (lead): T3-3 without the overlay also got no reasoning, because the group speaker prefix follows the plain instruct.
- New `reverify <dir>` verb.
- node:test: 14 targeted tests pass. `npm run test:debug` in the worktree: 845/846; the one failure needs `dist/manifest.json`, which the unbuilt worktree lacks (840/840 on master).

## T3-3 Inner voice (lane 4, `test/sessions/T3/T3-3-1` INVALID, re-run `test/sessions/T3/T3-3-2`)

- **T3-3-1 (with the overlay, INVALID, kept):** played 2026-10-02 02:13-02:32Z. Chat `2026-10-01@23h13m03s275ms`, 14 turns, 3 flags. Reached The Witch of Thornwood at msg 34 (stop condition). Stop failed on one check: `required artifact harvestedReasoning: 0 captured`. The cause is the overlay itself: its `last_output_sequence` prefills an empty `<|channel>thought\n<channel|>`, so Artemis never reasons, and `chat-full-*.json` has `reasoning: ""` on all 82 rows. The run is not scored. The lead's harness fix (harvest not applicable when no reply carries reasoning) would turn this into a warning; the artifact check is to be re-run after that fix merges.
- **T3-3-2 (`--no-preset-overlay`, valid):** played 03:08-03:27Z. Chat `2026-10-02@00h08m36s572ms`, served bundle `7a1e95c3c47c` (build.head moved mid-run, served bundle identical; allowed), campaign 884380b, 15 turns, 4 flags. Reached The Witch of Thornwood at msgs 39-41. Stop warnings: overlay off, plus `harvestedReasoning: not applicable`. Even without the overlay, the group prompt ends `<|turn>model\nErevan:` (ST's name prefix), so Gemma never opens the thought channel and `extra.reasoning` stays "" (`payloads.jsonl:11`, `:14`). In group chats harvest is not exercised under either preset.

| Row | Score | Evidence |
|---|---|---|
| inner voice (adds vs repeats) | annoying | journal.jsonl:49, :72, :168; payloads.jsonl:147; turns.jsonl:5, :12 |
| secrets kept | broken | turns.jsonl:1, :3, :5, :11 |
| agency at the decision | works | turns.jsonl:8, :12, :18 |

Flags (T3-3-2, 4):
- msg 3: Erevan says "It was not her book. I suspect someone else put it there" on the first question.
- msg 6: Selena, chained in public, all but confesses the assault ("they shut the door and... they tried to...").
- msg 8: Erevan repeats his msg 3 argument almost word for word and says "The book was planted." outright, at the yes/no dodge provocation.
- Stop note: the Thornwood stall, `word-word-word`, and Selena repeating herself.

T3-3-1 flags (3):
- msg 18: Ren repeats the narrator's msg 17 closing beat.
- msg 30: the Thornwood stall.
- msg 34: Kayla asks Selena "what did those Inquisitors try to do to you in that room" untold.

Findings:
- HIGH (authoring/product): the checkpoint's hidden truth reaches every drafted member. The Accused scene block ("What happened, for whoever makes Ren look with his lamp or gets Selena to talk. Two Inquisitors ... tried to force themselves on her ... Reeve Tull ... pushed it under her floorboard") is in every Text Completion prompt, for Erevan, Ren, Selena and the narrator alike (`T3-3-2/payloads.jsonl:11`, `:14`, `:17`, `:24`). That explains Erevan naming the plant first in both runs: he hinted in run 1 ("binding is too new", msg 3) and said it outright in run 2 (msgs 3, 8). It also explains Kayla knowing about "that room" (run 1 msg 34). It should be narrator-only, or carry a per-member filter.
- HIGH (product): the inner beat never reaches the named characters. Beats go only to the likely next speaker, and on this card that is always the narrator (`dm`). T3-3-2 has 21 "Inner beat used" rows, all for Adolion Narrator, against 83 "No inner beat" rows for Erevan, Selena, Ren, Belle and Dalan. Run 1 shows the same pattern: 12 used (all narrator), 79 none. The player addresses members by name, so the prediction made after the previous reply misses them. At the decision, Erevan, Ren and Selena had no motive of their own and repeated themselves: Erevan msg 8 restates msg 3, and Selena msgs 27/29 restate msg 6. The narrator beats are good scene direction, but they are plot steering, not motive.
- MEDIUM (product): a narrator beat steered toward the secret, and arrived a turn late. The beat based on msg 31 reads "Have Selena's mention of her mother draw out the one detail ... that two Inquisitors came into her room". It sat in the narrator's prompt for the cabin-knock reply at msg 33 (`payloads.jsonl:147`). The beat model sees the hidden scene block, so it can push a secret into play.
- MEDIUM (product, reproduced 2/2): the Thornwood transition stalls on `evidence_from: world`. With the party already among the trees and at Kayla's door, the reader kept quoting the player's line ("We push in under the first thorn trees, into the mist.") and was rejected with `evidence only in the player's line`: 5 times in run 1, 8 times in run 2. It never cited the world replies that place the party there. It latched only when a reply said "my wood" or "Thornwood" (run 2 msg 39). Each run lost 3-4 turns at Kayla's door with the checkpoint still The Accused.
- MEDIUM (product): facts dedup fails. T3-3-2 has 50 live facts with 29 near-duplicate pairs (Jaccard > 0.6), e.g. three versions of "Reeve Tull shouted that he did not hide the grimoire". The memoryPairs judge was the busiest use (54 busy fallbacks in run 1, 8 in run 2).
- LOW (model): word damage the detector misses. Run 1: "aconcerned" (msg 15) and "ladle's" (msg 30), with the overlay. Run 2: "He says the word-word-word" (msg 14), without the overlay. The digest reports `model-defect: 0` in both. Loops: 0 in both runs. Repetition: run 1 had 1 chained-voice echo (msg 17→18); run 2 had 2 self-repeats.
- Good: Reeve Tull's planting came out only after 3 presses (run 2 msgs 16/20/23). Ren refused to free Selena on words alone, and the outcome came from my own breakout. No inner-voice text appeared in chat.
- Judge busy: run 1 17.0% (60 of 353, mostly memoryPairs); run 2 4.2% (16 of 385).
- Spend:
  - Run 1: DeepSeek 75 calls, 218032/32515 tokens; judge 229 calls (2 cached, 69 fallbacks); main RP 20.
  - Run 2: DeepSeek 91 calls, 237607/35253 tokens; judge 277 calls (5 cached, 18 fallbacks), 1443875/144665 tokens; main RP 29.
  - Cost n/a. Pod: about 19 + 18 min of play, plus 2 lane seeds (about 8 min each).

## T3-5 Curator ring (lane 4, `test/sessions/T3/T3-5-1`)

- Played 2026-10-02 02:42-03:00Z, author mode. Chat `2026-10-01@23h41m44s699ms`, served bundle `7a1e95c3c47c`, campaign 884380b, with the overlay. 11 turns + 1 swipe-new, 2 flags. Route: Landfall → Jiansho Academy → The Opening Rounds (2 transitions in one group round, turn 4).
- 7 ops decided across 4 proposals, all through the drawer's Scheduler ring (`so-ui curator-accept|curator-reject`): 2 accepted (1 edited first), 5 declined. Stop is valid; `assert-player-clean` n/a (author card).

| Row | Score | Evidence |
|---|---|---|
| curator proposal quality | annoying | journal.jsonl:122, :221, :520, :676; ui-stagecraft-4.txt:165 |
| review UI | works | ui-decide-1-accept-edit.txt:6, ui-decide-1-reject.txt:4, shots/005, 006, 017 |
| apply timing | works | wi-before-boundary.txt:20, wi-after-boundary-1.txt:20, journal.jsonl:261, :578, wi-after-reject.txt:11 |
| rollback of applied ops | annoying | journal.jsonl:301, wi-after-swipe.txt:20, ring-after-swipe.txt:5, shots/010 |

Flags (2):
- Swipe-revert dropped the whole proposal from the ring.
- "About this book" proposed 3x; the Hanzo Hattaxi rewrite declined.

Findings:
- MEDIUM (product): the curator keeps re-proposing a declined meta op. "Switch on Chronicle - About this book" is the book's own house-style note, not lore. It was proposed in all 3 scene-break passes (wi-4-6, wi-8-11, wi-16-25), even after two declines. Declines are not remembered, and the op is never useful.
- MEDIUM (product, by design per `curatorWriter.ts`): a rollback erases the author's decision. Swiping msg 13 restored the Tournament entry's before-image, which is correct. The record then had no retained op and was settled out of the ring. The proposal made on msg 11 (which survived the swipe), with my edited accept and a decline, disappeared without trace. The edit was lost until the curator happened to propose a similar rewrite at msg 17.
- LOW (product): proposals record what the chat says, including names the story gates. The third rewrite wanted "Max unmasked the grey-haired steward ... as Hanzo Hattaxi" in the open, keyword-fired Tournament entry, before The Hattaxi Shadow. Hanzo had said the name in chat (msg 15), so this is not a curator leak, but it fixes a reveal into always-on lore. Declined. Megumi's brother never reached a proposal.
- Good: all ops stayed in `Adolion Chronicle` (`stagecraftScope`), none touched a gated entry, and `dropped`/`refused` were empty.
  - The two Tournament rewrites were specific and correct.
  - Accept showed "applies at the next turn". The entry was unchanged until the next reply's boundary (boundary 9, then boundary 14).
  - Declined ops were never written. The accepted text reached 22 later prompts, since the entry fires by key on every message.
- LOW (model/story): the steward the player pointed at was invented as "Lord Karos". This came from a forced Karos world entry (`lore-fired-1.txt`), and Karos was stored as 3 near-duplicate facts ("grey-haired steward by the door is Lord Karos"). Hanzo, the real steward, appeared only when named. Facts dedup: 46 facts, 20 near-duplicate pairs.
- Judge busy: 9.2% (24 of 261, all memoryPairs).
- Spend: DeepSeek 77 calls, 186803/35425 tokens; judge 213 calls (8 cached, 27 fallbacks), 1072793/105983 tokens; main RP 15; cost n/a. Pod: about 18 min (02:42-03:00Z) plus the lane seed.

Fix checks (T3-3 + T3-5, lane 4):
- Warden notes reviewable: partly. The warden flagged narrator replies twice (T3-3-1 02:20Z, T3-3-2 03:17Z); notes were not reviewed in the drawer, since these are player cards.
- Curator proposals scoped to the story's lorebooks and applied at a boundary: confirmed (T3-5 above).
- Secrets kept out of shared tiers per draft: broken, through a different path. The private blocks were not the leak: the checkpoint scene block carries the hidden truth to every member (HIGH above). T3-3-1 digest: 1 empty private block.
- Party moves accepted: partly. `location` and `night_in_thornwood` were rejected repeatedly as player-only evidence while the world replies agreed (Thornwood stall). `night_selena=freed` was accepted from the world reply after the breakout.
- Generated beats wait for a player turn: not exercised (no generated chain).
- Facts dedup: not fixed (29 and 20 near-duplicate pairs).
- Shared-read cap 2048: confirmed. All 85 reads at max_tokens 2048 (27 + 29 + 29) finished `stop`; max output 1316 tokens.
- Lazy expansion generation loads: no chunk errors in any `console.jsonl`; console errors were only judge 429s (4 + 1 + 6). No expansion generation ran.
- Loops and word drops: with the overlay, 2 word defects (T3-3-1) + 0 (T3-5), 0 loops. Without the overlay (T3-3-2), 1 word defect and 0 loops. The digest detector caught none of the three.
- Judge busy %: T3-3-1 17.0%, T3-5-1 9.2%, T3-3-2 4.2%.
