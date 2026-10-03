# Plan 03 — Story briefing: an authored modal when a story starts

**Status: DRAFT 2026-10-03 (topic from the user). Not approved, not built.** Overview: `00-overview.md`.

## Problem

- A story starts with its opening message, and the opening is a scene, not a briefing.
  - Since v2.5 plan 17 it is a scripted `new_chat_only` onEnter reply.
  - Who the player is, where they are, who travels with them, the tone, and what they can do are mostly missing or
    implied.
- **Where the context already lives, and why it isn't enough:**
  - `player_intro` (the premise, `schema.ts:367`) shows only in the drawer's Overview "about" section
    (`snapshotBuilder.ts:49`). A player who never opens the drawer never reads it.
  - `effects.scenario` (SP5) frames the story for the **model**, not the player.
- The user's decision (2026-10-03): show an author-written briefing in a modal the first time a story starts, and give
  the Adolion campaign one.

## Design

### Format: optional story-level `briefing`

```json
"briefing": {
  "title": "The Road to Adolion",
  "image": "briefing.jpg",
  "sections": [
    { "heading": "The world",  "text": "…" },
    { "heading": "Who you are", "text": "…" },
    { "heading": "Who is with you", "text": "…" },
    { "heading": "How to play", "text": "Write what you do and say; the world answers. …" }
  ],
  "tone": "Dark fantasy, mature themes, violence.",
  "start_label": "Begin"
}
```

- **Shape.** Free headings, plain text with paragraphs. No macros, no HTML; it renders as text, and the escaping matches
  the away-recap popup.
  - `image` is optional and resolves like `effects.background` (a backgrounds file name).
  - `tone` is an optional content/tone line, shown under the title.
- **Fallback.** A story with no `briefing` but a `player_intro` gets a one-section briefing from it, so every story gets
  something. The library `description` is author copy and is never used.
- **Player copy rules apply.** It is true on every path, free of spoilers, and never names a checkpoint the player has
  not reached.
  - Validator length caps: e.g. at most 6 sections and 1,200 characters per section.
  - Diagnostic `briefing-spoiler-risk` when the text names a quality value, a checkpoint id or a roster member the start
    checkpoint mutes.
- **Chapters (Saga).** Optional `chapters[].briefing`, same shape, shown when a chapter opens. This replaces the chip,
  or joins plan 04's C3 title card.

### When it shows

- **First activation of the story in a chat:**
  - a new chat with a bound or selected story (v2.5 plan 17's `boundStoryForEmptyChat` path);
  - `selectStory` into a chat;
  - `restartStory`.
- **Once per chat, saved with the chat.** A per-chat `extras.ui.briefingSeen = {storyId, version}`, so a rollback never
  re-shows it and reopening the chat doesn't either. A story update that changes the briefing does not re-show it; the
  drawer offers it instead.
- **Never with no chat open** (the no-chat invariant).
- **Never in Author view's dry flows** (Studio preview). The Studio offers "Preview briefing".
- **Re-open any time:**
  - "Story briefing" in the drawer Overview footer (both personas);
  - `/story intro`;
  - the plan 04 C6 wand entry.

### How it shows

- **Our own native `<dialog>` + `showModal()`**, like the Studio modal (`#so-briefing`, mounted in its own root).
  - ST's transformed `<html>` collapses fixed overlays on mobile, so a dialog is required (gotchas).
  - It needs its own CSS scope root: add it to the `styles.css` root list and to `.storybook/preview.ts` `mountRootFor`.
- **Non-blocking for the runtime.** The opening reply posts first, before staging (v2.5 plan 17), and the modal sits above the
  chat. The modal never gates any write.
- **Layout.** One column, readable at 390 px. Sections stack. One primary button (`start_label`, default "Begin"). An
  optional "Don't show briefings" checkbox writes the install-wide setting below.
- **Accessibility.** Focus trap (native), labelled title, Escape closes, a Storybook story with an a11y play.

### Settings

- `display.briefing` (install-wide, default **on**). Player-facing, in the Display group.

### Harness

- Every debug script that imports or selects a story would now meet a modal. `so-scenario`, `so-journey`, `so-session`
  and `adolion-fresh` set `display.briefing` off in their config snapshot, then restore it.
- `so-ui.mts briefing` / `briefing-dismiss` exist for the checks that are about the briefing.
- The modal is added to `assert-player-clean`'s sweep.

### Authoring support

- Studio Story tab: a Briefing editor with sections, image and preview.
- Wizard: the Premise step drafts a briefing from the premise and cast (a proposal the author reviews; a new mutation and
  agent tool `setBriefing`).
- Guide topic `briefing` (in `story-guide.md` and `guideTopics.ts`, drift-tested).

## Adolion campaign

- One `briefing` per story (nine), plus `chapters[].briefing` for the Saga's act chapters.
- Built by a campaign script from the authored player copy (the `player_intro`s and the scenario framing).
- Checked by the existing `scripts/check_player_copy.py` spoiler-term gate (80 terms), extended to briefing text.
- "How to play" is shared campaign text: write actions and speech, the narrator answers, characters remember.
- Tracked as `05-adolion-campaign.md` A7.
- The user reads these at play, so their content review goes to an independent model, not to the user.

## Gates

- **Pure:** validator plus diagnostics, the fallback, the once-per-chat rule under rollback, reopen and restart.
- **UI:** Storybook stories (390/768/1440, a11y), the spoiler-checklist row.
- **Live:** a new chat in a bound group shows it once; reopening doesn't; Restart does; the drawer button re-opens it;
  the setting off suppresses it. Driven through `so-ui`, with the harness default off verified on a journey.
- `npm run gates`.

## Decisions for the user

1. Fallback to `player_intro` when no `briefing` is authored? **Recommended: yes.** yes, or maybe we can create something on the fly with the wizzard. If the player enables auto
2. Default on, with a "Don't show briefings" checkbox in the modal? **Recommended: yes.** sure
3. Chapter briefings for the Saga (shown at each act's start)? **Recommended: yes, same shape.** yes, lets also have a different ui indicator on the group chat selector for whether thats full story or an individual saga. maybe some color
4. Image in the briefing? **Recommended: optional field.** as you recommend
5. Merge plan 04's C8 "first-run onboarding" (how the HUD, chips and Memory tab work) as a collapsible "How Story
   Orchestrator works" section, shown on the install's first briefing only? **Recommended: yes**, so there is one modal. yes

## Links

04 story presence (C3 title card, C6 wand, C8 onboarding), 05 Adolion campaign (A7), 25 new game plus (a sequel
briefing could recap the carried outcome), 17 open stretches.
