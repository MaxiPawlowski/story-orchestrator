# T4 summary

## T4-4 Restart and update (lane 2, `test/sessions/T4/T4-4-1` INVALID, re-run `test/sessions/T4/T4-4-2`)

- **T4-4-1 (INVALID, kept, not scored):** played 2026-10-02 04:59-05:21Z on a fresh lane 2 seed (pin e6226f4, 3-edit overlay), served bundle `2807f6ab4a6a` (master c8d7f243). Chat A `2026-10-02@01h58m58s365ms`, plus chat B `2026-10-02@02h04m37s728ms` that I made so I could check "other chats untouched". 12 turns, 2 flags. All beats were done. Stop failed on the run-header diff, blocking `inventory.v2Stories` (+adolion-adventurer@31 -@29) and `inventory.groupChats` (+chat B). Both are deterministic for this card. The stop's fixed allow list (`HEADER_DIFF_ALLOW`, `scripts/debug/lib/sessionStop.mts`) cannot accept a library version change, and this card has to save to the library. `--owned` excuses only length growth in an owned chat, not a new owned chat in the inventory. A re-run on the master harness would fail the same way. Harness deviation: my first two "chat B" lines went into A, because `turn` targets the session's primary chat and `--chat` refuses a chat the session does not track yet. I used `adopt` to track B, then re-adopted A.
- **T4-4-2 (valid):** played 05:33-05:55Z after a fresh re-seed of lane 2 (same pin, same served bundle `2807f6ab4a6a`). It was driven with the **unmerged harness fix**: worktree `C:\dev\so-wt-t44-header-allow`, branch `harness/t4-4-header-allow`, uncommitted. The fix touches only the stop's header-diff allow list, and the session dir was copied back here. Chat A `2026-10-02@02h33m03s114ms`, chat B `2026-10-02@02h36m26s213ms` (both group `Adolion - The Adventurer's Road`). 14 turn rows, 3 flags. Stop was valid with no warnings. The diff shows both previous blockers as `ok (allowed by ...)`. Run-header warning: the worktree has no `dist/manifest.json`, so the served-vs-built comparison is unavailable (the served bundle was the master stage).
- Route, run 2: A took the job (The Guild Hall -> The Road North). I made B, took the job there as the Ash Lanterns, and B moved to The Road North. A: Restart from the Overview footer. A: replayed to The Road North. Studio guidance edit to The Road North, which hot-swapped to v30. Played a turn. Studio: deleted `guild_reputation` (A held 1) and cleared its 2 `state_snapshot` uses, then Save -> Cancel. Drawer "Update to v31" -> Keep. B: "Update to v31" -> Restart story. Last A turn on v31.

| Row | Score | Evidence (T4-4-2) |
|---|---|---|
| Restart | annoying | x-state-A-before-restart.json:99, x-state-A-after-restart.json:25, :44, x-wi-A-after-restart.json:6, x-state-B-after-restart.json:48, shots/x-1790919538204-restart-popup.png, journal.jsonl:357 |
| hot-swap | works | x-drive-1790919736556-guidance.json:46, shots/x-1790919736155-guidance-saved.png, journal.jsonl:513, payloads.jsonl:99, x-state-B-after-hotswap.json:11 |
| invalidating choice | works | x-drive-1790920351290-save.json:42, shots/x-1790920345164-save-popup.png, journal.jsonl:612, :628, :664, x-state-A-after-keep.json:8, :21, :27 |
| save vocabulary | annoying | x-drive-1790920351290-save.json:55, shots/x-1790920351014-save-cancel-done.png, x-drive-1790920434406-update.json:52 |

Flags (T4-4-2, 3): Restart turns Author view off and leaves no journal record; the drawer shows the previous chat after a chat switch; "Applied to this chat" after Cancel. T4-4-1 flags (2): the same Restart and Cancel-wording flags.

Findings:
- MEDIUM (product, reproduced 4/4 switches): after a chat switch (`openGroupChat`, the same call ST's chat list uses), the story drawer and the settings panel keep rendering the **previous** chat's snapshot for a while. `getSnapshot()` is right for the open chat the whole time. B is a player-view chat (Ash Lanterns, authorView false). Its drawer showed A's "story so far" ("formed the Second Tries"), A's engine panel ("boundary 6"), Author view ticked, Blackboard/Scheduler/Payload tabs and Edit story. A's drawer showed B's threads ("join the Ash Lanterns") with Author view off. The settings panel in A said "Playing your pinned copy (v29)... newer version (v30)" and hid Open Studio, which made one Studio attempt fail. Each case was read about 5 s after the switch, and it had healed within 60 s with nothing else happening. A player can see another chat's story and the author internals in that window (`shots/x-1790919960824-switch-*.png`, `shots/x-1790919969740-switch-*.png`, `x-leak-*.json`, `x-stale-A-60s-later.json`, `shots/x-1790920033926-error.png`).
- MEDIUM (product, 2/2 runs): Restart resets this chat's **Author view** (`extras.ui.authorView` true -> false). That happens through both the footer Restart and the update choice's Restart (B). It also wipes the session journal down to one "away recap" entry, with no record that a restart happened. The restart itself is correct: it asks first, messages are kept, memory and path are cleared, world info is replayed to `CP guild-hall - Scene` only, and the other chat is untouched.
- LOW (copy, 2/2): after Save -> **Cancel** on an invalidating edit, the toolbar reads "Applied to this chat: this chat kept its version — author kept this chat on its pinned version." Nothing was applied, so the sentence contradicts the save vocabulary ("Not applied to this chat: ...") and states its reason twice. The popup's Cancel line, "keeps playing the version it started with", is wrong after a hot-swap: A started on v29 and plays v30. Taken from the drawer in a chat that made no edit (B), the popup still opens "Your edit is already saved to the library".
- LOW (UX, T4-4-1): a compatible "Update to vN" click in the drawer applies silently. There is no toast and no line: the button just disappears.
- LOW (product): after Keep, a `stale` expansion cache entry's recorded `basis` still carries `guild_reputation` (`x-state-A-after-keep.json`, `nonZero.extras.expansion`). Engine values, versions, latched, history, pinned story and the bound ledger row are clean. The other leftover references are historical extraction audits.
- LOW (product, T4-4-1): after a hot-swap, the library record says `version: 30` while its `raw.version` (and the chat's `pinnedStory.version`) still says 29. An export of the raw would carry the old number.
- LOW (product, T4-4-1 only): after the Restart, extraction (judge typed reading) latched `party_name` = "Party name updated to The Second Tries," (a sentence fragment). The same queue line was journaled 50 times, once a second, from 05:11:31 to 05:12:18 (`T4-4-1/journal.jsonl:446`-`:521`). It did not recur in run 2 ("Second Tries").
- Expected, not a defect: deleting a quality that checkpoints still snapshot blocks Save with "2 validation error(s) block save". Diagnostics name `checkpoints.14/26.state_snapshot.guild_reputation`. Removing those 2 snapshot values in the Checkpoints tab cleared it.
- Digest notes: the 4 `rollback` rows (7 in run 1) are the boundary counter restarting after Restart, so they are false positives. The 1 `save-lost` is the chat-switch guard holding back an empty save of B ("carried no chat integrity ... held back", `journal.jsonl:577`), so the guard worked.
- Fix checks: the save-binds-late guard fired correctly on a fast A/B switch (above). Other fixes were not exercised on this card.
- Harness: (1) Fix on branch `harness/t4-4-header-allow` (worktree `C:\dev\so-wt-t44-header-allow`, uncommitted, not merged). Stop now allows `inventory.groupChats:+<group>/<chat>` for every session chat. A charter can declare `headerAllow` (validated as a string list), and T4-4 declares `["inventory.v2Stories"]`. There is a new test in `sessionStop.test.mts`. `node --test sessionStop.test.mts sessionCharters.test.mts`: 30/30 pass. Replaying T4-4-1's real headers gives 0 blocking paths with the fix and `inventory.v2Stories` without the charter entry. T4-3 (deletes chats and books, "expected here") likely needs the same kind of entry. (2) `turn --chat` cannot target a chat made mid-session until it is adopted, and `adopt` moves "primary". (3) `so-session score` takes no JSON path without a line number.
- Judge: run 2 188 calls, 0 busy, 0 timeouts (36/min). Run 1 223 calls, 3 timeouts (warden, wardenLore, director).
- Spend: run 1: DeepSeek 55 calls, 132030/25522 tokens; judge 121 metered calls (6 cached); main RP 18. Run 2: DeepSeek 49 calls, 115471/25236 tokens; judge 80 metered calls (1 cached); main RP 14. Cost n/a. Pod: about 22 + 22 min of play, plus 2 lane seeds (about 8 min each). DeepSeek and the pod answered throughout (0 model-call failures).

## T4-1 Abuse (lane 3, `test/sessions/T4/T4-1-1` INVALID, re-run BLOCKED)

- **T4-1-1 (INVALID, kept, not scored):** played 2026-10-02 05:20-06:02Z on a fresh lane 3 seed (pin e6226f4, 3-edit overlay), served bundle `2807f6ab4a6a` (master c8d7f243). Chat `2026-10-02@01h58m49s630ms` (Adolion - The Saga), persona Max Nightriver, player mode, media off. 32 main RP requests. 31 driver rows (`turns.jsonl`): 13 turns, 7 swipes (5 clicked, 2 refused mid-generation), 2 edits, 4 deletes, 1 regen and 1 reload-mid-gen. Route: Home to Nightriver -> Father's Summons (stepped back and re-entered) -> Whispers in the Halls (stepped back and re-entered) -> Trial by Combat -> The Night of Knives. Player-clean at stop.
- Stop was INVALID for two reasons: `required artifact chapterRecords: 0 captured` and `foldedTurns: 0`. The cause is structural. Start hung for about 20 min in `_page open` (start-plan `startAt: nightriver-house`). `activateCheckpoint` raised the chapter-jump confirm ("Jumping to Home to Nightriver... leaves the chapter Acts I-II... sealed into a record only if you say so": Jump without sealing / Seal it, then jump / Cancel), and the harness never answers it. I answered **Jump without sealing** through st-eval, since nothing in Acts I-II had been played. After that no chapter could seal inside 45 min, because a seal needs the player to leave Act III.
- **Re-run blocked (not started):** `start T4-1 --lane 3` refused at seed with "C:\dev\so-lanes has 10.7 GB free, a seed needs 11.4 GB". The only reclaimable item it named is lane 5's sprite worktree (`C:\dev\so-lanes\5\adolion-fresh\sprites-884380b627f3`), which is outside my lane, so I left it alone. Drive C: is at 99% (11 GB free). For the re-run, the lead decides how to free disk, and which popup answer the card means: answering "Seal it, then jump" would give the card the sealed chapter that AS-25 asks for.

Provisional reading (not scored, because the session is invalid):

| Row | Would score | Evidence (T4-1-1) |
|---|---|---|
| rollback: story | works | turns.jsonl seq 4/5/6/26/31; journal.jsonl:181-184 (opener delete steps the transition back, "Stepped back to Home to Nightriver"), :906 (delete 18 -> Father's Summons, notice names it), shots/028-after-delete18.png |
| rollback: memory | works | oath rows gone after the edit of msg 6 (turns.jsonl seq 9); rows at msg 7 and 10 were re-read by `rollback:5` (journal.jsonl:442); old msg 16 seal rows were dropped by the swipe |
| rollback: chapters | not exercised | no chapter sealed (see above) |
| rollback: timeline | works | msg 7 chips cleared after the rollback of msg 5; Overview "story so far" follows the edited msg 5; shots/015-after-edit5-rollback.png |
| saves after mutations | annoying | 4x "save not confirmed: no save request went out" at 05:55:58 after the swipe of msg 33 (journal.jsonl:1228-1231); recovered (saveHealth applied at boundary 25, 0 failures); no player chip |

Flags (3): stale curator proposals after the swipe and edit rollbacks; the Natalia seal leak (must-not); a proposal not withdrawn after the delete of msg 18.

Findings:
- HIGH (campaign content, must-not): Natalia says she carries a seal at Father's Summons, before the crypt. msg 16: "Each of us, the true heirs, carries a seal in our blood". The swipe regenerated it: "we each carry a part of that lock in our very veins". The e6226f4 hidden-truth filter does not cover two channels, and both reach every Natalia draft (`payloads.jsonl:142,169,189,192,196,211`). One is the `Chronicle - House Nightriver` entry ("his heir, Natalia and Welden carry the bloodline's seals without the younger two knowing what they are"); the model ignores the "without knowing" qualifier. The other is the persona description ("the Nightriver blood carries a seal that keeps an old evil dormant"). Flag at `journal.jsonl:694`.
- MEDIUM (product): a pending curator proposal is not withdrawn when its reply is deleted or rolled back. `wi-11-18` (a patch to Chronicle - House Nightriver, from msg 18) was still pending after msg 18 was deleted and the story stepped back. `wi-7-7` (msg 7) survived the rollback 9->5 caused by editing msg 5. `wi-3-2` (from the original msg 2) survived the swipe of msg 2. Flags at `journal.jsonl:450`, `:906`. This is the card's own look-for.
- LOW (product): no swipe is handled as a swipe. All five swipes (msgs 2, 16, 21, 33, 37) were caught at the next boundary as "eventless change at message N ... no event announced the change ... stepped back" (`journal.jsonl:207`, `:1223`). The state stayed correct, and no stale row reached the new swipe's prompt (`payloads.jsonl:211,256`). The journal text misnames an ordinary swipe as a foreign rewrite.
- LOW (product): a delete and a swipe of the same scene opener disagree. Deleting the transition's opener (msg 4, Javon) stepped the transition back by design (`journal.jsonl:181`). Swiping the whispers opener (msg 21) left the story in whispers. It stays consistent with the chat, because the transition reply stays in both cases.
- LOW (story/product): scripted lines fire again after a replay, and out of place. After the delete of msg 18 the story re-entered whispers, and the whispers opener "Evening settles over the estate" posted again as msg 25, at the dueling ground. The night-of-knives opener "a servants' door ... clicks softly shut" (msg 36) posted at the lists in daylight. Three narrator messages ran back to back (msgs 24-26).
- LOW (product): roll qualities for other acts (`east_upset`, `esha_her_gaze`, `aegis_examiner_watching`, `war_turn`) flip on every rollback, and come back at the next boundary (turns.jsonl seq 4, 13, 16). This is consistent with seeding per entry boundary, but the rolled-back state holds the previous checkpoint's draws until the next boundary.
- LOW (story): `{{story_quality_progress_toward_saga-board-4}}` is not registered, because a macro key cannot contain `-` (`journal.jsonl:62`, `:611`).
- LOW (setup): the startAt jump keeps the Guild Hall greeting (msg 0). So Wendhope, Belle and Dalan facts sit in memory and in "story so far" for a Nightriver session.
- Empty private block 3x: Javon at boundary 5 (`payloads.jsonl:64`), Merryn at boundaries 23 and 24 holding 8-9 entries (`payloads.jsonl:394,413`). Merryn's case is late in the session and not investigated.
- Harness: (1) start does not answer the chapter-jump popup that `activateCheckpoint` raises on a chaptered startAt, so it hung until answered by hand (no fix made: which answer to give is the lead's call). (2) `turn` closed its round early: after seq 1, Javon's reply arrived during the next verb (`turns.jsonl` seq 3, lengthBefore 4 -> 5). (3) `rollback.happened` reads true on ordinary turns whose boundary superseded a queued read (seq 7, 8, 24), and false on edits that did roll memory back (seq 9). Use the journal, not that field. (4) the digest prints duplicated sections (`findings.md`).
- Provocations held. A swipe during generation is refused by ST, because the arrow is disabled and nothing is clicked (seq 3, 30). Editing msg 5, five back, rolled back boundary 9->5 and replayed cleanly. The reload mid-generation lost the unsaved player line (ST behaviour), the story held at boundary 7, and saveHealth stayed applied.

Fix checks (T4-1, lane 3):
- /cp refused in player mode: not exercised.
- Cast chips only for met characters: confirmed in the end window ("Javon left" msg 22, "Merryn left" msg 35, both already met; evidence-*.json inline).
- Lost-save-only player chip: partly. 4 save-not-confirmed events ("no save request went out") showed no player chip. No real lost save occurred.
- Swipe returns a curator op to review: not exercised (no op was accepted or applied). The related case failed: a pending op from a swiped or deleted reply is not withdrawn (above).
- Scripted line spacing: not fixed in this run. 3 narrator lines ran back to back, an opener fired twice after a replay, and two fired out of place (above).
- Re-ask for a non-player quote: not exercised. 3 deltas were rejected as "evidence only in the player's line", all a no-op `location=javon_study`, and no re-ask was recorded (`journal.jsonl:309,434,693`).
- Inner beats per drafted member: confirmed. Beats were used for 8 members (Narrator 21, Natalia 19, Shiya 17, Ronan 14, Merryn 8, Javon 8, Welden 7, Leila 1); 8 stale beats were correctly refused.
- Hidden truths not in non-holder prompts: not fixed for this truth. It leaks via the Chronicle WI entry and the persona description (above).
- Loops and word drops with the overlay: the detector found 0 in 32 requests. I saw 2 minor issues: a leading-space quote `" Arrangements,"` (msg 5, later edited away) and "No hesitation, no hesitation" (msg 33, later swiped).
- Judge: 449 calls, 5.3% busy (memoryPairs 24) plus 5 timeouts; one console 429.
- Spend: DeepSeek 191 calls, 783980/62233 tokens (186 measured); judge 210 metered (5 cached, 2 fallbacks), 1366674/158419 tokens; main RP 32; cost n/a. Pod: about 78 min of lane activity (04:47-06:05Z, including the 20 min start hang), 42 min of play. The pod is shared with the other lanes.

### T4-1 re-run (`test/sessions/T4/T4-1-2`, VALID)

- Played 2026-10-02 08:00-08:43Z on a fresh lane 3 seed (pin be0696b, 0 seed problems), served dev bundle `d6737acda880` (master 7b93a6cc). Chat `2026-10-02@04h59m59s914ms` (Adolion - The Saga), Max Nightriver, player mode, media off, startAt `what-filwern-left` (startPopups: none). 35 driver rows: 15 turns, 4 deletes, 2 edits, 5 swipe-new (3 clicked, 2 refused), 2 flags. 35 main RP requests. Route: What Filwern Left -> Home to Nightriver (Acts I-II sealed) -> stepped back past the seal -> resealed -> Father's Summons (stepped back twice) -> Whispers in the Halls -> Trial by Combat -> The Night of Knives (stepped back, then re-entered). Stop: valid, playerClean true. Warnings only: build.head moved while the served bundle stayed identical, and there was no reasoning to harvest.

| Row | Score | Evidence |
|---|---|---|
| rollback: story | works | turns.jsonl seq 4/10/13/22/31; journal.jsonl:150, :353, :483, :1366 (each notice names the checkpoint) |
| rollback: memory | annoying | the edit removed the oath rows from msg 12. The scene summary re-read after the edit still says "When Max invoked an oath sworn on his mother's grave", taken from Javon's untouched reply. Flag journal.jsonl:497 |
| rollback: chapters | works | sealed journal.jsonl:130 (adv#1, msgs 0-4). After the delete of msg 4: records [] and the current chapter back to adv. Resealed journal.jsonl:226 (msgs 0-6). shots/003, 005 |
| rollback: timeline | annoying | the timeline and Overview follow the chat, but scripted lines are posted again after step backs (below). shots/007-opener-reposted.png, 028-duel-scripted-repeat.png |
| saves after mutations | works | saveHealth applied at the end, 0 failures. 6x "save not confirmed: no save request went out" at 08:31:26 in a normal round (journal.jsonl:1124-1129); it recovered and showed no chip |

Flags (2): the oath summary after the edit (journal.jsonl:497); scripted lines posted again after step backs (journal.jsonl:1095).

Findings:
- MEDIUM (product): scripted lines that are not openers are posted again after a step back, and land out of place.
  - The Welden beat "Welden crosses the heir's path..." was posted as msg 5. It stayed in the chat after the transition reply was deleted (it is now msg 4, at What Filwern Left), and it was posted again as msg 7 when the story re-entered Home to Nightriver.
  - The whispers beat "The Trial is a day closer..." (msg 26) was posted again as msg 35, at the dueling ground, after the edit-of-27 rollback (19->15). The whispers -> the-duel transition then fired on that repeated line (journal.jsonl:1047, messageId 35).
  - The Night of Knives opener (msg 46, "That night, back at the Nightriver Estate") is posted mid-scene, and Merryn answers after it, still at the lists (msg 47).
  - Openers deleted together with their transition behave correctly (journal.jsonl:350, :1364).
- LOW (product/memory): an edited-away claim survives in derived prose. After the edit, the scene-summary pass re-read the window and still says Max swore the oath, because the replies that quote it are still in the chat. The direct rows (facts, session_details, the arc and Javon's epistemic entry) were removed.
- LOW (product): the private block was empty twice: Javon at boundary 8, holding 2 entries (`payloads.jsonl:142`), and Merryn at boundary 27, holding 6 (`payloads.jsonl:479`). Same members as in T4-1-1.
- LOW (setup): the seal folds the Guild Hall greeting (msg 0) into the Acts I-II record ("In the Adventurers' Guild hall in Aegis City...").
- LOW (judge): 566 calls, 1.9% busy (memoryPairs 11), 8 timeouts (scene/typed/warden at 08:31:22-26), 2 console 429s.
- Harness (not patched): the scratchpad path is shared with a peer agent. A peer's `start T4-3 --lane 1` truncated my start log mid-run (same file name). It had no effect on the session.

Fix checks:
- Curator proposals withdrawn with their source: confirmed, 3 times.
  - The delete of msg 12 withdrew a 3-op proposal (journal.jsonl:351).
  - Deleting the last reply while wi-13-24 was pending withdrew it (journal.jsonl:797, beat 5).
  - The edit-of-27 rollback withdrew another one (journal.jsonl:973).
  - wi-3-2 (from msg 2, still in the chat) correctly stayed pending.
- Swipes handled as swipes: confirmed. 3 clicked swipes (msg 11, and msg 43 twice) and 0 "eventless change" records.
- Openers not posted again after a step back: partly. An opener deleted with its transition is not posted twice, but timed scripted lines are (MEDIUM above).
- Chapter sealed, then rolled back past the seal: confirmed (row 2).
- Natalia/seal must-not: confirmed fixed.
  - The secret ("all carry seals ... Natalia learns it in the crypt") reached only Narrator and Javon drafts (payloads.jsonl:76, 102, 142, 223, ...).
  - None of Natalia's 4 drafts (payloads.jsonl:213, 247, 261, 306) carried it. Hers carried "nobody has ever told her a family secret. 'The seals' is a word she has heard Father and the Duchess use".
  - Her line "We have been discussing my... future. And the seals." (msg 22) matches that authored knowledge and is not a leak.
  - No seal text in the persona.
- Provocations held. The swipe during generation was refused twice: first because the player line was last, then because the arrow was disabled (turns.jsonl seq 23-25). The edit five back (msg 27) rolled back 19->15 and replayed cleanly.
- Spend: DeepSeek 240 calls, 998932/94246 tokens (229 measured); judge 277 metered (7 cached, 16 fallbacks), 1337687/150634 tokens; main RP 35; cost n/a. Pod: about 43 min of play plus the lane seed (07:47-08:00Z), about 56 min of lane activity on the shared pod.

## T4-2 Switching (lane 4, `test/sessions/T4/T4-2-1` INVALID, re-run `test/sessions/T4/T4-2-2`)

- **T4-2-1 (INVALID, kept, scored provisionally):** played 2026-10-02 04:59-05:29Z on a fresh lane 4 seed (pin e6226f4, 3-edit overlay), served bundle `2807f6ab4a6a` (master c8d7f243), media off. The chats were Eshalanore `2026-10-02@01h58m52s124ms` and Adventurer's Road `2026-10-02@01h59m03s658ms`, plus Branch #1 (msg 6) and Branch #2 (msg 4). There were 22 driver rows and 29 main RP requests. Stop failed on the run-header diff: `inventory.groupChats` +Branch #1, +Branch #2. Any card that branches hits this, because `--owned` covers chat growth but not the new chats a session creates. Separately, 3 of 6 `switch-chat-mid-gen` attempts (seq 4, 13, 14) failed with `waitForFunction 15000ms`. ST's `openGroupById` refuses while `isChatSaving` is true, which happens for about 1 s right after a reply (probe: true 05:16:12.355-13.302). The harness clicked only once.
- **T4-2-2 (valid, no warnings):** played 05:40-06:03Z on a fresh re-seed (same pin and bundle). Live verbs and stop ran from the **unmerged harness branch** `v26-t4-2-harness-open-group-retry` (worktree `C:\dev\so-wt-t42`, 2 commits, not merged). The session dir is in the main checkout. Chats: Esha `2026-10-02@02h39m57s735ms`, Adventurer `2026-10-02@02h40m10s079ms`, Branch #1 (msg 9), Branch #2 (msg 2). 18 rows, 26 main RP requests. Route: Adventurer took the job as the Loose Ends -> The Road North -> camp -> On the Road. Esha went The Last Chapel -> The Shrine Stones. Every move was tried at least twice: 3 switches right after a reply plus a 4-hop quick switch, 2 branches, and 1 harness reload plus 1 manual mid-stream reload. Run 1 adds 3 more switches, 2 branches and 3 reloads. Stop condition: each move done twice (about 23 min).

| Row | Score | Evidence (T4-2-2) |
|---|---|---|
| switch mid-generation | broken | turns.jsonl:4, :5, :6, :10, journal.jsonl:393, chat-full-2026-10-02@02h40m10s079ms.json:473 |
| branching | works | turns.jsonl:9, :17, shots/008-branch-notice.png |
| reload mid-generation | works | turns.jsonl:12, :14 |
| no lost messages | works | journal.jsonl:1616, :1769 |

Flags: run 2 had 1 (the manual mid-stream reload note). Run 1 had 1 (the harness switch timeout).

No blocker. No foreign lore was found in any first reply after a switch. `extras.lore.fired` for every Esha reply after a switch shows only `Adolion Eshalanore Checkpoints` plus the shared World/Chronicle books, and every Adventurer reply shows only `Adolion Adventurer Checkpoints` plus the shared books. In the captured main requests (run 1), the Esha prompts never mention Guild, Tobias or Wendhope (0 of 7), and the Adventurer prompts never mention Eshalanore or Ashliel (0 of 21).

Findings (ranked):
- HIGH (product): a reply was generated before the opened chat finished hydrating. Going from Branch #1 back to the parent (same group), `turn` opened the parent at 05:52:01 and the generation request went out at 05:52:08.650. The runtime's "Continuing Adolion: The Adventurer's Road" came at 05:52:09.322. In that window the story's cast and speaker direction were not in force. **Giada**, a member the checkpoint disables who has never been met, spoke (msg 16, `chat-full-...079ms.json:473`, payload `draftMemberName: Giada`, no talk decision recorded). The checkpoint lore was also the previous checkpoint's (`CP road-to-wendhope - Scene` fired at On the Road). Hydrate took 7-17 s on some same-group opens (05:49:16 -> 05:49:33). Every cross-story switch hydrated in 0.5-7 s, before the next send, and stayed clean. This same window between stories is the route by which foreign lore could reach a reply, so it is worth gating sends on hydrate.
- MEDIUM (product, the "no lost queued updates" check fails): queued writes are dropped when you leave a chat. `first_camp=true` was accepted and queued twice (05:45:53 and 05:46:03, `journal.jsonl:393`-`:400`) right before the seq 4 switch at 05:46:08. On return `pendingDeltas` was `[]`, and boundaries 8 and 9 applied nothing (`turns.jsonl:5`). The next cadence read re-queued it, and the camp transition landed 2 turns late (`turns.jsonl:6`). It was recovered only because the evidence was still in the read window.
- LOW (product/digest): a branch inherits the parent's journal, and the events are re-stamped with the branch's chatId. Run 1 has `journal.jsonl:1527` (the 05:06:50 save note, under Branch #2, created 05:26) and `:395` (the same note under the parent). So the digest's "By chat" credits Branch #2 with 13 rollbacks and 20 judge fallbacks from before it existed. Run 2's 22 "rollback" rows are this artifact plus the Continue step-backs. Status lines and new events do belong to the right chat.
- LOW (product): it takes a 3 s window before a continued branch steps back. Right after Continue, Branch #2 (run 1) briefly showed the parent's b14 / road-to-wendhope, then stepped back to b3 / guild-hall. `chatIdentity.checkpointName` names the parent's current checkpoint, not the branch point's. The notice text does not show it.
- LOW (authoring/steering, run 1): the story stalled 14 boundaries at The Road North. The narrator wrote the party at Wendhope's gates (empty parapets), but `reached_walls` requires "challenged by its archers", and no archers appeared. The stall re-check judge answered "nothing shown (max p 0.03)" (`T4-2-1/journal.jsonl:1393`).
- LOW (product, run 1): a cast chip at msg 24 re-announced "Tobias left, Ellie left" long after the transition at msg 6. The likely cause is the cast revert and re-apply on reload.
- Guards held: the save chokepoint held back an empty Esha save during a switch (run 1 `journal.jsonl:395`), a cross-chat save during the 4-hop quick switch ("a save of Esha (8 messages) ... asked for Branch #2", run 2 `journal.jsonl:1616`) and an empty save at stop. On-disk counts match the page for all 4 run 2 chats (12/21/12/6). There was no integrity popup and no wedge.
- Reload: a manual reload while the reply streamed (295 chars in) kept the player line on disk and dropped the partial reply, and the chat and HUD agreed (b11 On the Road). The harness `reload-mid-gen` lost the player line in all 3 runs (run 1 seq 12 and 17, run 2 seq 12), because it reloads as soon as the send button swaps, which is before ST's `sendMessageAsUser` save. In a normal turn the line is on disk within about 5 s. This is a harness timing artifact.
- Harness (branch `v26-t4-2-harness-open-group-retry`, commits 6cac1abb and 7d448951, not merged): (1) `st-navigation openGroup` re-calls `openGroupById` every 2.5 s for up to 30 s while ST refuses the switch. After the fix, the switches in run 1 seq 15 and all of run 2 went through. (2) `headerDiffArgs` allows `inventory.groupChats:+<groupId>/<chatId>` for each session chat. A foreign or removed chat still blocks (new test in `sessionStop.test.mts`, 9/9 pass; related suites 76/76). The T4-4 player's uncommitted `harness/t4-4-header-allow` fixes the same thing, so the two need merging into one. (3) `reload-mid-gen` should wait until the player line is saved, or until the reply streams, before it reloads (not fixed).
- Fix checks: cast chips only for met characters: partly (the chips in the window name only met characters, "Tobias left, Ellie left"; the greeting row was outside the window; Giada spoke with no chip). /cp refused in player mode: confirmed (`/cp state` returned "an author tool... Turn on Author view", and nothing was posted). Re-ask for a non-player quote: confirmed (audit 9 `reask.keys [first_camp]` accepted Dalan's camp line; 3 other re-asks answered NO_DELTA; `runtime-...079ms.json`). Inner beats per drafted member: not exercised (no inner events). Hidden truths only for narrator and holders: not exercised (nothing identifiable in the captured prompts). Loops or word drops with the overlay: 0 in 55 replies (digest `model-defect: 0` in both runs).
- Judge: run 2 534 calls, 0 busy, 3 timeouts. Run 1 614 calls, 34 busy (memoryPairs burst at 05:15) and 6 timeouts, plus 3 console 429s.
- Spend: run 1: DeepSeek 79 calls, 177511/36814 tokens; judge 362 metered calls (11 cached, 21 fallbacks), 2070217/199226 tokens; main RP 29. Run 2: DeepSeek 83 calls, 172895/35646 tokens; judge 328 metered calls (13 cached, 1 fallback), 1938813/187349 tokens; main RP 26. Cost n/a. Pod: about 30 + 23 min of play, plus 2 lane seeds (about 12 and 9 min); in all, 04:47-06:04Z. DeepSeek and the pod answered throughout (0 model-call failures).

## T4-3 Cleanup (lane 1, `test/sessions/T4/T4-3-1` INVALID by construction, re-run NOT done: blocked on the harness)

- Played 2026-10-02 04:59-06:15Z on a fresh lane 1 seed (pin e6226f4, 3-edit overlay applied and read back), served bundle `2807f6ab4a6a` (master c8d7f243), persona Max Nightriver, player mode, media off. Lane 1 had no lease (`so-session lane lease 1`: `lease: null`, `outstanding: []`), so no `--break-lease` was needed. Story `adolion-aegis`, group `Adolion - Between the Roads`. Start created the two card chats: chat one `2026-10-02@01h58m58s371ms` and chat two `2026-10-02@01h59m09s529ms`. I added chat three `2026-10-02@03h01m11s737ms` for the Escape provocation, chat four `2026-10-02@03h10m53s890ms` for the library-delete and clearStory checks, and a solo chat `Akari - 2026-10-02@03h12m49s146ms` with no story. Turn rows: chat two 21, chat one 10, chat three 9, chat four 1. Main RP calls: 75.
- **Why INVALID, and why a re-run would fail the same way:** stop blocks on 3 header paths:
  - `inventory.groupChats`: the two deleted chats, plus chat four.
  - `inventory.lorebookCount` 24->26: the two kept books.
  - `inventory.v2Stories -adolion-aegis@12`: my extra library delete, outside the card.

  Stop also reports "chat X was tracked but its persisted runtime was not exported" for every deleted chat, and "required artifact chats: 1 captured, the card needs at least 2". The card's own Known limits say these diffs are expected, but no charter field declares them, and a deleted chat cannot be exported after it is gone. So this card is INVALID on master on every run. It is the same class as T4-4-1, whose `headerAllow` fix (branch `harness/t4-4-header-allow`) covers only part of it. This card also needs:
  - (a) `headerAllow: ["inventory.groupChats", "inventory.lorebookCount"]`, with removals allowed.
  - (b) A session verb that exports a chat's `chat-full`/`runtime` before deleting it, or an exemption of deleted chats from the export check.

  I did not build it and did not re-run. Substitute evidence for the deleted chats is in `evidence/`:
  - ST's own last backups of all three deleted chats (`backup-last-chat_*.jsonl`, chat metadata included).
  - The mirror books on disk before deletion (`mirror-chat1-before-delete.json`, `mirror-chat2-*.json`).
  - The in-page probe results (`*_st-eval.json`).

  Also inconsistent: `digest` printed `valid: true` for this invalid session, although its documentation says it exits 1.
- **The card's premise did not hold: 5 turns do not create a memory book.** A mirror book exists only when both of these happen:
  - (a) There is a `relationship`-type memory row (`mirroredEntries`, `src/runtime/memoryMirror.ts:66`). No other type is mirrored.
  - (b) A consolidation pass runs. That only happens at `boundary % 10 === 0` (`CONSOLIDATION_CADENCE`, `src/runtime/boundaryWork.ts:8`).

  After 6 ordinary turns, chat two had 36 memory rows, 0 relationships and no book (`syncWorldInfo` -> `skipped: "nothing-live"`). The extractor emitted `relationship` rows only after explicit bond lines ("consider us friends", "who is Jasira to you"). Books then appeared at boundary 30 (chat two, turn 13), boundary 20 (chat one, turn 10) and boundary 10 (chat three, turn 9). A player who plays 5 ordinary turns and deletes the chat sees no prompt. That is fine for the product, but it means the card cannot be played as written: it needs rewording or more turns.
- Route: chat two went Homecoming -> The Guild Tavern -> Market Street; chat one Homecoming -> The Guild Tavern; chat three stayed at Homecoming/Tavern.

| Row | Score | Evidence |
|---|---|---|
| mirror-book prompt | annoying | shots/001-reap-prompt-chat1.png, shots/002-reap-prompt-chat2.png, shots/003-reap-prompt-chat3-before-escape.png |
| keep | works | evidence/2026-10-02T05-59-59-216Z_st-eval.json:15 |
| delete | works | evidence/2026-10-02T06-00-44-074Z_st-eval.json:8 |
| Repair after delete | works | shots/006-repair-author-kept-books.png |

Flags (2):
- Harness deviation: turns 14-21, meant for chat one, went to chat two (`journal.jsonl:1204`).
- A marker flag for the clearStory check (`journal.jsonl:2162`).

No must-not-happen item occurred:
- The prompt appeared only for chats I deleted.
- Keep kept the book.
- No Repair row named a deleted book.
- A test popup opened and closed normally after the reap prompt (`evidence/2026-10-02T06-10-33-351Z_st-eval.json`).

Findings:
- MEDIUM (product, mirror): **every `so_` entry in chat two's mirror book was written disabled.** At boundary 30 the 3 relationship rows were created, and the next read found them `disable: true` (`evidence/mirror-chat2-at-b30.json`). At boundary 40 a fourth entry was added, also off (`mirror-chat2-before-delete.json`). Chat two's `extras.memory.wiWrites` also read `{}` while the book held entries. Chat one's book had its 2 entries ON (`mirror-chat1-before-delete.json`). Once an entry is off it stays off, because `upsertWIEntry` returns `unchanged` for identical text without re-enabling it (`src/services/stHost/worldInfo.ts:263`). The cause of the first disable is not established. Candidates:
  - A stale-state patch that drops `wiWrites` (the "patch spread" class in gotchas), followed by a stale sweep.
  - A disable writer acting on a shared cached book object.

  Consequence in file mode: chat two's relationship memory never reached the prompt through World Info.
- LOW-MEDIUM (UX): in the reap prompt, the destructive **"Delete lorebook" is the OK button and has initial focus**. `document.activeElement` was "Delete lorebook" on all 3 prompts, so Enter permanently deletes the book. The library "Delete story" popup does the same ("Delete" is focused). Escape is safe: it is treated as Keep (orphan reason `declined`, book kept).
- LOW (copy, expected per the card): the prompt names the chat by its raw id and the book by its full file name (`"2026-10-02@01h58m58s371ms"`, `"Story Orchestrator - Adolion Between the Roads - 2026-10-02@01h58m58s371ms"`). The wording is otherwise clear: the book is still there, deleting it cannot be undone, and the buttons are Delete lorebook / Keep it.
- LOW (product): the reaper's decision is **not in the session journal**, although the card lists it under "logged automatically". There is no `reap`/`orphan` event in `journal.jsonl` or in any chat's journal. The decision exists only in the in-memory `orphanedLorebooks`, which is session-scoped and gone after a reload.
- LOW (UX, author view): a kept book becomes a Repair row that stays until reload: "A deleted chat left its story memory behind in a lorebook... (you chose to keep it)". It shows raw ids, offers no action, and nags about a deliberate choice. Player mode shows nothing (`viewerRepairStep` drops it because `player: null`).
- LOW (UX): after the author deletes the played story from the library, the chat correctly keeps playing its pinned copy. The panel says "Playing your pinned copy (v12)", and reopening the chat kept it (`evidence/2026-10-02T06-13-21-498Z_st-eval.json`). But the story select reads "Select a story" and the Continue card says "No story is playing in this chat yet." (`shots/006`). The "Export state" button is clipped ("xport stat") in the same panel.
- Cleanup inventory at stop (lane 1):
  - Mirror books: 2 kept (chat one and chat three, both kept deliberately), 0 leaked. `so-assets list --marker "Story Orchestrator"` lists exactly those 2 lorebooks; characters, groups, regex, QR, ledger and sessions are empty.
  - Wizard sessions: 0.
  - Library: 8 stories (I removed aegis).
  - The group's `disabled_members` is Homecoming's own cast state for chat four, not residue.
  - The deleted chats' files are gone from `chats/`. ST's `backups/` still holds copies, which is ST's own behaviour.
- Fix checks:
  - **clearStory resets the journal: confirmed.** A fresh solo chat with no story showed `getSessionJournal() = []` and "No story selected for this chat", while the previous chat held 52 entries plus a marker flag (`evidence/2026-10-02T06-12-58-556Z_st-eval.json`). Reopening chat four brought back its own journal with the flag. After the second delete, ST landed on the group's other chat (`01h52m22s113ms`), which showed only its own seed-time journal and nothing from the deleted chats.
  - **Mirror book reap: confirmed.** Delete removed the book from the server list and from `worldInfoCache`, left no orphan row, and did not touch the other books. Keep and Escape both left the book and recorded `declined`. Only the deleted chat's book was offered (exact suffix plus owner marker).
- Harness:
  - (1) `turn` without `--chat` goes to the session's primary chat (the last one start created), not to the open chat. 8 turns meant for chat one went to chat two before I noticed (flagged).
  - (2) This card cannot be valid on master (see above).
  - (3) `stop` printed "could not reopen ... Timed out waiting for chat change" for the deleted chats, which is expected for deleted chats.
  - (4) My in-page probe also called `rt.syncWorldInfo()` once on chat two at boundary 15. It returned `nothing-live` and wrote nothing.
- Judge: 1001 calls, 934 answered. Busy rate 5.0% (memoryPairs 43, lore 7), 17 timeouts. The judge produced 6 console 429s and 67 judge-fallback rows. There were 3 stalls at Tavern/Market Street (10 boundaries without a transition). That is plausible, because I was deliberately talking rather than moving.
- Spend: DeepSeek 109 calls, 301813/55415 tokens (all measured). Judge metered 16 calls (3 cached), 78126/9085. Main RP 75 calls. Cost n/a (`test/sessions/BUDGET.md:36`). Pod: about 76 min of session time (04:59-06:15Z), plus a lane seed of about 9 min. DeepSeek and the pod answered throughout (0 model-call failures, 0 model defects).

## T4-3 re-run (lane 1, `test/sessions/T4/T4-3-2`: stop VALID, but the card's delete beats could NOT run through `delete-chat`; checked by hand after stop)

- Played 2026-10-02 08:00-08:22Z on a fresh lane 1 seed (pin be0696b), served dev bundle `d6737acda880` (master 7b93a6cc), persona Max Nightriver, player mode, media off. Chat one `2026-10-02@04h59m58s914ms`: 12 bond turns. Its book appeared at boundary 10, after 9 turns. I played 3 more turns because my probe misread `memory.wiBook`. Chat two `2026-10-02@05h00m18s777ms`: book at boundary 10 after 7 turns. Stop: `valid: true`. The header diff was limited to the allowed `lorebookCount 24->26`, chat growth and the group's cast. Digest: 0 flags, 1 stall (Homecoming, expected: bond talk, no exam choice), 2 judge timeouts (scene), 0 model failures.
- **Why the card's beats were not played in-session (harness, two defects in `delete-chat`; not patched):**
  1. `scripts/debug/lib/sessionExport.mts:25` reads `snapshot.memory.wiBook` as a string. The product stores `{name, chatId}` (`src/runtime/extras.ts:138-141`), so `exported.wiBook` is always null. `delete-chat --book keep` on chat one was refused with "has no story-memory lorebook yet ... nothing was deleted" (`turns.jsonl:21`). At that moment the book was listed with 8 enabled entries (`evidence/mirror-books-both-chats-before-delete.json`). So `--book` is refused on every chat that has a book. Without `--book`, the verb would delete the chat and leave the prompt unanswered.
  2. `scripts/debug/lib/sessionDelete.mts:21` `REAP_PROMPT` still matches the old wording `The chat "<id>" was deleted`. The product now says `You deleted the "<title>" chat started <date> <time>. ...` (`src/runtime/mirrorReaper.ts:62`), and a timestamped chat id no longer appears in the text at all. Even with (1) fixed, the prompt would be treated as "unexpected" and closed with `.popup-button-cancel` (Keep it). `--book delete` would then keep the book, and `--book escape` would never press Escape. The unit test passes only because it fakes `answerReap` with the old text (`sessionDelete.test.mts:20`). Fix: match on `[data-so-reap-chat="<id>"]`, which the product sets on the prompt root (`mirrorReaperHost.ts:11`), and read `wiBook.name`.
- **Post-stop manual checks** (lane 1 copy, after stop and digest, real key presses over CDP 9301, evidence in the session dir): chat two `/delchat` + **Escape**, chat one `/delchat` + **Delete lorebook**, then the library delete prompt on the group's remaining chat. Afterwards I re-imported the pinned copy and switched author view back off, so the lane's library is unchanged (`adolion-aegis@12`).

| Row | Score | Evidence |
|---|---|---|
| mirror-book prompt | works | evidence/poststop-chat2-escape-manual-reap.json, shots/poststop-chat2-escape-reap-prompt.png |
| keep | works (Escape path, Keep focused by default) | evidence/poststop-chat2-escape-manual-reap.json |
| delete | works | evidence/poststop-chat1-delete-manual-reap.json |
| Repair after delete | works | shots/poststop-repair-after-deletes.png |

Fix checks:
- **Mirror entries enabled while live: FIXED.** Chat one's book had 8 `so_` entries, all enabled, and `wiWrites` held 8 hashes. Chat two's book had 4 entries, all enabled, matching its 4 live relationship rows. The only disabled entry in each book is the `so-owner` marker (`evidence/mirror-books-both-chats-before-delete.json`).
- **Reap prompt safe default: FIXED.** `document.activeElement` = "Keep it" (`menu_button_default`) on both prompts. Wording: `You deleted the "Adolion Between the Roads" chat started 2026-10-02 05:00. Its story memory is still kept in a lorebook. Delete that lorebook too? This cannot be undone.`, with `Lorebook: <file name>` in muted text below. Plain words, no raw chat id in the sentence.
- **Escape = Keep, journaled as dismissed: FIXED.** The book was kept, and the journal recorded `Kept the story-memory lorebook of the "Adolion Between the Roads" chat started 2026-10-02 05:00: the question was closed without an answer.` Delete was journaled as `Deleted the story-memory lorebook of ...`, and the book left the list.
- **Kept book is not a Repair row: FIXED.** Repair read "Nothing is missing." with chat two's book kept, and `orphanedLorebooks: []`.
- **Library delete prompt defaults to Cancel: FIXED.** "Keep" is focused. Escape and Enter both kept the story. "Delete" removed it (`evidence/poststop-library-delete.json`, `shots/poststop-library-delete-prompt.png`).
- **Pinned story shown after library removal: FIXED.** The select reads `Adolion: Between the Roads (pinned copy, not in the library)`. Continue reads `Playing "Adolion: Between the Roads" from this chat's pinned copy. It is no longer in the library.` `storyIdentity.libraryVersion: null`, `pinned: true`, and the Overview was unchanged (`shots/poststop-after-library-delete.png`).

Findings (ranked):
- HIGH (harness): `delete-chat` cannot delete a chat that has a book, and it cannot answer the reworded prompt (the 2 defects above). T4-3 stays unplayable in-session until both are fixed.
- LOW (product copy): the prompt's title comes from the book's file name, so the colon is lost ("Adolion Between the Roads", not "Adolion: Between the Roads"). The time is the chat-id stamp (server local time).
- LOW (product): the reaper decision is journaled into whichever chat ST opens next, not tied to the deleted chat. Escape for chat two landed in chat one's journal. Delete for chat one landed in the group's seed chat `04h54m18s523ms` at boundary 1. The detail names the right book and chat, so the decision is readable but sits in an unrelated chat's journal.
- LOW (product, unexplained): when chat one's reap prompt showed, a second `dialog[open]` was also present (`otherDialogs: 1`). It was gone 4 s later without being answered. Not identified; possibly ST's own chat-switch popup.
- LOW (product): `host change "cast" was reverted when this chat reloaded` was journaled twice at the same instant, on the switch after the first delete (`evidence/poststop-chat2-escape-manual-reap.json` journalTail).
- Note (harness/start): `start` removed lane 4's stale sprite worktree (`C:\dev\so-lanes\4\adolion-fresh\sprites-e6226f4c1011`) on its own, during its disk check. That was not my action, and it was not in lane 1.
- Spend: DeepSeek 23 calls, 74382/12519 tokens; judge 290 metered (6 cached, 2 fallbacks); main RP 24. Cost n/a. Pod: about 22 min of play (08:00-08:22Z) plus a lane seed (07:47-08:00Z, no model calls).

## T4-3 run 3 (lane 1, `test/sessions/T4/T4-3-3`: VALID, all deletes in-session through `delete-chat`)

- Played 2026-10-02 08:36-09:04Z on a fresh lane 1 seed (pin be0696b), served dev bundle `d6737acda880` (unchanged all session; master moved to d7f975bf mid-run, allowed by served identity), player mode, media off. Chat one `2026-10-02@05h36m11s589ms`, chat two `2026-10-02@05h36m22s833ms`, chat three `2026-10-02@05h54m03s829ms` (new-chat + adopt, for the Escape provocation). Each got its mirror book after 8 bond turns (boundaries 10, 11, 10); all `so_` entries enabled (`evidence/mirror-books-before-deletes.json`). Stop `valid: true`, header diff 0 blocking.
- Deletes, scored from the harness's own rows (fix 8c57188c confirmed: book read from `wiBook.name`, prompt found by `data-so-reap-chat`):
  - chat one `--book keep`: prompt answered, book kept, `asAnswered: true` (`turns.jsonl:17`).
  - chat two `--book delete`: book gone from the server list and `worldInfoCache`, chat one's book untouched (`turns.jsonl:19`, `evidence/after-delete-chat2.json`).
  - chat three `--book escape`: book kept, journaled "the question was closed without an answer" (`turns.jsonl:30`, `journal.jsonl:1010`).
  - Repair "Nothing is missing." and `orphanedLorebooks: []` after each; no dialog left open.

| Row | Score | Evidence |
|---|---|---|
| mirror-book prompt | works | turns.jsonl:17, :19, :30 |
| keep | works | turns.jsonl:17, :30, journal.jsonl:673, :1010 |
| delete | works | turns.jsonl:19, evidence/after-delete-chat2.json, journal.jsonl:697 |
| Repair after delete | works | evidence/after-*.json, shots/018, 020, 031 |

Findings (ranked):
- LOW (product copy): two chats started in the same minute get identical prompts ("chat started 2026-10-02 05:36"), told apart only by the muted `Lorebook:` line; title drops the colon.
- LOW (product, carried): the reaper decision is journaled into whichever chat ST opens next, not the deleted one.
- LOW (harness): `modelDefects.mts:45` "doubled word" rule flags "tell you you're" (`\b` before the apostrophe); produced the session's 2 auto flags and 1 "corrupt" model defect (`turns.jsonl:15`). Not a model defect.
- Expected: 2 stalls at Homecoming, 5 judge timeouts, 2 extraction rejections, 0 model-call failures, 0 save-lost.
- Spend: DeepSeek 35 calls, 129416/23639 tokens (all measured); judge 440 metered (8 cached, 5 fallbacks), digest 453 calls / 448 answered / 0 busy; main RP 31. Cost n/a. Pod: about 27 min of play plus a lane seed (08:30-08:36Z).
