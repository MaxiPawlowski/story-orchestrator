# Plan 14 review pack (joint review with the user)

**Status:** Part B is still running (2026-10-02): T0–T3 are done and T4 is running. Sections fill in as tiers finish. Evidence lives under `test/sessions/<tier>/`, and findings and fixes are in `14-findings.md`.

## How to read this

Each decision item below covers:

- **Frame:** what the issue is and where it comes from.
- **Impact:** who sees it and what happens if nothing is done.
- **Evidence:** the measurement or session that shows it.
- **Tried:** what I already did, including fixes, workarounds and dead ends.
- **Options** and **my recommendation.**
- **You:** the one thing I need from you.

The table is the short version; each section has the rest.

**Decisions (user, 2026-10-02):**

- Items 3–8: approved as recommended.
- Item 9: option (c) in v2.6; the house-rules question gets world-book context and is re-measured.
- Items 2 and 10: wait for the thinking and model A/B, which is running.

Item 3 is applied with ST stopped by `C:\dev\so-lanes\backups\apply-review-item3.py`. The script refuses while :8000 listens, backs up first and reads the result back. It does not change the selected profile, `Artemis Local (Unsloth)`, because only you can fix its key.

| # | Item | You | Effort |
|---|---|---|---|
| 1 | Blind model comparison (20 turns × 4 setups) | rate blind; it picks the model | 20–60 min |
| 2 | Three ST preset edits that fix Artemis word-dropping and empty replies | approve, then apply on your install | 5 min |
| 3 | Stale and broken Connection Manager profiles on your install | apply the script or the UI edits; say whether to delete one profile | 5 min |
| 4 | Transition chat note now off by default | confirm or revert | 1 min |
| 5 | Chance rolls ship with two caveats | confirm the caveats are intended | 2 min |
| 6 | `/cp activate` jumps play the target unstaged | keep (c) or revisit (b) | 2 min |
| 7 | Campaign rewrites (4 rounds) | skim; veto anything | 15 min |
| 8 | Judge per-lane rate is built on an assumed 90/min | decided 2026-10-02: your documented limits replace it | done |
| 9 | House-rules judge off by default; option (c) built and re-measured 2026-10-02: broken 18/18, still below the untouched floor (165/172), stays off | nothing; read the result | 1 min |
| 10 | Inner voice harvest cannot work with Artemis on this setup | choose a direction; optionally fund a 1 h A/B | 5 min |

---

## 1. Blind model comparison pack

**Frame.** The A100 experiment (item 2) produced four setups that could run main RP:

- **BL0:** Artemis v1.1 as your install runs it today.
- **BL1:** v1.1 with the preset fixes.
- **BL2:** Artemis v1.2 with the same fixes.
- **BL3:** Cydonia 24B v4.3, with `min_p` first.

Objective counters can see loops and broken words. They cannot see which reply is better to play with. That is a taste call, and it is yours.

**Impact.**
- Your rating decides what your install runs after v2.6. It also decides what the lanes run, if any tier is left.
- v1.2 is a drop-in replacement: same template, server flags, VRAM and speed.
- Cydonia would also need the Mistral V7-Tekken template and half the context (98k), so it would serve 2 lanes instead of 4.
- Until you rate, the lanes stay on v1.1 with the fixes (BL1).

**Evidence.** There are 20 real turns from the T0/T1 sessions. 5 of them are known loop or word-drop turns, including b20, which already has a loop in its context. Each turn has 4 replies, shuffled independently per turn. `15-model-config.md` §Blind pack holds the objective counters (loops, broken words, forced picks, agency). Reading them before you rate will steer you, so read them after.

**Tried.**
- A judge model (gpt-6-astra) scored the pack blind first. Its result is unsealed in `judge-first-pass/unsealed-summary.md`; read it only after rating.
- The answer key is sealed. Its sha256 is in the README, and `node scripts/debug/so-model-blind.mts verify-key` checks it.

**Recommendation.** No recommendation before your rating; that is the point of the pack. If you are short on time, rank only (column `rank_1to4`); that is enough to decide.

**You.** Fill in `test/sessions/rating-pack/model-blind-20/rating-sheet.csv`. Read the `README.md` first, then `pack.md`.

---

## 2. Server/model configuration: three ST preset edits

**Frame.** In T1, Artemis showed two symptoms late in sessions:

- **Word-dropping:** "theis the", "a small, smile", "Belle's on feet". Msg 25 of T1-2 was unreadable.
- **Line loops:** "The valley is quiet." repeated to the 600-token cap, 6 replies in a row in T1-3.

I first suspected the server: KV-cache quantisation, 4 slots sharing one cache (`--kv-unified`), or the build. I tested that on a separate A100 pod, as you asked.

**Impact.**
- Both symptoms hit your real install today, because it runs the same model and preset.
- Once a loop is in the context, every later turn plays inside it. That happened in T1-3, msgs 48–58.
- A dropped word in a member's reply gets imitated by the next member (Belle copying Dalan's broken msg 25).

**Evidence (`15-model-config.md` §DRY A/B, §Server-flag A/B).**

1. **The cause is in the sampler, not the server.** The model imitates its own stock phrasing ("He looks at the player, and…"). DRY (the repetition penalty) then punishes the right next token (a comma at p 0.82–0.93), and the junk token still passes `min_p`, because `min_p` runs after DRY. Every damaged site I read sits on such a forced pick.
2. **Loops are invisible to DRY.** The "\n" sequence breaker stops DRY from matching across lines.
3. **None of the server flags changed either symptom:** f16 KV, one slot, smaller context, `--swa-full`, flash-attention off, latest llama.cpp build, Q8 weights, no prompt-cache reuse.
4. **The empty thought channel moved both symptoms.** This is `<|channel>thought\n<channel|>` after the final `<|turn>model`, which Gemma 4 is trained to emit when thinking is off.
   - Word damage: 0/54 with it, against 7/125 without.
   - Imitation of broken context: 0/24, against 31/88 (p < 0.001).
   - Loop onset from a clean context: 0/16.
5. **`min_p` first** removes forced picks by construction (0 in every arm).

**Tried.**
- **Six DRY variants** (morning A/B): every arm either kept one symptom or made the other worse. Removing "\n" from the breakers breaks loops but collapses long prompts into letter-spelling ("heL-I-L-E-S-O-T…"), so it must not ship.
- **Two other repetition samplers:** a classic repetition penalty did not break loops. XTC broke 2 of 4 but raised forced picks 5×.
- **Ten server/model arms on the A100.** That took 129 min, about USD 3.40.
- **Third edit, found at T2 start:**
  - **Cause:** ST's "Sequences as Stop Strings" turned the thought-channel markers into stop words, so every reply that opened the channel stopped at once and came back empty.
  - **Impact:** every T2 start failed at the profile probe.
  - **Proof on the pod:** with the stops on, the reply was `''`. With them off, it was `<|channel>thought\n<channel|>PONG`.
  - **Workaround rejected:** a player agent proposed a probe fallback, and I refused it because it would have hidden the risk.
- **Lanes:** they run all three edits from T2 on (`adolion-fresh` preset overlay). Each session records the overlay and fails its start if the page disagrees.
- **Loop guard kept:** nothing escapes a loop that is already in the context, so the harness still swipes any reply with a line repeated 3 or more times.

**Side effect, and why this item is OPEN.** The empty thought channel switches thinking off, and you want thinking and the inner voice (2026-10-02). The likely mechanism is that the bad prompt ended with no thought block at all, a shape Gemma 4 never sees in training; a real thought block (thinking on) is the other trained shape, and with the corrected sampler order it has never been measured (the September thinking failures ran on the adaptive-P preset). A thinking-on A/B runs after T4 (item 10 (b)); its result replaces the recommendation below.

**A/B result (2026-10-02, `15-model-config.md` §Thinking A/B, hand-read).** Thinking on is as clean as the fix, once the prompt really opens a thought block after the speaker name:

| Setup (Artemis v1.1, `min_p` first) | Damaged | Loops | Opened a thought |
|---|---|---|---|
| Fix: empty thought channel (control) | 0/26 | 0/26 | – |
| `Gemma 4 Thinking` instruct + opener after the name | 0/20 | 0/20 | 20/20 |
| Thinking token only + opener after the name | 0/24 | 0/24 | 24/24 |
| `Gemma 4 Thinking` instruct unchanged, group | 10/20 | 4/20 | 0/20 |

The unchanged instruct ends the prompt on `Dalan:` and never opens a thought: that is the September shape. Costs of thinking: median 381 reasoning tokens, 2/20 empty replies on the blind turns (budget spent in the thought), first token ~13 s later solo and ~65 s with 4 busy lanes (12 s without). No setup escapes a loop already in context.

**Recommendation, replacing the one below once you have rated the blind pack `model-blind-20-think`:** unless your rating clearly favours the control, ship the thinking setup instead of edit 1:

1. Instruct `Gemma 4 Thinking`, "Last Assistant Prefix" (`last_output_sequence`) empty.
2. **Start Reply With** = `<|channel>thought` + newline (it lands after ST's `Name:` prefix).
3. "Names as Stop Strings" off (on, it cut the reasoning at the first character line in 4/6), and "Sequences as Stop Strings" off (edit 3).
4. Reasoning auto-parse on, Gemma 4 reasoning template; max response at least 1400 tokens.
5. **Auto-fix Markdown off** (User Settings). On, ST's streaming cleanup eats the first characters of replies with `*` narration (T5-5-1: `rre's eyebrow arches`, `re: "A wise decision."`).
6. A global regex script (Extensions > Regex), placement AI Output, not "Alter Chat Display"/"Alter Outgoing Prompt", Find Regex `/<channel\|>\s*{{char}}:\s*/g`, Replace With `<channel|>`, macros in Find Regex "Escaped". It drops the speaker name the model repeats after the thought (4/12 Forre replies); ST's own name trim cannot see it behind the opener.
7. Edit 2 (`min_p` first) stands either way.

Verified end to end on lane 2 (2026-10-02, `15-model-config.md` §T5-5-1): 13 replies with text across Forre, Alexander and the narrator, 0 damaged starts, 0 repeated names, reasoning parsed in 15/15; 2/15 spent the whole budget in the thought. The harvest was verified in T5-5-1.

**Options.**
- (a) Apply all three edits. This is my recommendation.
- (b) Apply only 1 and 3. Edit 2 adds nothing measurable on top of 1; it is a cheap guard.
- (c) Leave your install as is and live with the loops.

**Recommendation, pending the thinking A/B:** edit 2 (`min_p` first) stands either way. Edits 1 and 3 stand only if thinking on measures worse; if it measures as clean, the recommended edit becomes the thinking template instead. Server flags stay unchanged:

```
LLM_CTX=196608
LLM_PARALLEL=4
LLM_KV_TYPE=q8_0
--kv-unified
```

**You.** Approve, then apply the edits. You can do it yourself, or I can with ST stopped.

1. In instruct template `Gemma 4`, set "Last Assistant Prefix" (`last_output_sequence`) to `<|turn>model` + newline + `<|channel>thought` + newline + `<channel|>`.
2. In preset `Artemis v1.1 RP`, move `min_p` to the front of the sampler order (`["min_p","penalties","dry","top_n_sigma","top_k","typ_p","tfs_z","typical_p","xtc","top_p","adaptive_p","temperature"]`), then save the preset.
3. In instruct template `Gemma 4`, untick "Sequences as Stop Strings".

**Not tested:** Blackwell-specific kernels (the A100 cannot run them), and more than 8 samples per arm on the word-dropping prompts. The strong evidence is the imitation result (31/88 against 0/24).

---

## 3. Your real install's profiles

**Frame.** The model-config audit (Part A item 5) read every Connection Manager profile on your install. I edited only the lane copies. Your ST at :8000 was running, and it saves its in-memory settings over the file.

**Impact, per profile:**

| Profile | Problem | What happens if you leave it |
|---|---|---|
| `Artemis RunPod` | instruct `Gemma 4 Thinking`, preset `Artemis v1.1` (adaptive-P 0.25, the garbage-producing setting), stale model id | selecting it gives you the loop/garbage condition from 2026-09-19 |
| `Story Orchestrator Memory Local` | points at :1235, which does not answer | any role or route you point at it fails in under 10 ms; nothing routes to it today |
| `SO Memory RunPod` / `SO Memory Unsloth` / `Image Director` | RP system prompt (Sphiratrioth) attached | harmless for our passes (CM requests never apply the system prompt), but wrong the moment one of them is selected as the main connection |
| `Artemis Local (Unsloth)`, **the selected profile** | :18888 answers `401 Not authenticated` | a fresh ST start (and every fresh lane) talks to a dead endpoint until something switches profile; the lanes switch to `Artemis RunPod RP`, other scripts do not |

**Tried.**
- Every adolion-fresh seed patches these on the lane copy. That patch is on master as branch `v26-model-config`, together with F6 (DeepSeek context 8k → 131k) and F7 (the first read budget 512 → 1024, which ended 15/20 re-asks).
- A backup of your `settings.json` is at `C:\dev\so-lanes\backups\settings-20261001T081635.json`.

**Recommendation.**
- Fix the first and third rows.
- Delete `Memory Local` if you no longer run a model on :1235.
- Fix or deselect `Artemis Local (Unsloth)`; it may just need its key re-entered.

**You.** Run the script in `15-model-config.md` §Real install with ST stopped, or make the same edits in the UI. Tell me whether to delete `Memory Local`.

---

## 4. Transition chat note now off by default

**Frame.** When the story moves to a new checkpoint, the extension can post a `/comment` note in the chat ("Turned Away at the Gate — …"). W11 left the default to the T0 sessions.

**Impact.**
- The note is posted after the reply that moved the story, so it becomes the last message. ST only swipes or regenerates the last message, so the reply that caused the transition can no longer be swiped.
- That is exactly the reply a player most wants to retry. In T0 the players hit it.
- The note also printed generated beats' objectives twice; that is fixed either way.

**Tried.**
- No placement works. The transition commits only after the reply renders, so the note cannot go before the reply.
- The inline timeline (plan 08) already shows each transition as a chip under the reply that caused it, and chips do not block swiping.
- The note stays available as an opt-in, "Also post a chat note" (`#so-announce-transitions`). An install that had it stored on keeps it.

**Recommendation.** Keep it off.

**You.** Confirm, or tell me to revert.

---

## 5. Chance rolls ship (D5) with two caveats

**Frame.**
- SP7.b put seeded dice rolls into the product: a `roll` quality is drawn from a hash of chat, story, checkpoint entry and key, so swipes, rollbacks and reopens see the same value.
- Adolion authors 7 rolls; `deep_swarm` (Act IV) is the shipped example.
- Two of the rolls can take something away from the player.

**Impact.**
- **`east_upset`:** on a d6 ≤ 2 at the East rounds, the judges uphold a bad call and overturn a bout the party won. The guidance asks the narrator to play it as visibly unjust. If the narration reads as the player's loss instead, the roll took a player-earned outcome.
- **`night_moon`:** on a d6 ≤ 2 at the night siege, talking stops working ("no talk works tonight"). It fires only after the party has met Lobo, and the branch states the cost. A player who chose talk may read it as a refusal of their choice.

**Evidence.** The design is in the SP7 report §D5. No session in T0–T3 reached either branch, because the cards played the adventurer, war, academy, Crimsonwing and Thornwood stories. So this is an expectation, not an observation.

**Tried.** Nothing to fix yet. Both rolls are authored on purpose, and the product works as designed.

**Recommendation.**
- Keep both.
- If you want them softer, the campaign could limit `east_upset` to bouts the party lost narrowly, or let `night_moon` delay talk rather than close it. That would be one campaign edit each.

**You.** Confirm that these two rolls are intended as written.

---

## 6. `/cp activate` jumps play the target unstaged (C4 option (c))

**Frame.**
- `/cp activate` jumps the story straight to a checkpoint. Only the author does this (it is author-only), and so does the test harness when a card starts mid-story.
- A checkpoint's staging (Author's Note, background, scenario, cast) is normally inherited along the path the chat actually played.
- On 2026-09-30 you approved **(c), "release, then apply".** A jump removes the source's staging and applies only the target's own effects.

**Impact.**
- **Players never jump,** so a normal playthrough is unaffected.
- **After a jump, the target can play without staging it inherited:**
  - T1-5 started at Kelger Falls by jumping there.
  - Only Kelger Falls' own cast changes ran.
  - Kayla and Erevan (enabled by the skipped Thornwood and Accused checkpoints) stayed disabled, though the card has them travelling with the party.
- Before (c), a jump kept the source scene's staging instead, for example the guild hall's scenario framing a later act. That was worse: wrong staging rather than missing staging.

**Tried.** I left the product semantics unchanged; that was your decision. The harness now carries the missing state itself:

- A card that starts mid-story declares `setup.members`.
- `start` enables or disables those members with ST's own `/member-enable`, reads the group back, and fails closed on a mismatch.

**Options.**
- (a) Treat the jump as a debug tool only.
- (b) Path-replay every effect along the shortest authored path to the target. This needs a canonical path to a checkpoint the chat never played, and branches make that ambiguous.
- (c) Release, then apply. This is today's behaviour.

**My recommendation.** Keep (c). It never invents a path, and the harness covers the one case that needs inherited cast.

**You.** Keep (c), or ask me to revisit (b) for v2.7.

---

## 7. Campaign rewrites

**Frame.** Many session findings were authoring problems, not product problems: guidance that scripts outcomes, triggers too broad, secrets visible to the wrong character. I fixed them in `C:\dev\adolion-campaign` in 4 rounds, each pinned and re-checked with the campaign harness (`check_all.sh` green, lab 0/9 failing).

| Round | Commit | What changed | Why (finding) |
|---|---|---|---|
| T0 follow-up | `59e8821` | guidance states pressure, not outcome (13 checkpoints); openings end on a beat, not "What do you do?"; location `player_labels`; beat-title scene names (96); narrowed `extractor_trigger` regexes; Spanish commit phrases removed | narrator decided for the player; raw enum ids in the Overview; 9 duplicate DeepSeek reads per turn from broad triggers |
| T1 commitment | `b8d2a2b` | commitment recall accepts natural acceptances; guidance and house rules say `{{user}}`, not "the player" | 10 of 16 replies called the player character "the player" |
| T1 round 3 | `884380b` | narrator uses `{{groupNotMuted}}`; tavern recruitment enforced | narrator voiced muted members; recruitment skipped |
| T3 round 4 | `e6226f4` | hidden truths filtered to narrator + holders; Father's Summons rubric; party moves; chapter titles; Aegis/tavern scripted lines; Naomi's tic | T3-3 leak: Erevan and Selena said the scene's secret early |

**Impact.** It is your campaign. The rewrites change tone and wording you authored. The product does not depend on them, but every session since T1 ran on them.

**Tried.** Every round is a separate merge, so any one of them can be reverted alone.

**You.** Skim the diff and veto anything:

```bash
git -C C:\dev\adolion-campaign diff 59e8821^1 e6226f4 --stat
```

---

## 8. Judge per-lane rate

**Frame.**
- The judge plugin rate-limits TypeSafe calls per user, because TypeSafe documents no limit.
- I assumed an account budget of 90/min.
- Lanes are separate ST users, so each gets a share of it.

**Impact.**
- **Set too low,** our own limiter refuses calls. The judge then answers "busy" and each consumer falls back to its non-judge path. The product keeps working, but with less judgement.
  - In T1-6, 24% of judge calls were refused that way (159/654).
  - All of them came from our limiter, not from TypeSafe: no lane log shows a 429.
- **Set too high,** TypeSafe would start answering 429. The plugin retries, and the busy fallback still covers it.

**Tried.**
- The plugin now queues a call behind the in-flight cap instead of refusing it (up to 16 calls, 2 s).
- Each lane gets 2× its even share (4 lanes: 45/min each), because lanes burst at different times.
- Across T1-4..7 (4 lanes at once), the lanes together sent at most 56/min, with p95 at 45/min.
- Still no 429 through T3.

**Recommendation.** Keep the setting unless you know the real limit. On a single-user install (yours) the whole 90/min goes to one user, so the setting matters only when lanes run in parallel.

**You.** If you know your TypeSafe rate limit, tell me and I will set it.

**Decided 2026-10-02.** You supplied TypeSafe's documented limits:

| Limit | Documented | What the plugin does now |
|---|---|---|
| Account requests | 1,200/min (20/s sustained) | Ceiling per plugin (`SO_JUDGE_ACCOUNT_RATE_PER_MIN`). Was an assumed 90/min. |
| Account input tokens | 250,000/s | Ceiling per plugin (`SO_JUDGE_ACCOUNT_TOKENS_PER_SEC`), counted from the request size at 3.488 chars/token. A lone request larger than the budget still passes. |
| Per request | 32,000 tokens for state + the longest question, 64,000 in total | Checked before sending, on the page and in the plugin, each minus 10%. Never truncated: the judge takes the consumer's fallback with reason `too-large`, recorded in the calls ring and not metered; the plugin answers 413. |
| Questions per request, output tokens | not documented / unmetered | Nothing new. |

What changed:
- **Per user (each lane is one user):** 2 × the account / 5 expected users = **480/min** and 100,000 tokens/s. Five lanes at once can ask for twice the account, because lanes burst at different times (T1-4..7 combined used at most 56/min). At 2 calls in flight and about 250 ms per call, one user cannot pass about 480/min anyway. `SO_JUDGE_RATE_PER_MIN` still overrides it. `so-session start` now plans 1,200 × 2 / lanes, capped at 480 (up to 5 lanes: 480 each).
- **Adaptive, because TypeSafe can change these limits without notice:** a real TypeSafe 429 halves the plugin's effective rate (floor 10%). A `Retry-After` holds every call for that long (capped at 5 min); the plugin no longer retries at 600 ms when the header asks for longer. After a 30 s hold, the rate recovers linearly, back to full about two minutes after a single 429. `/status` shows `adaptive` (factor, cool-down, 429 count). The page already honours `Retry-After` and falls back `busy` meanwhile.
- **Size:** TypeSafe's 32,000 replaces our 32,768. The 64,000 total is new and replaces the old 140,000-character request cap.

**Size headroom, measured** (8,841 unique judge calls in the T0–T5 session evidence, read-only): the largest TypeSafe-metered input was **16,066 tokens** (`lore`, 64 questions in one chunk). Next were `scene` (15,958, 133 questions) and `typed` (11,901). The largest state was 25,891 characters (`memoryVerify`, `typed` and `stall` transcripts), about 7,400 estimated tokens. So no recorded call came within 25% of the 64,000 total or the 32,000 state + question budget. `houseRules` is off, so it has no recorded calls; with item 9 (c) context its cap adds about 1.65k tokens. `too-large` exists so that a future oversized request (a very long transcript window, a large lore pool) falls back visibly instead of failing as `invalid` or being cut.

---

## 9. House-rules judge off by default

**Frame.**
- Every judge use is on by default since 2026-09-30 (your rule 5), but only when it passes its measured floor.
- `houseRules` asks the judge whether a reply broke one of the story's house rules, and the continuity warden turns a "yes" into a note for the next turn.
- The campaign rewrote its rules to say `{{user}}`, so I re-measured on the campaign's own 200 labelled rows.

**Impact.**
- **With it on,** the warden flags house-rule breaks. Below floor, that means real false alarms and missed breaks: 37 of the 38 T2-1 warden notes cited one rule ("the narrator never writes a group member's words").
- **With it off,** the warden still runs its continuity checks; only the house-rule half goes quiet.

**Evidence** (`15-judge-remeasure.md` §house rules, 25 calls):

| Row family | Score | Floor |
|---|---|---|
| broken | 0.667 | 0.85 |
| untouched | 0.959 | 0.966 |

Where the misses come from:
- **Rule 6** ("consistent with the world book") was missed 0/3, because the judge is never shown the world book.
- **Rule 3** ("two to four paragraphs") cannot be judged from the reply alone at the floor.
- **Rule 1** produced most of the false alarms.

**Tried.**
- I did not retune the floors (project rule).
- The generic objective-rule fixture still passes (79/80), so the use works on checkable rules.
- An install that turns it on sees "unproven".

**Options.**
- (a) Off, which is today's default.
- (b) On, with the campaign's rule set cut to objectively checkable rules. That needs its own measurement first.
- (c) v2.7: give the question the world-book context (seeded in `v2.7-seeds.md`).

**Recommendation.** (a) now, (c) later.

**You.** Confirm off.

**Result of (c), 2026-10-02** (`15-judge-remeasure.md` §Design + Gate record, 25 calls): the house-rule question now asks in its own call with the
scene (speaker's roster role, group members, the player's line, `{{user}}` resolved) and the story-book entries that fired for the reply;
a paragraph-count rule is decided in code. Broken 18/18 (was 12/18), kept 10/10, **untouched 165/172 = 0.959 vs 0.966: still below
floor, so `houseRules` stays off**. The 7 false alarms: rule 1 x2 (the reply writes the player's action, read as a group member's),
rule 7 x2 (a mystery dumped in one paragraph, also read as a spent secret), rule 4 x1 and rule 6 x1 (AH22, a spent secret, also read as
a mystery and at exactly 0.70 against the world book), rule 2 x1 (AH34). Floors not retuned, labels untouched.

---

## 10. Inner voice harvest cannot work with Artemis on this setup

**Frame.** Plan 06's inner voice has two halves:

1. **Harvest** (`memory.harvestReasoning`, off by default, on in the sessions) stores a character's own reasoning, the model's thinking block, as private memory.
2. **Inner beat** (`memory.innerBeat`) asks DeepSeek for a short motive line, which is injected before the character's next reply.

The harvest needs the main model to reason, and on this setup Artemis never does.

**Impact.**
- **Harvest:** dead on Artemis whichever preset you choose. Characters get no private memory from their own thinking.
- **Inner beat:** still works. It was weak in T3, where beats went only to the narrator, and a T3 fix wave now builds them per drafted member (live check from T4).
- **v2.6 ships either way.** The harvest is off by default, so a default install loses nothing it had.

**Evidence.**
- **With the preset fix** (item 2, T3-3-1): the empty thought channel is a prefill that closes reasoning, so all 82 replies carry `reasoning: ""`.
- **Without the preset fix** (T3-3-2, `--no-preset-overlay`): the plain `Gemma 4` instruct never asks Gemma to open the channel. In group chats the prompt also ends on ST's speaker prefix (`<|turn>model\nErevan:`), so reasoning stays empty there too (`payloads.jsonl:11`, `:14`).
- **With thinking forced on** (the `Gemma 4 Thinking` instruct): the 2026-09-19 sessions saw loops and garbage. Note the cause: that was with the adaptive-P preset, before the `min_p`-first fix.

**Tried.**
- The harness no longer marks a session invalid when no reply carried reasoning. It records "not applicable: the model produced no reasoning", based on the evidence rather than the preset.
- Inner voice was re-covered by T3-3-2 without the overlay. Harvest was still not exercised.

**Options.**
- (a) Leave harvest off on Artemis and keep the inner beat. This is the zero-cost option and today's default.
- (b) Measure one untested setup: thinking on, the `Gemma 4 Thinking` instruct with `min_p` first and the stop strings off, on solo and group prompts. The questions are whether loops and garbage come back, and whether reasoning appears after the speaker prefix.
  - Cost: about 1 pod-hour (about USD 0.72) with the same A/B kit. It fits in the extra budget.
  - If it comes out clean, inner voice gets a real thinking setup. If not, (a) stands, with proof.
- (c) Per-story thinking (a story turns thinking on only where it wants it) is a v2.7 seed.

**Decided 2026-10-02: (b).** You want thinking and the inner voice, and the reasoning-effort feature was built for them. The A/B runs right after T4 on the production pod. Its arms are:

- TC thinking: the `Gemma 4 Thinking` instruct with `min_p` first and stop strings off, solo and group, including whether the thought channel can open before ST's speaker-name prefix.
- CC thinking: through llama-server's chat template, driven by `chat_template_kwargs.enable_thinking`. This is the path plan 05's effort control drives, and it verifies F5.
- The current fix, as the control.

The arms run on the same bodies and counters as the A100 run. If thinking comes out as clean as the fix, T5–T7 run with thinking and harvest on.

**Result (2026-10-02).** Clean on Artemis v1.1 with the opener after the name (item 2's table: 0/20 and 0/24 damaged, 0 loops, a thought opened in every reply). The harvest therefore has reasoning to read in groups, with the ST setup in item 2.

- **Chat Completion (plan 05 F5) verified on b11046:** `enable_thinking` false = the empty-channel shape, true = thinking, absent = thinking on; `reasoning_content` comes back separately; `reasoning_effort` low/high are byte-identical (ignored), `"none"` turns it off; `thinking_budget_tokens` caps reasoning per request, so the effort control should map onto it (`reasoning_budget` does nothing). In a group, CC answered as the wrong character 6/6: group thinking stays on Text Completion.
- **Other models:** Skyfall 31B v4.2 without thinking 0/16 damaged, 33 tok/s (Artemis 28.6); its native `[THINK]` never closes (0/16), a plain `<think>` prefill worked 6/6 (thin). Artemis v1.2 closes the thought at once in 14/16. Cydonia 24B is fastest (41.8 tok/s) but thinking gave 2/16 empty replies and speaker slips. Rocinante-XL dropped at your request.
- **Blind pack `test/sessions/rating-pack/model-blind-20-think/`** (20 turns, reasoning folded under each reply, sealed key intact): the control, the two thinking setups, and Skyfall without thinking. The judge's first pass is kept unsealed-only, so it cannot steer your rating.

**You.** Rate `model-blind-20-think`. Unless it clearly favours the control, T5–T7 run with the thinking setup and harvest on, and item 2's edit 1 is replaced by it.

**Decided 2026-10-02:** lanes switch to the thinking setup now, harvest on; you rate the pack later, and the rating can overrule it.

**Applied to your install 2026-10-02 (through ST's UI, with your permission):** instruct Gemma 4 Thinking (Sequences as Stop Strings off) on the three Artemis profiles with Start Reply With `<|channel>thought` + newline and reasoning template Gemma 4; instruct Gemma 4 (memory profiles) gets the empty thought channel and Sequences as Stop Strings off; context Gemma 4 Names as Stop Strings off; Auto-fix Markdown off; Artemis v1.1 RP: `min_p` first, response 1400; global regex "Thinking: drop the speaker name repeated after the thought channel"; memory-model fallback = Story Orchestrator Memory Unsloth. Selected profile unchanged (Artemis Local (Unsloth)). The reply thinking budget (default medium, 400) arrives with the next staged build.

**Decided 2026-10-02: reasoning-effort A/B** after the thinking switch merges (about 1 pod-hour): thinking budgets about 128 / 400 / unlimited on Text Completion in groups; empty replies, damage, loops; whether `thinking_budget_tokens` reaches a Text Completion request at all; whether the checkpoint `effects.reasoning` overlay lands on the request; replies into a blind pack.

---

## Tiers

| Tier | State | Summary |
|---|---|---|
| T0 playable | done (3/3 valid) | `test/sessions/T0/SUMMARY.md` |
| T1 features | done (7/7 valid). Fix waves T1-6 and T1-7 merged. One must-not-happen fixed: foreign gated lore on the first reply after a chat switch | `test/sessions/T1/SUMMARY.md`, `14-findings.md` |
| T2 memory | done (6/6 valid; the DeepSeek outage 19:50–21:32Z cost 4 turns, flagged). 4 fix waves merged: secrets out of shared tiers, lost updates on chat leave, switch attribution, away recap, chapter seal/fold, warden lapse, party moves, beat holds | `test/sessions/T2/SUMMARY.md`, `14-findings.md` |
| T3 surfaces | done (all cards valid; T3-3 re-run without the overlay). Fix waves merged: spoiler cast chips, `/cp` author-only, lost-save chip, scripted line spacing, Studio narrow layout, curator declines remembered, non-player quote re-ask, inner beats per drafted member. Campaign round 4 | `test/sessions/T3/SUMMARY.md`, `14-findings.md` |
| T4 robustness | done (4/4 valid on re-runs T4-1-2, T4-2-2, T4-3-3, T4-4-2). Fix waves merged: chat-switch lifecycle, mirror/reaper/library, mutations/author loop, delete-chat harness. Open: scripted lines re-posted after a step back (fix running) | `test/sessions/T4/SUMMARY.md` |
| T5 authoring | running with thinking on (default since e29821df). T5-2-1 INVALID (harness, fixed 91500820), wizard product fixes running; T5-5 playing; T5-1/T5-3/T5-4 wait for fixes | `test/sessions/T5/SUMMARY.md` |
| T6–T7 | not started (reasoning/judge providers/harness routing/judge off; integration + freeze) | — |

## Measurements

| Item | State |
|---|---|
| Model config audit | done, `15-model-config.md` |
| English judge re-measure | done; every use at floor except `houseRules` (item 9), `15-judge-remeasure.md` |
| Plan 03 spikes | SP7 include. SP3 include (director); SP3.b accepted (Phase B 2.01 / 2.87 per 50). SP5 include. SP8 tiers/spans include, digest dropped (below floor). SP2, SP9 and SP4 dropped (SP4: T3 0.000). SP6, SP1 and SP10 not run. |
| Artemis long-prompt degradation | A100 experiment done: the server flags are not the cause; the three preset edits fix most of it (item 2); blind pack ready (item 1) |

## Spend

`test/sessions/BUDGET.md` covers pods (entered by hand) and DeepSeek/TypeSafe per session.

- **Budget:** EUR 30 (EUR 20, plus EUR 10 added 2026-10-02).
- **Spent:** USD 15.28 at the 04:30Z billing check.
- **Stop line:** about USD 31.
