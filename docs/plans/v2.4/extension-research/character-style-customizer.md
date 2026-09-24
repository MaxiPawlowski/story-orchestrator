# Character Style Customizer — v2.4 review

Author Rivelle · repo `RivelleDays/SillyTavern-CharacterStyleCustomizer` (**gone**: "Repository not found", checked 2026-09-20, `MIRROR-NOTE.md`) · commit n/a · 70 upvotes / 243 msgs · thread titled "[Fix pending]" · **source available: n** (no clone, no credible mirror). Everything below is from `post.md` only; no mechanics are verified.

## What it is
Cosmetic extension: per-character / per-persona message styling. Base colors injected as CSS variables, per-element text colors (name, body, quotes, bold/italic, links, blockquote border), free-form "Message CSS" (properties only, no selectors) scoped to that character's messages, "Global CSS" applied page-wide while the character is on screen, and import/export of a style preset as `[CSC] CharacterName.json`. No LLM calls, no prompt injection, no chat state.

## How it works
Source absent, so only what `post.md` states:
- CSS variables injected for base colors plus an "Element Color Mapping" layer to reuse colors across roles (`post.md` §Features).
- Message CSS: author writes bare declarations; the extension supplies the selector for that character's messages (`post.md` §Features). Mechanism (per-`.mes` attribute selector vs inline style vs generated stylesheet) unknown.
- Global CSS: whole-UI stylesheet active whenever the character is present; the author warns it "may override other characters' styles" (`post.md` §Features).
- Persistence: presumably extension settings keyed by character/persona (not stated). Portability via JSON file export/import (`post.md` §Features).
- Swipes/edits/deletes: not applicable (no state beyond styling). Thread title "[Fix pending]" and the withdrawn repo suggest it broke against an ST update; cause not recorded.
- ST hooks: none citable (no source).

## Overlap with Story Orchestrator
Almost none. SO never restyles or rewrites message DOM (baseline §4: `mes_text` unused; SO only subscribes to render events for boundaries). SO's CSS is deliberately scoped to its five mount roots (`src/styles.css`, gotchas "All our CSS is scoped to the mount roots"; invariant 19) — the opposite of this extension's Global CSS. The one shared shape is JSON export/import of an authored artifact: SO already has it (`src/studio/io.ts:4` `exportDraft`, download in `src/studio/components/StudioToolbar.tsx:17`/`:90`, filename `<storyId>.json`). Roster members carry `id/name/role` only, no presentation fields (`src/engine/schema.ts:177` `RosterMember`); grep of `src/` for `customCss|style.setProperty|memberColor|avatarColor` returned nothing.

## Ideas for v2.4

| # | idea | kind | our area | our state | value 1-5 | effort S/M/L |
|---|------|------|----------|-----------|-----------|--------------|
| 1 | Never ship page-wide CSS tied to a character/story being present | anti-pattern | host / player-ui | present (we already scope) | 2 | S |
| 2 | Optional per-roster-member accent color in author-view talk panels | ux | player-ui (author view) | absent | 1 | S |

**1. Anti-pattern: presence-scoped global CSS.** Their Global CSS applies to the whole ST UI while a character is on the page and the author concedes it overrides others (`post.md` §Features). That is exactly the leak class SO removed on 2026-09-19 (forced `body` font-size, Tailwind `.hidden` over ST's `.hidden`). Our evidence: gotchas "All our CSS is scoped to the mount roots" + invariant 19. Action for v2.4: none beyond keeping the rule; if a future stagecraft visual effect (e.g. per-checkpoint mood theming) is ever proposed, it must be a scoped, ledgered, revertible effect through `EffectsApplier.withLedger` (invariants 6/16), never a stylesheet toggled on presence. Also note the "[Fix pending]" → withdrawn trajectory: extensions that key off ST's message DOM break on host DOM churn — consistent with our choice to touch only our own roots and read ST via events.

**2. Roster accent color (low value).** Their per-character colors make speakers visually distinct. SO's author view lists talk decisions and epistemic/ledger rows by name (Scheduler tab, `src/components/drawer/DrawerTabs.tsx:710`); an optional `roster[].accent` rendered only inside our roots would aid scanning in large groups. Our state: absent (`RosterMember` has no such field). Fit: story-record field (config home = story, invariant 13), scoped CSS (19), author-view only so no player-surface impact (9). Cost is a schema field + Studio Roster input + a CSS var on our own elements. Honest value 1: cosmetic, no user demand recorded; list only as a filler if Studio Roster work happens anyway.

## Patterns to copy / anti-patterns to avoid
- Copy (already have): portable JSON preset per authored unit — our Studio export matches it.
- Copy (weak): "properties only, selector supplied by the extension" is a decent guardrail if SO ever lets authors add CSS — it prevents author CSS escaping its target. Not planned.
- Avoid: presence-triggered whole-UI CSS (idea 1). Avoid: styling ST's message DOM directly (breaks on host updates; ST's `a11y.js`/theme cascade already fight us, see `.claude/sillytavern-docs/community/ui-dom-selectors.md`).

## ST host facts learned
None — no source to cite. Nothing contradicts our gotchas. (Author recommends latest ST Release/Staging + Chrome, `post.md` §Prerequisites — not a host fact.)

## Verdict
Relevance **none-to-low**. Pure cosmetics, repo withdrawn, no source. Nothing worth taking beyond reaffirming the scoped-CSS rule; idea 2 is optional polish only.
