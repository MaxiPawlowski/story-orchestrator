# Owner playtest — 2026-10-25

Two parts. Part A is a short test (30–45 min). Part B is your own play, as long as you like. Nothing here spoils the campaign.

## Before you start

Already done for you: the latest build is staged, plugins installed, the Adolion stories re-imported at the current campaign
version, and the Part A test story is in your library.

1. Start ST from the tray (or `node scripts/local/cli.mjs start-st`) and open http://127.0.0.1:8000 in your own browser.
2. Connection profile **Artemis Local (Unsloth)** or **Artemis RunPod RP** (both point at the local model), preset
   **Artemis v1.1 RP**, thinking on. Keep the default story settings: everything is on by default.
3. Play in **player mode** (Author view off). The inline timeline at its default level (Story) is fine.

## Part A — "You notice…" (v2.9 08 O4)

What it tests: when the game shows a "You notice: …" line, do you read it as information, not as an order.

1. Copy `test/measurements/v2.9/08-o4/answers.template.json` to `C:\dev\so-sessions\owner-playtest-2026-10-25\answers.json`.
   Fill `playedOn`, `chat` later.
2. In the group **Group: Arin, DM Narrator**, start a **new chat**, then Library → pick the story **so-v29-08-o4** for it.
3. Open `test/measurements/v2.9/08-o4/tasks.json`. **Do not open `story.json` or `key.json`** (they hold the answers).
4. For each task T01–T10, in order:
   - write what the task says to do, in your own words, as your message, and let the reply come;
   - open the story card (the scene button above the chat input) or the Journal's **Noticed** section;
   - in `answers.json`: `shown` = true if a new "You notice" line or Noticed entry appeared (if nothing after the first reply,
     send "I look around." once and check again); `line` = one line: what you noticed and what it tells you.
   - Don't go back and edit earlier lines.
5. Tell me when done. I run the rater (Sol) and record the result. One run is the measurement; it is not repeated.

## Part B — your Adolion play (the human evaluation)

Play the campaign fresh, as you normally would. This is the one human evaluation for v2.7–v2.9.

**Where:** a **new chat** in **Adolion - The Saga** (all acts in one chat). Old chats keep their older story copy, so don't
continue those for this.

**Do:**
- Play naturally: talk, explore, make choices, refuse things now and then, make a promise to a character and later keep it
  (or not).
- Try a few ordinary mutations along the way: swipe a reply, edit or delete one of your own messages, stop a reply
  mid-stream once. The story should step back or hold cleanly.
- Peek at the player surfaces when curious: the story card, Journal, "What could I do?", Your character, the HUD.
- When something feels off, press **Flag** (Play page → Flag) and add a few words. A flag pins the exact turn for me.

**Watch for (flag these):**
- a character speaking, acting, feeling or deciding *for you*;
- a promise, fact or earlier event forgotten or contradicted;
- something a character shouldn't know showing up (a secret leaking);
- time of day, place or who is present not making sense;
- repeated lines or a character losing their voice;
- a suggestion or "You notice" that gives away something you haven't found yet;
- UI that's confusing, broken, slow, or covers the chat;
- long waits or empty replies.

**Please don't:**
- switch features off or change story settings (if something is unbearable, flag it and tell me instead);
- use Author view, `/cp` commands or the Studio during this run (they change the story outside play);
- edit lorebooks or cards by hand mid-run;
- read campaign files to check something.

**When you stop**, write a few lines anywhere (a chat message to me is fine):
- 1–5: was it fun · did characters feel alive · did the story react to what you did · did it feel fast enough;
- the three things that annoyed you most, and the best moment (no plot detail needed, "the second scene" is enough).

I read the journal, logs and your flags afterwards and triage them. I won't quote story content back to you.
