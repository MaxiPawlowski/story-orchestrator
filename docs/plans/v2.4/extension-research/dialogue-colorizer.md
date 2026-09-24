# Dialogue Colorizer — v2.4 review

Author Xanadus · repo https://github.com/XanadusWorks/SillyTavern-Dialogue-Colorizer · commit `4779a35` (2025-12-12) · 57 upvotes / 53 msgs · source available: yes (19 files, ~2.1k lines JS). README marks it **unmaintained and "partially broken"**, points to fork `zerofata/SillyTavern-Dialogue-Colorizer-Plus` (not reviewed).

## What it is
Pure cosmetic extension. Colors quoted dialogue (`<q>` inside `.mes_text`) and optionally chat bubbles per character and per persona. Color source: most vibrant swatch of the avatar (Vibrant.js), a static color, or a per-character override set in the card/persona edit panel. No LLM calls, no prompt injection, no chat metadata, no story state.

## How it works
- **ST hooks**: static imports of `script.js` (`eventSource`, `event_types`, `saveSettingsDebounced`, `user_avatar`), `extensions.js` (`extension_settings`, `getContext`), `power-user.js` (`power_user.personas`) — `index.js:3-4`, `st-utils.js:1-4`. Events used: only `CHAT_CHANGED` (`index.js:485`) and `APP_READY` once (`index.js:490`).
- **Everything else is DOM MutationObservers set up at module import** (`st-utils.js:163-194`): `#avatar_url_pole` `value` attr → "char card changed"; `#user_avatar_block` class/childList → persona added/removed/selected; `#chat` childList → message added/removed. Re-emitted through a private `EventEmitter` (`st-utils.js:9-47`).
- **Author attribution from the DOM**: each new `.mes` gets `xdc-author_uid="<type>|<avatarFile>"` (`index.js:268-282`), where the author is parsed out of the avatar `<img src>` thumbnail URL (`st-utils.js:305-345`, regex `?type=avatar&file=` at :336). Workaround for `/sys` not setting `is_system` (`st-utils.js:311-312`).
- **Styling**: two `<style>` elements appended to `body` (`index.js:405-414`), fully rewritten on every change with attribute selectors `.mes[xdc-author_uid="…"] .mes_text q { color }` and `.bubblechat .mes[…] { background-color … !important }` (`index.js:87-112`). Characters sheet = current chat's members (group: `groups.find(...).members`, `st-utils.js:277-286`); personas sheet = all personas so old messages from a non-current persona keep color (`index.js:139-148`).
- **Color derivation**: Vibrant swatch "Vibrant" then "Muted" fallback (`index.js:188`), HSL nudge for contrast (`index.js:165-176`, author's own TODO calls it arbitrary), bubble = same hue at fixed lightness (`index.js:222-234`). Cache per uid, never invalidated (`index.js:179-192`).
- **Persistence**: `extension_settings["SillyTavern-Dialogue-Colorizer"]`, overrides keyed by avatar filename, **not** written to the card (README; `index.js:448-451`). `saveSettingsDebounced` on every change.
- **UI placement**: settings drawer appended to `#extensions_settings2` (`index.js:476-479`); a color picker injected into ST's character form after `#avatar-and-name-block` (`index.js:420-423`) and into the persona panel above `#persona_description` (`index.js:429-431`).
- **Mutation handling**: none needed — re-render → new `.mes` node → observer re-tags it. Swipe/edit re-renders are caught incidentally by the `#chat` childList observer.
- **LLM calls**: none.

## Overlap with Story Orchestrator
- Essentially none. SO never touches message DOM (`mes_text` unused; baseline §4), scopes all CSS to its mount roots (`src/styles.css`, invariant 19), and identifies speakers from the chat array (`message.name`, `src/runtime/coordinators/stagecraftCoordinator.ts:61-62`), not from DOM avatars.
- SO's host access is dynamic-import only (`src/services/stHost/modules.ts:5`); this extension's static imports of `script.js`/`power-user.js` are exactly what our invariant 2 forbids.
- SO has zero `MutationObserver` usage in `src/` (grep 2026-09-23); ST events cover what we need.
- SO settings defaults are factory functions (`src/runtime/extras.ts:17` `defaultPacingSettings = () => ({…})`), which already avoids this extension's aliasing bug (below).

## Ideas for v2.4

| # | idea | kind | our area | our state | value | effort |
|---|---|---|---|---|---|---|
| 1 | Per-roster-member accent color in author panels (talk decisions, epistemic, ledger, conflict queue) | ux | player-ui | absent | 2 | S |
| 2 | Keep defaults as factories; never `structuredClone` a defaults object with shared sub-objects | anti-pattern | host | present | 1 | S |

**1. Roster accent.** What: a stable per-member color (hash of roster id, optional authored override) used as a left border/chip in SO's own author panels, so "who knows/hides what" and "who was picked" scan faster in a 4–6 member group. Theirs: attribute-keyed per-author CSS (`index.js:87-112`), stable uid `type|avatar` (`STCharacter.js:82-84`). Ours: talk decisions render as plain text rows (`src/components/drawer/DrawerTabs.tsx:487-495`); no `color` anywhere in `src/engine/schema.ts` or runtime (grep). Fit: only inside our mount roots (invariant 19); must NOT color ST's `.mes` (SO never rewrites message DOM). An authored `roster[].color` would be a story-schema addition (invariant 12/13 fine, but a format change) — hash-derived first, no schema change. Low value; cosmetic.

**2. Defaults aliasing (anti-pattern).** Theirs: `defaultExtSettings` uses the SAME `defaultCharColorSettings` object for `charColorSettings` and `personaColorSettings` (`index.js:61-67`), then `initializeSettings` does `structuredClone(defaults)` (`settings-utils.js:94`). Structured clone preserves shared references, so on a fresh install both keys are one object — changing the persona color source also changes characters until the first save/reload splits them via JSON. Also shallow `Object.assign` merge: nested defaults are not deep-merged into older saved settings. Ours: factories + sanitizers (`src/runtime/extras.ts:17-24`) — already safe; no action beyond keeping the rule.

## Patterns to copy / anti-patterns to avoid
- Copy (only if SO ever styles its own per-member UI): one `<style>` element rewritten wholesale from a derived map, attribute selectors keyed by a stable id (`index.js:122-148`) — cheap, no per-node work, trivially reversible by emptying the sheet.
- Avoid: speaker identity parsed from DOM avatar `src` (`st-utils.js:305-345`) — breaks on `force_avatar`, renamed files, thumbnail URL changes; ST already puts `ch_name` on `.mes` (`public/index.html:7392`, `script.js:2650`) and the chat array has `name`.
- Avoid: MutationObservers bound at module import on ST internals (`#form_create`, `#user_avatar_block`, `#chat` — `st-utils.js:163-194`); any ST layout change throws at load. SO's rule (ST events by constant keys, `stHost/events.ts`) is sturdier.
- Avoid: falsy-zero id checks — `if (!currCharIndex)` / `!!getContext().characterId` (`st-utils.js:214-216`, `265`). Safe only while `this_chid` is a string (`script.js:7126`); the `script.js:7129` branch can store a raw value. Same class as our `Number(null) === 0` gotcha (`hostMessageId`).
- Avoid: never-invalidated derived cache (`avatarVibrantColorCache`, `index.js:179`) — a changed avatar keeps its old color forever.
- Avoid: `!important` overrides on ST theme classes (`.bubblechat .mes`, `index.js:105-106`) — fights user themes.

## ST host facts learned
- ST wraps quoted text in `<q>` during `messageFormatting` for `"…"`, `“…”`, `«…»`, `「…」`, `『…』`, `＂…＂`, skipping code spans and `<style>` (`public/script.js:1900-1920`; their consumer `index.js:91`). Relevant only if SO ever needs a dialogue-vs-narration split — extraction reads raw `mes`, so no action.
- `.mes` carries `ch_name`, `is_user`, `is_system` attributes (`public/index.html:7392`, `script.js:2650-2651`). Their code claims `/sys` messages lack `is_system="true"` (`st-utils.js:311`) — unverified on current ST, treat as stale.
- Personas live in `power_user.personas` as `{avatarFile: name}` (`power-user.js:286`; their use `st-utils.js:243-246`).
- Group members are avatar filenames in `groups[].members` (`st-utils.js:283-285`) — matches our `stHost/groups.ts:22`.
- Character avatar thumbnail URL shape `/thumbnail?type=avatar&file=<file>`, persona `/User Avatars/<file>` (`STCharacter.js:17-30`).
- No contradictions with our gotchas.

## Verdict
Relevance **low**. Cosmetic DOM styler with no state, LLM or prompt surface; its core mechanism (restyling ST's message DOM) is something SO deliberately does not do. Only thing worth taking: the idea of a stable per-roster-member accent inside SO's own author panels — optional polish, not a plan item on its own.
