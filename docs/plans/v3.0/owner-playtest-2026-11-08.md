# Owner playtest — 2026-11-08

Replaces `docs/plans/v2.9/12-owner-playtest.md` (2026-10-25, never run). Two parts: Part A is a short test (30–45 min),
Part B is your own play, as long as you like. Nothing here spoils the campaign.

This run is **not** a clean comparison with earlier measurements: the text model runs on a rented Vast GPU, not your 3090.
Same model (Artemis 31B v1.1, Q4_K_M + MTP drafter), same preset, thinking on; what differs is the hardware, the server
build (stock b11888, no member cache) and the speed.

## Before you start (done for you)

- Latest build staged and installed; the 9 Adolion stories re-imported at campaign `baeda38` (talk pacing, stuck leads,
  minimum turns, lore lifetimes); the Part A test story `so-v29-08-o4` is in the library.
- A Vast RTX 3090 serves the model through an ssh tunnel on `127.0.0.1:18086`. Every connection profile in your ST
  (play, memory, Image Director) points there for this run; the old URLs (`127.0.0.1:18888`, your local controller) are
  backed up and restored when you say you're done.
- Your 3090 then holds only ComfyUI, so images and live characters no longer wait behind the text model.
- ST restarted (it still had the old GPU plugin loaded).

Then:

1. Open http://127.0.0.1:8000 in your own browser.
2. Profile **Artemis RunPod RP** (selected), preset **Artemis v1.1 RP**, thinking on.
3. Play in **player mode** (Author view off). Inline timeline at its default (Story).

## Features for this run

Everything on by default, as always. New since your last session (watch these):

- **Talk pacing**: scenes have a pacing shape (opening, conversation, decision, action, aftermath). Everyone you name
  answers; an action you take without addressing anyone gets the narrator first; companions who stay quiet get pulled in.
- **Stuck leads**: if you stall in a scene, the world slowly puts a way forward in front of you (never solves it).
- **Minimum turns**: tense scenes last at least 2–4 of your turns before they can end; a few urgent exits still fire at once.
- **Lore lifetimes**: lore about something that's over stops being fed to the model.
- **In-chat elements**: scene/time dividers, a "Because you…" line after a consequence, journal cards, and chips at the end of
  the chat that fill your input (they never send).
- **Reworked Play page and story sheet** (docks beside the chat; bottom sheet on narrow windows).
- **Reply polish** is on this time (it was switched off for the last planned run).
- **Images** (a scene illustration every few replies), **live characters**, sprites made on demand, poses: on.

Off, by their own defaults (not ready): skip ahead, swipe contrast, lexical prefilter, deferred out-of-prompt notes.

Changed for this run: **transition notes** (a chat note each time the story moves to a new scene) were switched on in your
install; they are off by default and turned off for player play.

## Part A — "You notice…" (v2.9 08 O4)

What it tests: when the game shows a "You notice: …" line, do you read it as information, not as an order. Optional; skip
it if you only want to play.

1. Copy `test/measurements/v2.9/08-o4/answers.template.json` to `C:\dev\so-sessions\owner-playtest-2026-11-08\answers.json`.
   Fill `playedOn`, `chat` later.
2. In the group **Group: Arin, DM Narrator**, start a **new chat**, then Library → pick the story **so-v29-08-o4** for it.
3. Open `test/measurements/v2.9/08-o4/tasks.json`. **Do not open `story.json` or `key.json`** (they hold the answers).
4. For each task T01–T10, in order:
   - write what the task says to do, in your own words, as your message, and let the reply come;
   - open the story card (the scene button above the chat input) or the story sheet's Journal, **Noticed** section;
   - in `answers.json`: `shown` = true if a new "You notice" line or Noticed entry appeared (if nothing after the first
     reply, send "I look around." once and check again); `line` = one line: what you noticed and what it tells you.
   - Don't go back and edit earlier lines.
5. Tell me when done. Sol rates it (floor >= 8/10); one run is the measurement.

## Part B — your Adolion play (the human evaluation)

**Where:** a **new chat** in **Adolion - The Saga** (all acts in one chat). Old chats keep an older story copy; if you do
continue one, use "Update to the latest" first.

**Do:**
- Play naturally: talk, explore, make choices, refuse things now and then, make a promise to a character and later keep it
  (or not). Address two companions in one line sometimes; act without talking to anyone sometimes.
- Try a few ordinary mutations: swipe a reply, edit or delete one of your own messages, stop a reply mid-stream once,
  regenerate. The story should step back or hold cleanly.
- Peek at the player surfaces: story card, story sheet (Journal, Here, People, Stats), "What could I do?", Your character, HUD.
- When something feels off, press **Flag** (Play page → Flag) and add a few words. A flag pins the exact turn for me.

**Watch for (flag these):**
- a character speaking, acting, feeling or deciding *for you*;
- you named someone and they didn't answer; you did something and nobody said what happened;
- one voice talking too much, companions silent for long stretches, or too many voices per turn;
- a scene ending too fast, or dragging with no way forward; a hint that solves things for you;
- a promise, fact or earlier event forgotten or contradicted;
- something a character shouldn't know showing up (a secret leaking);
- time of day, place or who is present not making sense;
- repeated lines or a character losing their voice;
- a suggestion, chip or "You notice" that gives away something you haven't found yet;
- UI that's confusing, broken, slow, or covers the chat;
- long waits or empty replies (say roughly how long).

**Images and live characters:** flag an image showing the wrong scene, people, place or time, or something not yet
revealed; broken faces/eyes/edges; a character who looks different from their card or last image; wrong expression,
glitchy motion or a character shown who isn't there; images that never arrive. Rate images at the end: 1–5 looks, 1–5 fit.

**Please don't:**
- switch features off or change story settings (if something is unbearable, tell me instead);
- use Author view, `/cp` commands or the Studio (they change the story outside play);
- edit lorebooks or cards by hand mid-run;
- read campaign files to check something.

**When you stop**, tell me "done" (that restores your profiles and reminds you to destroy the Vast box; a stopped box still
bills disk), plus a few lines:
- 1–5: was it fun · did characters feel alive · did the story react to what you did · did it feel fast enough;
- the three things that annoyed you most, and the best moment (no plot detail needed, "the second scene" is enough).

I read the journal, logs and your flags afterwards and triage them. I won't quote story content back to you.
