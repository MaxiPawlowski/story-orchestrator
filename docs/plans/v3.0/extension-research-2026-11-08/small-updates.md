# Small updated repos — 2026-11-08 harvest

Five repos with diffs since `pre-refresh-2026-11-08`. Lens: VN stage and sprites (20, 39, 45), the wizard and Ask (`src/copilot/`,
`src/studio/`), UI rework (29). Read-only: `git log/diff/show` and file reads by absolute path; nothing executed. SECURITY.md:
four CLEAR, sillytavern-copilot-p3dra CAUTION (ideas only). Four ideas worth a row, one suspected SO gap, three host facts.

## 1. BB Visual Novel Engine (`bb-visual-novel-engine`)

meta: https://github.com/maxkara14/BB-Visual-Novel-Engine `pre-refresh-2026-11-08..d971e3b` (5 commits, no version bump, 21 files
+938/−49) · **no licence: ideas only** · read: full diff of `modules/history-recovery*.js`, `social.js`, `utils.js`,
`text-normalization.js`, `portrait-ui.js`, `settings.js`, EN changelog · skipped: tests bodies, RU text, CSS · prior:
`docs/plans/v3.0/extension-research-2026-10-30/bb-visual-novel-engine.md`, v2.8 `-10-21/`, `-10-14/` (H11a/H11b built; R31-R33,
R69 SKIP; v2.9 G11-G14). Nothing here reopens a row.

What changed:
- **Restore relationships from history** (`modules/history-recovery.js`, `-ui.js`): a manual backfill for a chat that ran without the
  tracker. Range = last N / whole chat / custom, with boundary excerpts and a request count shown before any call. Batches of ~18,000
  chars (`history-recovery.js:47-60`). The model's proposals are shown with a checkbox each; nothing is saved until the player saves.
  Coverage is recorded per message, per swipe, per persona, keyed by a source string of the message plus the message before it
  (`:12-16`); covered or natively tracked turns are skipped (`:24-45`); editing either message invalidates the recovered events at
  recalculation (`social.js` recalc filter via `recoveryIsCurrent`). All-or-nothing apply: every item is re-validated before the first
  write (`:104-111`). The dialog checks chat, `chat_metadata.integrity`, persona and a state signature before each batch and before
  save (`history-recovery-ui.js` `isCurrent`).
- **Label direction prompt** (`history-recovery.js:92-97`): "[NPC] sees [player] as [user_label]" self-check, asymmetric examples,
  empty when unsupported; labels from earlier batches are withheld from later batches so an inverted reading is not reinforced (`:84-85`).
- **Category beats magnitude** (`utils.js:630-641`, `social.js:2549-2561`): "deep" memories come from the categories `life_changing`/
  `unforgivable`, not from |delta| ≥ 15, so a custom scale cannot make an ordinary event deep or hide a deep one.
- **Unicode space substitutes** (`text-normalization.js:3-5`): NBSP, U+2000-200B, U+3000, braille blank U+2800, Hangul fillers
  U+115F/U+1160/U+3164/U+FFA0, BOM -> space, for display text only; ZWJ/ZWNJ kept. The old strip of U+200B-200D from `msg.mes` was
  removed (`social.js:2733-2736`) because it broke emoji ZWJ sequences.
- Portrait style per image profile; the workshop style box is a temporary override, saved only by an explicit "save to profile" that
  refuses when the profile changed (`portrait-ui.js:267-297`).

### P1. Backlog coverage record + review before apply — pattern · memory backlog · partial · value 2 · effort M
Our state: `/so-mem backlog` re-reads the whole chat every time, applies window by window, and has no range choice, no per-message
coverage and no review step (`src/runtime/memorizeBacklog.ts:56-99`, apply per window at `:126-127`). A stopped run leaves partial
memory and a rerun starts again from message 0 (dedup decides what survives). Ownership and stop-on-edit are already better than
VNE's (`beginRun`, `BACKLOG_STOPPED_BY_EDIT` `:21`).
Take: (a) a coverage ring in `extras.memory` keyed by message id + swipe id + revision (we already have revision ids for source spans,
`memory/audience.ts`), so a rerun skips covered windows and an edit re-opens only its window; (b) a preflight line "N windows, M
requests, K already covered" in the existing `PreflightConfirm` (`:57`). Skip VNE's review-every-row step: memory rows have their own
author decisions. Not a new subsystem; fold into the memory backlog owner.

### P2. "Holder sees target as X" self-check for directional fields — test-idea · extraction/wizard · partial · value 2 · effort S
Our rel_ rubric states direction already (`src/engine/validate/life.ts:338` "How much A feels axis toward B"), and `ACT_RULE` names
both sides (`src/extraction/contract.ts:61-62`). Labels are authored (G12 SKIP). Where the wizard drafts `roster[].gossip`, relationship
labels or `leaks_to`, a one-line sentence check in the provisioning prompt ("<holder> sees <target> as <label>") plus one asymmetric
example is cheap. Lands in `src/copilot/agent/prompt.ts` (relationship/label topic). Value is guessed; add only with a wizard golden that
shows an inverted label.

### Not worth taking
- Category-over-magnitude: our steps are typed by quality and `act=`; echoes are authored, not threshold-triggered
  (`src/engine/life/echoes.ts`). Nothing to fix.
- Unicode space normaliser: `foldTerm` NFKC already folds NBSP/U+2000-200A/U+3000 (`src/utils/termPresent.ts:11`); `foldName`
  maps every non-letter to a space (`src/memory/nameFold.ts:28-29`). Residual: U+3164 HANGUL FILLER is `\p{L}` and survives
  `foldName`; U+200B splits a name in two. Value 1; note only.
- Per-profile portrait style: our styles live per story/picture type; the "temporary override vs explicit save" shape is the kit's
  scope chip (`SettingRow`), already the 29 rule.

## 2. BB Enhance Gen (`bb-enhance-gen`)

meta: https://github.com/maxkara14/BB-Enhance-Gen (same author) `pre-refresh-2026-11-08..f27ddd2` (1 commit, 5 files +114/−8) ·
**no licence: ideas only** · read: full diff · prior: none in v3.0 for this repo.

What changed: budget clipping split emoji surrogate pairs, and providers rejected the request ("lone leading surrogate in hex escape").
Fix: `sliceUnicode` drops a lone surrogate at either edge of a clip (`core.js:62-65`); `wellFormedText` replaces orphan surrogates with
U+FFFD on the outgoing copy only (`core.js:67-70`, applied once at `index.js:853`). Tests sweep every budget over an emoji string.

### P3. Surrogate-safe clips + one outgoing repair — pattern · model calls · absent · value 2 · effort S
Our state: no surrogate handling anywhere in `src/` (grep `isWellFormed|toWellFormed|uD800|surrogate`: none). We clip text that goes
to remote models with plain `slice`: `truncate` (`src/utils/string.ts:26`, used by `copilot/agent/ask.ts`, `loop.ts`, `prompt.ts`,
`stagecraft/prompt.ts`), `CARD_TEXT_LIMIT` card reads for the wizard (`src/copilot/agent/readTools.ts:17`), the judge canon clip
(`src/judge/curatorFilter.ts:26`), divergence lines (`src/generation/living/divergence.ts:108`), premise (`src/generation/prompts.ts:16`),
`clipTopic` (`src/copilot/knowledge/topics.ts:23`). Any card or chat with emoji at a clip edge emits a lone surrogate; `JSON.stringify`
escapes it as `\udXXX`, which strict JSON parsers (serde-style, some OpenAI-compatible servers, possibly the opencode bridge) reject.
Sketch: make `truncate` back off one code unit when the cut lands after a high surrogate, route the other clips through it, and repair
the prompt once in `createModelCallVia` (`src/runtime/modelCallCore.ts:78-80`) with a regex (`/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g`
-> U+FFFD). Do NOT use `String.prototype.toWellFormed`: Chrome 111+, our floor is Chrome 89 (`webpack.config.js:8`). Jest: sweep
clip lengths over an emoji string, assert well-formed. Not verified live that any of our routes rejects; the cost of the fix is tiny.

## 3. First Mate (`sillytavern-copilot-p3dra`) — CAUTION

meta: https://github.com/P3DRA/SillyTavern-copilot `pre-refresh-2026-11-08..67312fa` (2 commits, v0.3.0.6, 29 files +5940/−1315) ·
**AGPL-3.0: ideas only** · read: README (new), `host-patches/{README,BASELINE,history-assembly.patch}`, `src/st/macro.js`,
`src/core/injection.js`, `src/schema/{storage-policy,pins,trace-pool}.js` heads, `src/ui/prompt-lab.js` head, `src/core/garbage.js` diff,
`index.js:455-575` (agent input) · skipped: panel UI, provider routing, store/records internals, style.css · prior:
`docs/plans/v2.8/extension-research-2026-10-14/sillytavern-copilot-p3dra.md` (P1-P5).

What changed: renamed "First Mate". Delivery moved from injection to a `{{firstMate}}` macro (empty string when no note, never the
previous note, never the literal token; injection only when the macro is absent, `macro.js:1-60`). Content-addressed prompt pool
(SHA-256 chunks, exact replay that refuses on any missing chunk, conservative GC, `trace-pool.js`). Bounded record history
(`storage-policy.js`). Cross-chat pinned goals in extension settings (`pins.js`). A model-free prompt lab that renders templates against
the current chat and lists used/missing blocks (`prompt-lab.js:1-25`). Output repair: missing/partial `<copilot>` tags repaired instead
of rejected, and a degenerate-repetition detector at char, token, line and tail-unit scale (`garbage.js` diff, thresholds 20/8/3/5).
Agent input is "prompt parity" text: prompt-time regex (with per-message depth) + macros, switchable (`index.js:545-561`). An ST core
patch adds `GENERATION_BEFORE_PROMPT` and `CHAT_COMPLETION_PROMPT_FAILED`.

### P4. Char-run and no-space loops in the degenerate check — anti-pattern guard · extraction · partial · value 2 · effort S
Our state: `detectDegenerate` = a line repeated 4× or a repeated 8-token phrase covering > 50 % (`src/extraction/degenerate.ts:8-43`),
used by `isIncomplete` (`src/extraction/modelRoute.ts:92`), `sharedRead.ts:49`, role calibration. Tokens split on whitespace
(`:20-21`) and need ≥ 32 tokens, so a run with no spaces ("aaaa…", "……", a CJK loop) or a short loop under 32 tokens passes unless the
reply also hit `finish === "length"`. Add their two cheap scales: a 20+ single-character run, and a short unit (≤ 12 chars) repeated
≥ 5× at the tail. Prose false positives ("No. No. No.") stay under those thresholds. Jest cases beside the existing ones.
See Suspected SO defects D1.

### P5. Macro delivery without the "(none)" literal — pattern · macros · partial · value 2 · effort S
Our state: every `{{story_*}}` macro answers a literal placeholder when empty (`src/runtime/macros.ts:47-70`: "(no story)", "(none)",
"(unknown)"), and the `story_memory_*` macros (`:66-67`) repeat text SO already injects. An author who writes `{{story_memory_facts}}`
into a prompt gets "(none)" in a quiet chat, and the facts twice when not. Take: empty string for the prompt-facing memory/epistemic
macros (keep the placeholder for display macros like title), and a Repair `info` row when a preset holds a `{{story_memory_*}}` macro
while the same block is injected. Check first that the per-member secret filter applies to the macro path the same as to the injection
(architecture §Memory: every shared tier per drafted member); if it does not, that is a defect, not an idea. Not verified here.

### Not worth taking
- Prompt-parity agent input (regex the transcript before a read): our evidence quotes and source spans must resolve byte-exact on the
  stored revision (`memory/audience.ts`, witness `SPAN` lines), so a regexed transcript breaks span resolution unless offsets are mapped.
  Our read takes raw `mes` (`src/extraction/chatWindow.ts:7-9`). Revisit only if a session shows a HUD block poisoning reads.
- Content-addressed prompt pool / exact replay: our audits are capped at 20 (`src/runtime/coordinators/extractionCoordinator.ts:290`) and
  payload capture is harness-side; no bloat problem to solve.
- Cross-chat pins, prompt lab, presets, provider routing, direct OpenRouter calls: no SO surface wants them (the wizard has one model
  route by owner decision; authored stories are not user templates).
- The core patch: SO never patches ST except as a last resort (architecture §SillyTavern overrides).

## 4. ProbablyTooManyTabs (`probablytoomanytabs`)

meta: https://github.com/IceFog72/SillyTavern-ProbablyTooManyTabs `pre-refresh-2026-11-08..e7b7f91`
(16 commits, 0.13.5, 49 files +516/−507, mostly a move into `src/`) · **GPL-3.0: ideas only** · read: log, diffstat,
`src/theme/palette-generator.js` (new) · skipped: moved files, layout fixes 010-020 · prior:
`docs/plans/v2.8/extension-research-2026-10-14/probablytoomanytabs.md`.

What changed: a refactor, ten small layout/listener fixes (release rail listeners on rebuild, unobserve a replaced pane, debounce colour
picker saves), and a palette generator: image colours -> OKLCH seed -> surface tones per profile, and every text colour walked toward
white/black until it reaches 7:1 (main) / 4.5:1 (accents) against **every** surface including the alpha-mixed ones
(`palette-generator.js:62-70`, `:79-118`); chroma is reduced instead of channel-clipped when out of gamut (`:46-55`).

### P6. Contrast-driven dim strength for animated backdrops — pattern · 45 backdrops / 29 tokens · planned: plan 45 · value 2 · effort S
Plan 45 has `display.backdrop.dimBehindChat` and "chat readability first" but no rule for how much to dim
(`docs/plans/v3.0/45-animated-backdrops.md:35-45`). Their method fits as a rule, not as a theme rewrite: sample the backdrop's
luminance (one downscaled frame; for loops, the brightest of a few frames), take ST's `--SmartThemeBodyColor`, and raise the scrim alpha
until text vs the mixed scrim reaches 4.5:1. Never recolour ST's theme (we only read `--SmartTheme*`, architecture §UI). Lands where
phase A wires `dimBehindChat` (new `src/components/settings/BackdropControls.tsx`, plan 45 A). Jest over a few luminance values.
Not worth taking: the theme generator itself (ST themes belong to ST/the owner), the tab layout.

## 5. Character Library (`st-characterlibrary`)

`pre-refresh-2026-11-08..d23213c`: README only ("development paused until the standalone release", a Discord link). Nothing for SO.

## Suspected SO defects

- **D1. Degenerate check blind to unspaced loops** — `src/extraction/degenerate.ts:20-22` splits on `\s+` and returns 0 below 32
  tokens, so "aaaa…" ×300 or a CJK loop that ends with `finish: "stop"` is not `isIncomplete` (`src/extraction/modelRoute.ts:92`) and
  reaches the parser. Their side: `sillytavern-copilot-p3dra` `src/core/garbage.js` `detectDegenerateRepetition` (char run `(.)\1{19,}`,
  tail-unit loop). Low impact: the parser then finds no valid lines. Fix is P4.
- **D2. Lone surrogates can reach remote model requests** — `src/utils/string.ts:26` `truncate`, `src/copilot/agent/readTools.ts:17`,
  `src/judge/curatorFilter.ts:26` cut by UTF-16 code unit. Their side: `bb-enhance-gen` `core.js:62-70`, `index.js:853` (they hit a real
  provider error). Unverified on our routes. Fix is P3.

## Host facts (verified in `C:/dev/SillyTavern-MainBranch`, `ad29cbda6`)

- **`setExtensionPrompt`'s `filter` callback is ignored in prompt text.** `getExtensionPrompt` passes an `async` predicate to
  `Array.prototype.filter` (`public/script.js:3302-3316`); a Promise is truthy, so every prompt passes. First Mate's patch fixes it with
  `Promise.all` first. SO passes no filter (`src/services/stHost/extensionPrompts.ts:10,52`), so no bug today; never rely on one.
- **Chat Completion sends a partial prompt when mandatory prompts exceed the budget.** `prepareOpenAIMessages` catches
  `TokenBudgetExceededError`, toasts "Mandatory prompts exceed the context size." and carries on (`public/scripts/openai.js:1588-1606`).
  Our `context-over-server` refusal covers our own requests, not ST's loud CC assembly; a CC-profile chat over budget can silently drop
  story blocks. Our play route is Text Completion, so low priority; worth one line in gotchas.md.
- **Prompt-time regex is reachable**: `getRegexedString(raw, placement, { isPrompt, depth })`
  (`public/scripts/extensions/regex/engine.js:334`), placements at `:281-289`. Any future "what the model saw" probe should use it.

## Security notes

- SECURITY.md: bb-visual-novel-engine, bb-enhance-gen, probablytoomanytabs, st-characterlibrary CLEAR; sillytavern-copilot-p3dra
  CAUTION.
- **First Mate reads ST's OpenRouter key** (`findSecret('api_key_openrouter')`, works only with `allowKeysExposure: true`) and sends it as
  a Bearer to a user-editable `baseUrl`; chat content goes from the browser straight to OpenRouter. It also ships an ST core patch
  (`host-patches/history-assembly.patch`, read: events + budget diagnostics, no network). Nothing proposed above needs a secret, a
  network call or a core patch: P4/P5 are pure, the host facts are notes.
- VNE's history recovery calls the user's configured "fast" generation route and, for portraits, a user-configured cloud image
  endpoint (pre-existing). P1 uses our existing read route only.
- probablytoomanytabs adds `package.json` with `scripts/check.mjs` (`spawnSync node --check`): dev tooling, not run.
- Agent-addressed text: none found in these five diffs. First Mate's code comments quote its user's requests ("user: …"); data, not
  instructions.
