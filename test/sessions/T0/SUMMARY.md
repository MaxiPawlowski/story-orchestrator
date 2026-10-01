# T0 summary

## T0-3 First slips (lane 3, `test/sessions/T0/T0-3-1`)

- Played 2026-10-01 11:40-12:05Z, chat `2026-10-01@08h40m59s527ms`, served bundle `ceb15ac19ec0`, 14 main RP requests. All four slips + both provocations tried.
- **Session INVALID by `stop`**: run-header diff failed on `build.head` / `build.manifest.*` only (master merged `d444cd7f` and `dist/` was rebuilt at 12:01Z by another session). Served bundle `ceb15ac19ec07dec` identical at start and end, so the code under test did not change. Scores recorded with that caveat; the lead decides re-run vs accept.
- Lane deviation: ST's own "Swipes" setting is OFF in the real install and every lane copy (`settings.json` `swipes: false`), so `swipe-new` cannot work; enabled it on lane 3 only (`#swipes-checkbox`, 11:45Z). Swipe back to the first version was done by hand (`manual-swipe-left.json`), not a driver verb.

| Row | Score | Evidence |
|---|---|---|
| rollback on swipe | annoying | turns.jsonl:9, manual-swipe-left.json, flags turns.jsonl:4/12 |
| rollback on edit | works | turns.jsonl:14-15 |
| rollback on delete | works | turns.jsonl:22-24 |
| step-back notice | annoying | turns.jsonl:24, manual-swipe-left.json |
| timeline follows mutations | works | turns.jsonl:22, 26-27 |

Flags (4): mes 4 (transition note blocks swiping the reply that moved the story), mes 2 (swipe back to first version leaves story stepped back until next turn; notice says "edit"), mes 8 (regenerate with stale note last appends a 2nd reply instead of replacing), mes 13 (re-accepted job, story never left Guild Hall).

Findings:
- HIGH: after the edit-rollback, re-accepting the job never advanced the story (3 explicit acceptances, mes 9/11/14). `path=wendhope` extracted on every read but held by `commit_evidence` because the reader cites NPC lines ("Your posting.", Tobias pulls the notice) that have no commitment verb; the player's own "we'll do it" / "we take the Wendhope job" is never cited. Journal "commitment reading(s) held" x6, journal.jsonl:443 area. Story stuck at guild-hall to end of session while the party rode north.
- MEDIUM: the transition chat note (`/comment`, default on) becomes the last message, so the reply that moved the story cannot be swiped, and `/regenerate` appends a new reply below the note instead of replacing. The note is also not removed when the story steps back (stale "The Road North" note at mes 7 while at Guild Hall).
- MEDIUM: swiping to an existing earlier swipe steps back but does not re-commit, so story state lags the visible text until the next turn.
- LOW: step-back notice always says "to match your edit" (also after swipe/delete) and fires on a rollback that changes no checkpoint.
- LOW: Overview "Where you are" shows raw enum id "At aegis_guild_hall." and stays on it while at The Road North (shots/008, 017); open thread "Wendhope posting ... remains untaken" after it was taken (shots/008).
- LOW: memory fact duplication: "The Ash Lanterns left Aegis City at first light..." stored 6x for mes 11 across re-reads; `party_name` stored as "Ash Lanterns." (trailing period) after the edit re-read.
- Harness: (1) `swipe-new` needs ST swipes enabled, which no lane has; (2) `flag` leaves the drawer open, which covers the swipe arrow so the next forced click hits `.so-overview-layout` (turns.jsonl:7); (3) `swipe-new` reports `generated:false` when the new swipe re-fires a transition and a note is appended (turns.jsonl:9, mes 4 really had 2 swipes); (4) `delete last` / `swipe-new` / `regen` target the transition note when it is last; (5) stop's run-header diff invalidates any session when master moves mid-run although the served bundle is unchanged.
- Spend: DeepSeek 61 calls, 130887/33470 tokens; judge 56 calls (10 cached, 1 fallback), 323117/32948 tokens; cost n/a in rings. Pod: about 35 min of shared pod time on this card.

## T0-1 First contact (lane 1, `test/sessions/T0/T0-1-1`)

- Played 2026-10-01 11:41-12:08Z, chat `2026-10-01@08h41m13s779ms`, persona Max Nightriver, served bundle `ceb15ac19ec0`, 29 main RP requests. 19 player turns; stopped on reaching Hold, Wendhope Is Closed (msg 46). Both provocations done (OOC "what should I do", turns.jsonl:9; page reload + reopen group, turns.jsonl:16-19). Author view never opened.
- **Session INVALID by `stop`** only on `build.head` / `build.manifest.*` (master moved mid-run); `bundle.served.sha256` unchanged (`ceb15ac19ec07dec`), so treated as valid per the lead. Rubric `session.media` reads `full` although images/sprites were patched off (`settingsPatch`).

| Row | Score | Evidence |
|---|---|---|
| entry points | works | shots/002-continue-library.png |
| requirements readout (drawer) | not-noticed | shots/003-drawer-overview.png (no readout in player drawer; snapshot `requirements.ready=true`) |
| HUD | annoying | shots/001, shots/026, turns.jsonl:19 |
| Overview | broken | shots/003, shots/017, journal.jsonl:45/623 |
| transition timing | annoying | journal.jsonl:308, 343, 950, 992 |
| timeline at level 1 (Progress chip) | works | shots/014-progress-chip-open.png |

Flags (4): msg 0 (Overview "At aegis_guild_hall." raw id; no drawer requirements readout), msg 24 (after reload Overview "At north_road." + duplicated open threads), msg 40 (generated checkpoint objective posted twice as chat note, HUD "Current scene"), msg 50 (narrator repeating itself at the gate).

## T0-2 Come back (lane 1, `test/sessions/T0/T0-2-2`)

- Played 12:11-12:28Z on the T0-1 chat. **`start T0-2 --age 24` failed** (`T0-2-1/start-failed.json`, "away recap did not fire") although the backdate reached disk: harness bug, see below. Re-started without `--age` (`T0-2-2`), backdated `lastSessionAt` by 24 h by hand (st-eval, saveMetadata, verified in the chat file), then a real page reload + reopen group: recap popup "(away 1d)" fired (journal.jsonl:624). Recap closed at once, narrator asked for a summary (msg 52). 6 player turns; mid-generation reload done (failed to reopen, reopened by id by hand); stopped when the party got inside (Hold -> The Red Fog at msg 61) + 2 turns.
- Same build-only run-header diff (`build.head`), served bundle unchanged.

| Row | Score | Evidence |
|---|---|---|
| away recap | annoying | shots/001-away-recap.png, journal.jsonl:624 |
| state restored after reload | works | turns.jsonl:7-8 |
| Repair (should stay silent) | works | turns.jsonl:8 |
| transition timing | works | journal.jsonl:981, shots/009 |

Flags (2): msg 50 (recap too long/duplicated/stale/truncated), msg 67 (checkpoint "[Scene direction: ... The Screechers arrive ... Some die ...]" echoed verbatim into Dalan's reply: spoiler in chat).

## T0-1/T0-2 findings by severity (lane 1)

- HIGH: authored `[Scene direction: ...]` injections are echoed by Artemis into character replies (msg 67, T0-2), exposing spoilers (Screechers, Needlehaven, deaths, outcome). Source is the first-night injection, present in 26 captured payloads (`T0-2-2/payloads.jsonl`).
- HIGH (player mode, must-not-happen): Overview "Where you are" prints the raw `location` value ("At aegis_guild_hall.", "At north_road."). `assert-player-clean` did not catch it (its needles only cover selectors/attributes); same seen by T0-3.
- MEDIUM: generated expansion checkpoints (`gen_on-the-road_1/_2`) are named with their full author objective; the transition chat note prints it twice ("Travel the north road ... let the party notice ... - Travel the north road ...", msg 41/44), HUD falls back to "Current scene". They advanced on progress counters with "nothing applied" while the chat was already at the gate, so at-the-walls arrived 6 messages late (journal.jsonl:950/966/992 T0-1).
- MEDIUM: `path=wendhope` accepted by a scene read was discarded as "superseded" when a later reconcile read covering the same turns rejected the player's line as evidence (T0-1 journal.jsonl:308), delaying Guild Hall -> Road North by one reply. Player commitments ("We'll take the Wendhope job.") are rejected as "evidence only in the player's line" (15 extraction-rejected anomalies) - related to T0-3's HIGH commit-evidence finding.
- MEDIUM: pipeline/HUD stuck on "catching up... / Catching up - re-checking recent scenes." from ~msg 26 to the end of both sessions (incl. a day later in the recap Status) with an empty scheduler queue; digest also flags a 10-boundary stall at road-to-wendhope.
- MEDIUM: Open threads (Overview and recap) accumulate near-duplicates and stale items (8 threads at the gate, 3 saying "get inside before sundown"); story-so-far truncated mid-word in the recap.
- LOW: HUD shows the scene location label, not the checkpoint name (card expected "The Guild Hall"); "5 updates next turn" before turn 1.
- LOW: no requirements readout in the player drawer (card expects one); only Repair "Nothing is missing" says ready.
- LOW: one speaker per turn most of the time (Belle/Dalan rarely both react); Artemis narrator degenerates into "And there is ... And the silence. What do you do?*" loops, NPCs end replies with "What do you do?*" (T0-2 msgs 56, 58, 60, 61).
- LOW: extraction invented `party_rank` 0 -> 2 at the gate (T0-2 turn 4); "save not confirmed (no save request went out)" x5/x7 with ST "Timeout waiting for chat to save" warnings (chat file was intact); judge 429/busy fallbacks (15 in T0-1).
- LOW: a player line sent during a mid-generation reload is lost from the chat (T0-2 turns.jsonl:7).
- Harness: (1) `start --age` / `age` cannot fire the recap: `backdateSession` uses `reloadCurrentChat()`, which does not re-hydrate the runtime (no "away recap" journal entry after it), and polls `getAwayRecap()`, which is null once the popup is shown; a real page reload + open-group does fire it. (2) `reload-mid-gen` fails to reopen the group by name after the reload ("no group matching \"Adolion - The Adventurer's Road\"", T0-2 turns.jsonl:7). (3) stop's run-header diff invalidates sessions on `build.head` moves (as T0-3).
- Spend (lane 1): DeepSeek 128 calls, 331887/62212 tokens; judge 424 calls (34 cached, 18 fallbacks), 2055946/198118 tokens; cost n/a in rings. Main RP 44 requests. Pod: about 47 min of shared pod time (11:41-12:08, 12:09-12:28).
