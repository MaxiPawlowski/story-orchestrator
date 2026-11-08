# NemoPresetExt — 2026-11-08 harvest

meta: https://github.com/NemoVonNirgend/NemoPresetExt · `pre-refresh-2026-11-08..6c42fca` (14 commits, 6.0.21 → 6.0.27, 26 files
+1965/−47, half tests) · **no licence: ideas only** · read: commit messages; `features/response-tokens/{controller,runtime}.js`,
`features/prompt-rendering/deferred-counts.js`, `content.js`/manifest diffs, `features/lorebook-spacing/runtime.js` at HEAD · skimmed:
`incremental.js`, `category-tray.js`, `state-actions.js` diffs · skipped: `features/gemini-models/*` (model `<option>` lists), tests,
browser scripts · prior: `docs/plans/v3.0/extension-research-2026-10-30/nemopresetext.md` (P1 macro canary → HF-MACRO, P2 ReSwipe →
plan 31). **Worked by absolute path only; the tracked `.claude/settings.local.json` was not opened or used.**

## What it is / what changed

CC prompt-manager UX and two request-side changes: (1) a response-token guard that forces the displayed `#openai_max_tokens` into
outgoing CC reply requests and restores it per preset at startup; (2) toggles defer ST's token-count dry run. Plus Gemini model options,
in-place row updates, batched prompt saves. Nothing touches group speaker control or lorebooks beyond the unchanged spacing listener.

## How it works

- **Response-token guard** (`response-tokens/controller.js:41-77`): on `CHAT_COMPLETION_SETTINGS_READY` for reply types
  (`normal|continue|swipe|regenerate|impersonate|append`), it defines a non-enumerable `toJSON` on the request object that spreads the
  payload and overwrites `max_tokens`/`max_completion_tokens` at serialization. Quiet/raw helper requests keep their own budget. It
  re-places itself with `makeLast` on `GENERATION_STARTED` and `CHAT_COMPLETION_PROMPT_READY`. At `APP_READY` it rewrites
  `oai_settings.openai_max_tokens` from its per-preset memory (`runtime.js:23-28`).
- **Deferred dry run** (`prompt-rendering/deferred-counts.js:52-80`): `PromptManager.render()` runs `tryGenerate()` (a full dry-run
  assembly + tokenize) only to refresh counts. When the only visible change is an on/off toggle, Nemo calls `render(false)` and marks the
  total stale until ST's next `setChatCompletion`.
- **Batched saves** (commit `916d1c7`): ST's prompt-manager save is a ~1 s debounce per change; a batch saves once, rollback on failure.

## Patterns for SO

None worth building. Two confirmations:

### P1. Overlay vs serializer — host-fact · samplerOverlay · present · value 1
SO's overlay mutates the payload in place in its own last-placed `CHAT_COMPLETION_SETTINGS_READY` listener
(`src/services/stHost/samplerOverlay.ts:35`, `events.ts:130-140`) and never writes `max_tokens` (`src/utils/samplerKeys.ts:61`). Nemo's
`toJSON` spreads that same object, so SO keys survive whichever listener runs last. Both re-place with `makeLast` on
`GENERATION_STARTED`; Nemo re-places again on `CHAT_COMPLETION_PROMPT_READY`, so Nemo ends last. No conflict today; it would become one
only if SO ever sets `max_tokens` on a CC reply (it would be silently overwritten at serialization). SO's play route is TC anyway.

### P2. Dry scans do not pollute the lore budget ledger — confirmation · loreBudget · present
`WORLDINFO_ENTRIES_LOADED`/`WORLDINFO_SCAN_DONE` carry no dry flag (`public/scripts/world-info.js:4604`, `:888-903`), and every
prompt-manager render on CC is a dry scan. SO's budget observer records only during a loud generation (`src/runtime/loreBudgetHost.ts:24`).
Nemo deferring dry runs only reduces dry scans. No action.

## Host facts

- An extension can rewrite a CC reply request at serialization through a `toJSON` installed at `CHAT_COMPLETION_SETTINGS_READY`; ST
  itself sets none (`public/scripts/openai.js:3148`, no `toJSON` in openai.js/script.js). A payload probe that reads the object (not
  the sent body) can differ from what was sent when Nemo 6.0.26+ is loaded.
- Nemo 6.0.25+ rewrites `oai_settings.openai_max_tokens` at `APP_READY` from its own per-preset memory: an install-wide setting that
  can move between `so-run-header` captures on CC lanes. Harmless on TC.
- `PromptManager.render()` (default `afterTryGenerate = true`) runs a dry-run `Generate`, which scans WI and fires
  `WORLDINFO_ENTRIES_LOADED` without interceptors.
- SO's conflict row comment cites `content.js:105` for `initializeLorebookSpacing`; at 6.0.27 it is `content.js:116`
  (`src/services/stHost/extensionConflicts.ts:43`). Behaviour unchanged (listener still always on); line ref stale only.

## Not worth taking

- Gemini model options, tray virtualization/scroll fixes, in-place row rendering: prompt-manager UI, not ours.
- Displayed-response-budget guard: CC only, one user, SO does not touch the response budget on CC.
- Stale-count marker: SO's next-turn preview composes from the registry, not a dry run (`runtime/nextTurn.ts`).

## Security notes

- SECURITY.md: CLEAR. Diff has no network calls and no secret access; `execFileSync` only in `tests/module-syntax.test.js`.
- **Agent trap (pre-existing, still tracked):** `.claude/settings.local.json` auto-allows `Bash(python:*)` and more for any Claude Code
  session started in that checkout. Never start an agent with cwd there. Not used.
- Commit messages carry `Co-Authored-By`/`Claude-Session` trailers and live-test notes: maintainer records, not addressed to a reviewer.
- `toJSON` patching of request objects is a request-rewrite surface (same-origin only). Nothing above needs it.
