# Style guide

One look and one voice for every surface: the workspace, the drawer, the HUD, dialogs, the tour and the guide.
Taken from the code as it is; when the code and this page disagree, fix one of them in the same change.

## Colour

- **SillyTavern's theme variables only.** Use `--SmartTheme*` (`BodyColor`, `EmColor`, `QuoteColor`,
  `UnderlineColor`, `BorderColor`, `BlurTintColor`, `UserMesBlurTintColor`, `BotMesBlurTintColor`) and the `--st-*`
  tokens built on them in `src/styles.css` (`--st-border`, `--st-bg-tint`, `--st-bg-active`, `--st-text-active`,
  `--st-hover`, `--st-success`, `--st-warning`, `--st-error`, `--st-info`). A fallback inside `var()` may name an ST
  variable such as `--grey10` or `--black70a`; a new literal colour is a bug, because it breaks the user's theme.
- **Two accents, one meaning each.** The quote colour (`--SmartThemeQuoteColor`) is **Story**: this chat, playing,
  the player view. The em colour (`--SmartThemeEmColor`, the blue in the default theme) is **Orchestrator**: install
  settings, authoring, setup. The workspace sets `--so-context-accent` from `data-context`; the tour from `data-view`.
  Use the accent for the current page, the pressed view, the primary action and the "Do this" rule, nothing else.
- **Severity has its own tokens**: `--st-error` stops the story (`blocks`, the **fix setup** chip), `--st-warning`
  weakens it (`degrades`, **check setup**), `--st-success` is done or applied, `--st-info` is neutral. Text classes:
  `so-error-text`, `so-warning-text`, `so-success-text`.
- Mix, do not invent: tints are `color-mix(in srgb, <token> 18%, transparent)` over a token.

## Type, spacing and controls

- Panels stay at `1rem` whatever ST's font scale (owner decision); headings are 1.25rem (frame title) to 0.78rem
  (uppercase section labels with letter spacing). Monospace only for commands, keys and ids.
- Spacing comes from Tailwind's scale inside the mount roots (`gap-2`, `p-3`) or rem values in a feature's own
  stylesheet (`.25rem` steps). No pixel layouts except hairlines.
- **Every control is at least 44px tall** in the workspace and the tour (buttons, selects, inputs, summaries).
- Buttons are ST's `menu_button` (or `.st-button` in the workspace); the primary action adds the accent border.
  Toggles are labelled checkboxes. Chips are `.st-chip` / `.st-pill`, round, small text, a border in the state's
  token. Icons are Font Awesome classes ST already ships, with an `aria-label` when the icon is the whole button.
- CSS is scoped to the mount roots listed in `src/styles.css` (`:is(#drawer-manager, … #so-tour-modal)`); a new root
  goes into that list and into `mountRootFor` in `.storybook/preview.ts`.

## Layouts

- **Workspace** (`#so-workspace-modal`, `src/components/workspace/workspace.css`): a full-screen native dialog. A
  header with the title, scope line and Close, a 3px accent rule under it, the **This story / Orchestrator** switch,
  a page nav on the left (a bottom bar under 700px, with a Back button), content capped at 72rem.
- **Drawer and HUD**: the route icon opens **This story → Play**; the HUD is one line above the chat input
  (`#so-hud-root`) with the scene and at most one state chip.
- **Dialogs** are native `<dialog>` + `showModal()`, never a positioned div (ST's `<html>` transform breaks
  `position: fixed`). Escape closes the top dialog only; focus returns to the opener. Nested dialogs (the tour's
  finder and guide reader) are their own `<dialog>`.
- **The tour** (`#so-tour-modal`) reuses the workspace frame: header, view switch, step nav, content. A step pairs
  guidance (Do this / You should see / If it looks off) with an example that only changes its own state.

## Copy

- **Plain words, consequence first.** Say what happens to the story, then what to do: "The story will not advance on
  its own until this is set." Player copy comes from `src/runtime/narrative.ts` (`PLAYER_COPY`) and
  `src/runtime/pipeline.ts`; feature copy from `src/features/*Copy.ts`.
- **Names, never ids.** Checkpoint names, card names, page names. No repo paths, plan ids, raw ids, camelCase keys or
  snake_case in player copy; `registry.test.ts` and `src/features/jargon.ts` enforce it (say "turning point", not
  "checkpoint"; "reply", not "boundary").
- **One save vocabulary**: `Saved "X" to the library.` for the library half, `Applied to this chat: …` for the chat
  half, never one sentence for both.
- **Errors** say what will not happen, then the fix, then (Author view only) the detail. Every diagnostic declares its
  consequence; a check has player copy or none.
- **Locations** are written as the user clicks them: **Orchestrator → Connections → Memory model**. Buttons and labels
  in bold, commands in code: `/story tour setup`.
- English only. Sentence case. No exclamation marks, no "simply" or "just".

## Docs and screenshots

- The user guide is `docs/guide/`; the in-app reader and the tour's **Read more** read the same pages
  (`npm run docs:guide` rebuilds `src/guide/pages.generated.ts`). Author field pages come from
  `docs/authoring/story-guide.md`; the settings reference is generated (`npm run docs:settings`).
- Link pages relatively (`setup/judge.md#install`); `scripts/docs/guide-bundle.mjs` fails on a broken link or anchor,
  and the tour's drift test fails on a **Read more** target that is not a guide page.
- Short paragraphs, tables for reference, one idea per bullet. Same location wording as the UI copy.
- Screenshots and sketches go in `docs/guide/assets/` as png, jpg or webp under 150 KB, each with alt text, each used
  by a page. Capture them at the 1280px desktop and 390×844 phone viewports in ST's default theme, with no story,
  character or chat content from a private campaign.
