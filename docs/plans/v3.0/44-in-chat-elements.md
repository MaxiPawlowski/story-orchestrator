# v3.0 44: elements in the chat

Owner 2026-11-01: "i want new elements on the chat" and "lets build the most valuable ones and prepare a list with the rest
for me to review tomorrow". Source: `docs/plans/v3.0/research/self-imposed-rules-2026-10-31.md` (in-chat section and
shortlist). Built by agent E in plan 43 phase 2 (gate record in `43-research-roadmap.md`, section E).

## What changed underneath

- The one module that writes into SillyTavern's messages (`src/services/stHost/inlineMount.ts`) now offers named spots
  ("slots") on every message instead of one strip:
  - `between`: top of the message, above the name (dividers).
  - `name`: beside the speaker's name (free, nothing uses it yet).
  - `above`: under the name, above the text (free).
  - `after`: right under the text (because lines, journal cards).
  - `below`: the existing notes line.
  - `meter`: under the notes (author gate meter).
  - `end`: under the last message only (next-move chips).
- Still one owner and one cleanup path. Nothing is ever written inside the message text itself, so editing and copying a
  message is unaffected. A watcher on the chat list re-attaches the spots when SillyTavern rebuilds messages without
  telling anyone.
- Everything shown comes from the one snapshot, worked out in a lazy chunk; the main bundle grew about 2.2 KB
  (1,295,205 of 1,300,000 B).
- Each element has its own switch under **Settings → Display → Between and around the replies**, all on by default.
  The notes level still rules: at Off none show; the gate meter needs Author view and the Author level.

## The five built

Screenshots: `C:\dev\so-lanes\ui-review\in-chat\` (desktop 1440x1000 and phone 390x844, dark and light; player and
Author view). Live run on a no-model lane with a test story in an `SO-UI In-chat` group.

1. **Scene and time dividers** (`display.inChat.dividers`, player).
   - Shows: a thin line with "Day 1, evening · A new scene" above the message where the story clock moved or a scene
     break was read.
   - Reads: the story clock's moves in the boundary log, and scene breaks the story reader recorded.
   - Shots: `01-player-desktop-dark.png`, `03-player-desktop-light.png`.
   - Note: the place name is not on the divider yet; the scene tracker keeps only the current place, not where each
     earlier scene was. See "Place on the divider" below.
2. **"Because you…" line** (`display.inChat.because`, player).
   - Shows: "Because you took the key, the yard gate swung open." under the reply where that happened.
   - Reads: the recap's recorded effects and the same proof rules as the recap; when the story cannot prove it was your
     line, nothing shows. A swipe or edit of your line takes it away.
   - Shots: `01`, `04-player-phone-dark.png`, `06-player-phone-light.png`.
3. **Next-move chips at the end of the chat** (`display.inChat.chips`, player).
   - Shows: **Your move** when the turn is yours, the checkpoint's authored suggestions ("I warm my hands at the fire."),
     and **Ideas** (opens the Ideas tab). Clicking a suggestion fills the box where you type; it never sends, and it
     leaves text you typed yourself alone.
   - Reads: the checkpoint's offers, screened like the Ideas tab (no secret, no one you have not met), the your-move
     decision.
   - Shots: `01`, `04`, `06`.
4. **Journal cards** (`display.inChat.discovery`, player).
   - Shows: "New in your journal: The old keeper — Keeps the gate keys on a red cord." under the reply where it went in;
     **Open** shows the story sheet.
   - Reads: the journal (codex) latches in the boundary log; only entries you know now.
   - Shots: `02-player-desktop-dark-discovery.png`, `05-player-phone-light-discovery.png`.
5. **Gate meter** (`display.inChat.gateMeter`, Author view).
   - Shows: under each reply, each way out of the checkpoint with a bar ("→ The Yard, 1 of 2"), what is missing
     ("has key = true, now unset") and "Moved to The Yard" where the story moved.
   - Reads: the boundary log's state after each reply against the outgoing gates. Never built in player view.
   - Shots: `07-author-desktop-dark.png`, `08-author-desktop-light.png`, `09-author-phone-dark.png`.

Checked live after each of: swipe, edit, delete, regenerate (no backend, so the reply is removed), reload, switching to
another chat and back. Every time each spot sat under the right message, nothing was left behind, no duplicates,
nothing inside the message text.

## The rest, for review

Each line: what it shows, who sees it, where the data comes from, size (S small, M medium, L large), risks, sketch.

- **Promise highlights** (player, M).
  - Shows: the exact words of a promise you made underlined in your own message; colour for open, kept or broken;
    hovering says to whom.
  - Data: `extras.promises` source spans (message, revision, offsets).
  - Risks: needs the browser's text highlight feature (`CSS.highlights`) because nothing may be written inside the text;
    older browsers show nothing. Spans must drop on edit (they already do by revision).
  - Sketch: `"I swear I'll bring it back"` with a dotted underline; tooltip "Promise to Arin, open".
- **Feeling ticks beside the name** (player, known people only, S).
  - Shows: a tiny "trust ↑" chip beside the speaker's name on the reply where a relationship step landed.
  - Data: `rel_*`/`mood_*` changes in the boundary log, relationship labels, known people.
  - Risks: must never show a feeling the story keeps secret; noisy if steps are frequent (cap one per reply).
  - Sketch: `Arin  trust ↑`.
- **Inner-voice bubble** (player opt-in, author always, M).
  - Shows: a small thought icon beside the name; click opens what that character thought before this reply.
  - Data: inner-voice output and the reply's reasoning, keyed to the swipe it belongs to.
  - Risks: thoughts can mention what the player should not know yet; player version needs the held-secret filter.
    SillyTavern's own thinking pill already shows reasoning, so this may duplicate it.
  - Sketch: `Arin (thought icon)` → popover with two lines.
- **Quest stamps** (player, S).
  - Shows: a small stamp "Quest done: The Night Watch" (or opened, advanced) with reward words under the reply.
  - Data: quest changes in the boundary log, the game snapshot. The notes line already says this in words; a stamp is a
    louder version.
  - Risks: overlap with the notes line and the because line; pick one place.
  - Sketch: `[✓ The Night Watch — done. +1 trust with the guard]`.
- **Illustration and pose slot** (player, L).
  - Shows: the scene picture or the speaker's pose as a thumbnail beside the reply, regenerate in place.
  - Data: image routing records, sprite stage.
  - Risks: GPU and ComfyUI involvement; images are on hold for the campaign; the image module already writes its own
    spots, so this means moving it onto the slots first.
  - Sketch: a 64 px thumbnail at the right of the reply with a refresh icon.
- **Kept-out marker** (author, M).
  - Shows: an eye-slash beside the name of a character who is speaking while a secret is kept from them; a whisper icon
    on someone who just heard a rumour.
  - Data: Who knows what (author console), rumour landings.
  - Risks: author-only; must stay out of player view (the player check would catch it).
  - Sketch: `Arin (eye-slash: kept out of the debt)`.
- **Warden and judge flags** (author, S).
  - Shows: a small flag on the reply the continuity warden wrote a note for, and the judge's verdict chip for that reply.
  - Data: warden note state bound to that reply's revision, `extras.judge.calls`.
  - Risks: little; the Inspector already has this, the flag is a shortcut.
  - Sketch: `(flag) continuity note` / `judge: in character 0.82`.

Ideas found while building:

- **Place on the divider** (player, M). Record where each scene took place when the scene tracker confirms it, so
  dividers can say "Evening · the market". Needs a small per-scene record (rolled back by message). Sketch:
  `— DAY 3, EVENING · THE MARKET —`.
- **New place banner** (player, S). When the story moves to a new checkpoint that has a player name, a divider "Now: The
  Yard" above the reply. Data already in the boundary log; overlaps the notes line's "The story moved on".
- **Why this character spoke** (author, S). A chip beside the name: "picked: lead of this scene" or "rolled 12 of 100".
  Data: talk decisions. Uses the free `name` slot.
- **Rewind marker** (player, S). After a swipe or edit takes something back, a quiet line "The story stepped back to
  here" on the message it went back to, for a few turns. Data: the last rollback notice.
- **Remember this** (player, M). A small pin on a reply that asks the story to keep this moment (a pinned memory). Data:
  memory actions already exist; needs player copy and a guard against pinning secrets.

Open questions for the owner:

- Should the chips at the end also show the model's Ideas directly (one model call per turn), or keep Ideas one click
  away as now?
- Dividers above the speaker's name, or a full-width line between messages? Full width needs a spot outside the
  message, which SillyTavern's own code walks through; above the name is the safe choice made for now.
