# RPG Companion — 2026-10-14 harvest

meta: https://github.com/SpicyMarinara/rpg-companion-sillytavern · head `9c48009` (unchanged since v2.4 review) · licence
LICENSE file = AGPL-3.0, package.json says MIT → treat as AGPL, ideas only, no code · read: `src/systems/rendering/{infoBox,thoughts,quests,inventory}.js`,
`src/systems/ui/{weatherEffects,alternatePresentCharacters}.js`, `src/systems/integration/thoughtBasedExpressions.js`,
`src/utils/{presentCharacters,sillyTavernExpressions}.js`, `src/core/state.js` defaults · skipped: encounter, themes, i18n,
mobile drag code, trackerEditor, all generation code (covered by prior review) · prior:
`docs/plans/v2.4/extension-research/rpg-companion-sillytavern-extension.md`

## What it is / what changed

No code change. Second look, aimed at v2.8 plans 23, 50, 51, 52, 53 and 58. The prior review covered generation, swipes
and injection, and skipped the player UI. That UI is the part relevant now. It has an at-a-glance "info box" dashboard
(date, weather, temperature, a clock showing the time span, location, recent events). It has present-character cards
(portrait, relationship emoji badge, custom fields, thoughts). Inline per-message thought dropdowns, quests (main and
optional), an inventory (carried, worn, stored by location, assets) and an ambient weather and time-of-day overlay round it out.

## How it works

- **Info box dashboard.** `infoBox.js:330-480`. Row 1 holds the widgets: calendar (month, weekday, year), weather (emoji
  plus forecast), a thermometer and a clock. The clock draws hands from `time.end` and labels the span as
  `start → end` (`:420-450`). Row 2 is location with a pin, then recent events. Each widget is switched per install
  (`state.js:180-188`). The container hides when there is no data (`:94-97`).
- **Present-character card.** `thoughts.js:328-470`. A portrait comes first. It is resolved through a fallback chain:
  custom NPC image → group member card thumbnail → any card with a matching name → a fallback data URI
  (`presentCharacters.js:194-244`). A relationship word sits as an emoji badge on the portrait's corner. The mapping
  table is `{Lover: ❤️, Friend: ⭐, Ally: 🤝, Enemy: ⚔️, Neutral: ⚖️}` (`state.js:191-213`; render `thoughts.js:364-386`).
  Custom fields follow, then stats coloured on a low→high gradient (`thoughts.js:63`, `:440-455`). A compact "alternate"
  strip shows just portrait and name (`alternatePresentCharacters.js:51-84`).
- **Inline per-message thoughts.** `thoughts.js:1333-1715`. One `<details>` per character goes under the target reply.
  The target is the newest assistant message whose per-swipe payload equals the current one (`:1385-1419`). The open
  state is captured before every rebuild and restored after it (`:1467-1478`). The dropdowns mount **outside
  `.mes_text`**, before `.mes_media_wrapper`, "so SillyTavern's click-to-edit handlers do not intercept summary clicks"
  (`:1662-1669`). A MutationObserver on `#chat` re-attaches them after ST re-renders a message (`:1480-1541`).
- **Thought-based expressions.** `thoughtBasedExpressions.js:296-420`. Each present character's thought text goes
  through ST's Expressions classifier (`/api/extra/classify`, or its LLM/WebLLM modes; `sillyTavernExpressions.js:477-517`).
  The result picks a sprite for the portrait. Results are cached **in the swipe's extra**, keyed by thought text plus
  classifier-settings, portrait-settings and sprite-folder signatures. A `runId` drops stale runs (`:356-396`).
- **Ambient overlay.** `weatherEffects.js:727-830`. It parses the weather text into one of a fixed set of keywords,
  matched per language (`:111-223`). The hour comes from the clock. The result is drawn as snow, rain, mist, storm, wind,
  sunrise or sunset, or night with a moon. Sun and moon positions move with the hour without being recreated (`:679-712`).
- **Inventory.** `inventory.js:50-548`. Sub-tabs: on person, clothing, stored (collapsible per location), assets. List
  and grid views. Collapsed locations and the chosen view persist per install (`state.js:262-268`).
- **Quests.** `quests.js:90-220`. A single main quest and a list of optional ones, each with a one-line hint. The player
  adds, edits and completes them by hand.

## Patterns for SO

### P1. "Here now" scene card — feature · player UI · absent (pieces planned: 50, 51, 52, 53, 58) · value 4 · effort M
- **What.** One compact player card answering "where, when, with whom". Location word, time label, the present members
  with card portraits, and for each member the public labels the plans make visible. Each line links to its full page.
- **Theirs.** The info-box rows (`infoBox.js:330-480`) and portrait cards with a relationship badge
  (`thoughts.js:364-390`, `presentCharacters.js:194-244`).
- **Ours.** Each v2.8 plan has its own home:
  - the time label goes only where the author places it (50 §8 `:176-177`);
  - relationship labels live only on person pages (51 `:109`, "no interim surface");
  - codex pages are planned (52);
  - standing words are planned (53);
  - keepsakes go on the giver's page or a Journal list (58).
- **The gap.** Nothing composes these. No player surface shows location or who is present: `presentRosterIds`
  (`src/runtime/whereabouts.ts:7-10`) feeds only prompts and notices. The `roster` widget is text-only, with no portrait
  (`src/runtime/widgets.ts:163-174`). No stHost module resolves card thumbnails (grep `getThumbnailUrl` → 0).
- **Fit.**
  - The card is a projection over the plans' own projections. It builds nothing new, so 51/52/53/58's byte-identical
    spoiler properties carry over if the card reads their player views only.
  - It shows presence only for members the player can see (enabled, not away).
  - It needs an author `display` opt-in for time, per 50 §8. A new `scene` widget kind (plan 23 table) is the cleanest
    home.
  - Portraits need a new `stHost` module, `avatars.ts`, wrapping `getThumbnailUrl('avatar', file)`.
- **Conflict.** This reopens 51's decision 2 ("no interim surface"). The card is not interim, but the owner decides.

### P2. Time span and time-change chips per reply — pattern · inline timeline / 50 · absent · value 3 · effort S
- **What.** When `story_time` advanced at a boundary, show "evening → night" on that reply's inline strip. A skip read
  shows "→ next morning".
- **Theirs.** The clock labels each reply's span as `start → end` (`infoBox.js:420-450`).
- **Ours.** Inline categories come from the boundary log (`src/components/inline/InlineStrip.tsx`). Plan 50 gives the
  label only to widgets and `display` (50 `:176-177`).
- **Fit.** Show the chip only when the author displays time (50 T7, byte-identical without it). The diff is on the
  projected label, as `changedAgo` already does (`src/runtime/widgetHistory.ts:8-17`). Rollback-safe, since it is
  derived from the log.

### P3. Relationship label as an avatar badge — pattern · 51 presentation · planned: 51 (page only) · value 3 · effort S (inside P1)
- **What.** Put the authored public label on the holder's portrait corner as a glyph or short word, with the full word
  in a tooltip.
- **Theirs.** `thoughts.js:374-386`. Their glyph comes from a fixed install-wide map, so every story shares five
  relationship kinds.
- **Ours.** 51 renders words on the person page only.
- **Sketch.** Authored optional `badge` (closed icon set, like `WIDGET_ICONS`, `src/engine/gameSchema.ts:123`) on the
  public label. A secret label never gets a badge before its reveal latches. A badge that changes on reveal is fine:
  the reveal is a player event already.
- **Do not** badge ST's own `.mes` avatars. Architecture guard: only declared modules touch message DOM
  (`src/runtime/architecture.test.ts:98-104`). Keep the badge in the P1 card.

### P4. Ambient time-of-day / weather layer — feature · stagecraft presentation · absent · value 2 · effort M
- **What.** A tint or particles derived from plan 50's `is_night`/`time_of_day` and an optional authored `weather` enum.
- **Theirs.** `weatherEffects.js:727-830`. They parse free text with keyword lists. We would bind a closed enum instead.
- **Ours.** No weather anywhere (grep `src` → only judge and self-test strings). `effects.background` is the
  deterministic precedent.
- **Fit.** Pure presentation of state that rolls back, so rollback ≡ replay holds. It must respect the Interface motion
  rows (reduced motion = tint only) and stay under the main-bundle budget (lazy chunk). Low priority.

### P5. Persist derived expression reads per swipe — pattern · sprites · partial · value 2 · effort S
- **What.** Cache the expression classification of a reply in that swipe's `extra`. Key it by text plus
  classifier-settings and sprite-folder signatures, so reload and swipe-back do not pay the judge/LLM again.
- **Theirs.** `thoughtBasedExpressions.js:337-410`.
- **Ours.** Reads are cached in memory per stream by text key only (`src/sprites/stage.ts:449`, `:483`). Unverified
  whether a reload re-classifies every visible reply. Check before building.
- **Fit.** The key must include everything the read depends on (our cache-key gotcha). A write into
  `message.extra` is a host write, so it needs a stHost `WriteResult` and a `RunOwnership` check.

### P6. Test idea: clicks inside `.mes_text` open the editor, and an edit is a rollback — test-idea · inline UI · present (safe today) · value 2 · effort S
- **The risk.** With `power_user.click_to_edit` on, any click inside `.mes_text` triggers `.mes_edit` (host
  `public/scripts/chats.js:2291-2298`). They mount outside it for that reason (`thoughts.js:1662`).
- **Ours.** `inlineMount.ts` appends to `.mes_block`, outside `.mes_text` (`src/services/stHost/inlineMount.ts:40-48`).
- **Proposal.** Add a guard assert that no SO host lands inside `.mes_text`. An accidental edit there means a rollback.

### P7. Faction rows in the `roster` widget must drop `changedAgo` — cross-check for 53 · widgets · gap vs plan · value 2 · effort S
- **The conflict.** Plan 53 says no `changedAgo` reaches a player surface (53 `:182`). But `rosterBody` emits
  `changedAgo` for player rows (`src/runtime/widgets.ts:170-171`).
- **Why it matters.** If 53 shows standing through a roster widget, its rows leak recency. The leak is limited to band
  changes, because the diff runs on projected text (`widgetHistory.ts:14`). It still breaks 53's rule. Not from this
  repo, but found while comparing.

## Host facts

- `power_user.click_to_edit` + click anywhere in `.mes .mes_text` or `.mes_reasoning` → triggers `.mes_edit`
  (verified `public/scripts/chats.js:2291-2298`). It is skipped when text is selected or an edit is already open.
- ST's Expressions classifier has a server endpoint `/api/extra/classify` (local mode). Their wrapper is
  `sillyTavernExpressions.js:510`, and our `src/sprites/classify.ts` `local` dep already covers it. Not re-verified.
- Card thumbnails: `getThumbnailUrl('avatar', member.avatar)`. A group member's `avatar` can be `'none'`
  (`presentCharacters.js:213-220`). Not re-verified.
- ST re-renders message DOM on swipe, delete and cleanup, which drops foreign nodes. They use a MutationObserver. Our
  event list (`inlineMount.ts:8-11`) covers the same cases. No bug found.

## Not worth taking

- Contenteditable player edits of state, plus lock icons. The player never writes story state. Locks belong to the
  author (prior review).
- Per-character "thoughts" shown to the player. It leaks every held secret. Our inner voice is the safe form.
- Install-wide relationship and emoji vocabulary. Labels are authored per story (51).
- Hand-entered quests and inventory. Our quests are gated story state (`gameSchema.ts`). Keepsakes (58) are authored
  latches.
- Model text interpolated raw into `innerHTML` (`thoughts.js:376-386`, e.g. `${char.name}`), which is XSS from LLM
  output. React escapes ours; the html widget is sandboxed.
- Free-text weather keyword parsing per language. We bind closed enums, and the content is English only.
- MutationObserver re-attach. Our event-driven reattach is narrower.
