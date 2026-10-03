# Plan 05 — Story briefing: an authored modal when a story starts

**Status (2026-10-03): v2.7 plan 05 (was old v2.7 03). APPROVED (static half: format, modal, Studio editor, chapter
briefings, C8 onboarding, the saga/act indicator, the activation sequence frame); not built. The wizard's drafting
(decision 1's "on the fly") is `v2.8/10-briefing-drafting.md`; the identity step is `v2.8/03-player-persona-and-start-setup.md`.**
Overview: `00-overview.md`.
**Gate tiers** (v2.7 overview §Gate taxonomy): implementation D; acceptance D. Model input: none (the briefing is
player copy; it is never injected and the opener is unchanged).

## Problem

- A story starts with its opening message, and the opening is a scene, not a briefing.
  - Since v2.5 plan 17 it is a scripted `new_chat_only` onEnter reply.
  - Who the player is, where they are, who travels with them, the tone, and what they can do are mostly missing or
    implied.
- **Where the context already lives, and why it isn't enough:**
  - `player_intro` (the premise, `src/engine/schema.ts:385`) shows only in the drawer's Overview "about" section,
    through `publishedIntro` (`src/runtime/snapshotBuilder.ts:50`), which falls back to the author's `description`.
    A player who never opens the drawer never reads it.
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
- **Fallback.** A story with no `briefing` but a `player_intro` gets a one-section briefing from it. The briefing reads
  `story.player_intro` **directly**, never `publishedIntro`, because that falls back to `description` (review A13). The
  library `description` is author copy and is never used. A story with neither shows no briefing section (the modal may
  still open for "Before you start").
- **Player copy rules apply.** It is true on every path, free of spoilers, and never names a checkpoint the player has
  not reached.
  - Validator length caps: e.g. at most 6 sections and 1,200 characters per section.
  - Diagnostic `briefing-spoiler-risk` when the text names a quality value, a checkpoint id or a roster member the start
    checkpoint mutes.
- **Chapters (Saga).** Optional `chapters[].briefing`, same shape, shown when a chapter opens, inside v2.7 06's C3
  chapter title card.

### Activation sequence (review F10)

One order for a new chat, `selectStory` and `restartStory`, shared with v2.7 04 and v2.8 03 (which inserts step 3).
This plan builds the frame; each step's owner fills its pane.

| Step | What | Required? | Owner |
|---|---|---|---|
| 0 | a chat is open and is a group chat (no chat: nothing; solo: the story refuses) | required | v2.7 03 |
| 1 | the story is resolved: a new empty chat in a bound group (`boundStoryForEmptyChat`, `src/runtime/groupStoryBinding.ts:1`), `selectStory`, or `restartStory` | required | runtime |
| 2 | **Before you start**: this story's `blocks` findings | shown whenever any exist | v2.7 04 |
| 3 | **Identity** ("Who are you in this story", persona lock) | reserved slot, empty in v2.7 | v2.8 03 |
| 4 | **Briefing** sections (+ the first-run C8 section) | when `display.briefing` is on and not yet seen | this plan |
| 5 | **Opener** (`new_chat_only` scripted reply, v2.5 plan 17) and the rest of `applyCheckpoint` | when `ready` | runtime |

- **One modal, panes in that order.** In v2.7 the modal opens when step 2 or step 4 has something to show.
- **The briefing never gates the opener.** In v2.7 nothing in the modal holds step 5; the opener posts when `ready`, as
  today. v2.8 03 adds the identity gate (its plan says how); this frame leaves the hook for it and nothing else.

### When it shows

- **First activation of the story in a chat** (steps 1 → 4 above).
- **Once per chat, saved with the chat.** A per-chat `extras.ui.briefingSeen = {storyId, version}`, so a rollback never
  re-shows it and reopening the chat doesn't either. A story update that changes the briefing does not re-show it; the
  drawer offers it instead.
- **Never with no chat open** (the no-chat invariant).
- **Never in Author view's dry flows** (Studio preview). The Studio offers "Preview briefing".
- **Re-open any time:**
  - "Story briefing" in the drawer Overview footer (both personas);
  - `/story intro`;
  - the v2.7 06 C6 wand entry.

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

### First-run onboarding (C8, decision 5)

The install's first briefing carries a collapsible "How Story Orchestrator works": what the HUD, chips, drawer and
Memory tab are, about 6 lines with icons. Shown once per install (`help` slice, beside `lastSeenVersion`), re-openable
from Help. A drawer opened with no story says what to do next (v2.7 01 deviation, built here).

### Saga vs act indicator (decision 3, review A8)

- **Rule (pure):** a story whose `chapters[]` holds 2 or more chapters is a **saga**; any other story is a **story**
  (single act). `storyKind(story)` in a pure module, unit-tested on the campaign shapes (the Saga, an act, the tutorial).
- **Where:** v2.7 06's group badge carries it: a distinct icon and colour token for a saga, with the kind in the
  badge's `title` and accessible name (colour is never the only signal). Built in v2.7 06 B; this plan owns the rule.

### Authoring support

- Studio Story tab: a Briefing editor with sections, image and preview; a chapter editor field for `chapters[].briefing`.
- Guide topic `briefing` (in `story-guide.md` and `guideTopics.ts`, drift-tested).
- Wizard drafting (Premise step) and the player's on-the-fly draft: `v2.8/10-briefing-drafting.md` (model calls, CL).
  v2.7 adds no `setBriefing` tool.

## Adolion campaign

- One `briefing` per story (nine), plus `chapters[].briefing` for the Saga's act chapters.
- Built by a campaign script from the authored player copy (the `player_intro`s and the scenario framing).
- Checked by the existing `scripts/check_player_copy.py` spoiler-term gate (80 terms), extended to briefing text.
- "How to play" is shared campaign text: write actions and speech, the narrator answers, characters remember.
- Tracked as v2.7 07 A7.
- The user reads these at play, so their content review goes to an independent model, not to the user.

## Gates (tier D)

- **Pure:** validator plus diagnostics (`briefing-spoiler-risk`), the fallback reads `player_intro` and never
  `description`, the once-per-chat rule under rollback, reopen and restart; the activation-sequence order (a test per
  entry path: new chat, select, restart); `storyKind`.
- **Opener unchanged:** a dry-run of the first activation shows the same opener timing and payload with the modal open
  and with `display.briefing` off (payload invariance).
- **UI:** Storybook for the modal (briefing only; Before you start only; both; first-run section; chapter briefing),
  390/768/1440, a11y; the spoiler-checklist row; `assert-player-clean` sweeps the modal.
- **Live (D):** a new chat in a bound group shows it once; reopening doesn't; Restart does; the drawer button and
  `/story intro` re-open it; the setting off suppresses it; a story with a `blocks` finding shows Before you start
  first. Driven through `so-ui` (`briefing`, `briefing-dismiss`), harness default off verified on a journey. ×2.
- Registry entry + Help (rule 9). `npm run gates`.

## Decisions for the user

1. Fallback to `player_intro` when no `briefing` is authored? **Recommended: yes.** yes, or maybe we can create something on the fly with the wizzard. If the player enables auto
2. Default on, with a "Don't show briefings" checkbox in the modal? **Recommended: yes.** sure
3. Chapter briefings for the Saga (shown at each act's start)? **Recommended: yes, same shape.** yes, lets also have a different ui indicator on the group chat selector for whether thats full story or an individual saga. maybe some color
4. Image in the briefing? **Recommended: optional field.** as you recommend
5. Merge plan 04's C8 "first-run onboarding" (how the HUD, chips and Memory tab work) as a collapsible "How Story
   Orchestrator works" section, shown on the install's first briefing only? **Recommended: yes**, so there is one modal. yes

## Links

v2.7 06 (C3 title card, C6 wand, the badge that shows the saga/act kind), v2.7 04 (Before you start), v2.7 07 A7
(Adolion briefings), v2.8 10 (drafting), v2.8 03 (identity step, activation sequence), v2.9 03 new game plus (a sequel
briefing could recap the carried outcome), v2.8 19 open stretches.

## Review 2026-10-03

Applied: F10 (one activation sequence; the identity slot is v2.8 03's), F13 (C8 built only here; auto-draft has its
contract in v2.8 10; the saga/act indicator has a rule and a gate), A8 (decision 3 gets a body; decision 1's drafting
moves to v2.8 10 with model-input spoiler protection), A13 (line refs; the briefing reads `player_intro` directly), the
Claude-A note on 03's fallback refs, Sol split item 1 (static half here, LLM drafting v2.8), B10 (registry gate), B12
(references).
