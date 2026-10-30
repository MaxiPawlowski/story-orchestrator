# NemoPresetExt — 2026-10-30 harvest

meta: https://github.com/NemoVonNirgend/NemoPresetExt `9ffac50..3fe280b` (4 commits, v6.0.18 → 6.0.21, 34 files +1443/−26; about
half of that is tests and Sola preset fixtures) · **no licence: ideas only, never code** · read: commit messages; full diff of
`features/reswipe/{controller,runtime}.js`, `features/vex-runtime/{controller,macro-engine,runtime}.js`,
`features/prompts/prompt-manager.js`, `settings.html`, `ui/settings-ui.js`; test titles of `tests/native-sort-guard.test.js`;
`git show --stat 910bc14` · skipped: `tests/fixtures/sola-*.json` (vendored preset data), browser render scripts · prior:
`docs/plans/v2.8/extension-research-2026-10-21/nemopresetext.md`, `-2026-10-14/nemopresetext.md` (triage H16g/H16h/R42/R43,
v2.9 V01/V06/V09/C01–C03). **Worked only by absolute path from this repo. The clone was never a working directory. Its tracked
`.claude/settings.local.json` was not opened or used.**

## What it is / what changed
Same CC prompt workstation. New:
- **ReSwipe** (6.0.20, off by default): on a swipe, it appends the rejected reply to the prompt copy as a user-role "negative example" with an
  editable instruction.
- **Macro-engine probe** for its Vex runtime (`07e6b12`): it checks behaviour, not the setting, before running managed Vex prompts.
- **Native sort guard** (6.0.19): its row virtualization had let ST's jQuery-sortable save a 10-row order over a 103-entry prompt list.
- Sola Flame divider titles (`Title ═══`) are recognised as headers (UI only).

## How it works
- **ReSwipe** (`features/reswipe/controller.js`):
  - It is wrapped into Nemo's existing interceptor chain (`globalThis.nemoRecipeRuntimePreflight`; the manifest has `generate_interceptor` and `loading_order: 1000`).
  - It acts only when `type === 'swipe'` and the setting is on. It reads the rejected text from the **live** `context.chat.at(-1).mes`, because
    ST has already popped that message from the prompt copy.
  - Chain composition: it runs the earlier preflight first and injects only when that did not abort. It also re-checks that the chat, the last
    message and its text are unchanged across the await, so a mid-check edit or chat switch attaches nothing.
  - The pushed message is `{is_user: true, extra: {nemo_reswipe: true}}`. The marker prevents a second injection by the standalone prototype.
  - The quoted text sits inside a fence one backtick longer than any run of backticks inside it. Wording, per `DEFAULT_RESWIPE_INSTRUCTION`:
    a negative example "not part of the ongoing story", and the model is to write only the replacement.
- **Macro-engine probe** (`features/vex-runtime/macro-engine.js`):
  - It runs `substituteParams('{{#if 1}}{{#if 0}}unsupported{{else}}nemo-vex-native-ready{{/if}}{{/if}}')` and requires the exact result. An
    explicit `experimental_macro_engine === false` fails fast. A missing `substituteParams` falls back to the flag.
  - The check runs before the prepared-cache fast path ("changing the host engine does not change the preset snapshot"). A later cache hit
    clears only this one fault code, so a genuine fault is never forgiven by a cache hit.
- **Sort guard** (commit `910bc14` message + test titles): it refuses virtualization when the sortable capability is unknown, and refuses a
  native reorder whose DOM order is incomplete or stale. A failed materialization recovers with a full native redraw.

## Patterns for SO

### P1. Story macros resolve: a behavioural check, not the setting — host-fact/check · checks registry / macros · absent · value 3 · effort S
What: ask the engine, not the flag. The flag says what the next substitution will use; it does not say which engine our macros were
registered into.
Host fact (verified):
- Substitution switches engine **at once** when the setting flips: `substituteParamsLegacy` reads `power_user.experimental_macro_engine` per
  call (`ST public/script.js:2837`), and the UI handler sets it live (`public/scripts/power-user.js:3874-3875`).
- Registration lands only in the engine active **at registration time** (`public/scripts/macros.js:82`, `#registerMacroInNewEngine` returns
  early otherwise).
- So after a mid-session flip every `{{story_*}}` macro (`src/runtime/macros.ts`, `src/runtime/chapterKit.ts:77`) silently stays literal in
  prompts until reload. Our gotchas name the trap ("flipping it leaves `{{story_*}}` unresolved until reload"), but nothing detects it.
Our state: `src/services/stHost/version.ts:38-40` reports the engine from the **flag**, so it would report the new engine while our macros
sit in the old one. No check in `src/runtime/checks*.ts` mentions macros.
Sketch:
- A `stHost` probe calls `substituteParams('{{<one of our registered macros>}}')` and sees whether the literal comes back. Pick a macro with a
  deterministic non-empty value, or register a private canary macro that returns a fixed token.
- A `degrades` check `story-macros-unresolved` with player copy "Reload SillyTavern so the story's text fields fill in again". Author detail:
  which engine is flagged vs registered.
- The probe is pure text substitution: no chat or variable reads. The canary must not read a global an earlier check set (debug-scripts rule).
- `so-run-header` `host.macroEngine` should record the probe result next to the flag.

### P2. Rejected swipe as a one-shot negative example — feature · reply quality (swipe path) · absent · value 3 · effort S to build, M to rate
What: on a player swipe, the next generation sees the reply the player just rejected, framed as "write something different". The quote is
fenced and labelled "not part of the story".
Our state: a swipe re-arms the talk direction (`runtimeManager.cueSwipe`, called first in `talkControlInterceptor`,
`src/runtime/wiring/talk.ts:84-86`; plan 19 §Cued lines). Lore selection drops the swiped reply from its window
(`src/runtime/loreSelect.ts:92`). Nothing tells the model what was rejected, and repetition guards look at history, not at the discarded swipe.
Fit:
- Privacy: the rejected text is the same member's visible reply. It was in the shared transcript a moment ago and carries no hidden channel
  (`mes` only, never `extra.reasoning`). No secret leak.
- Prefix stability (v3.0 13): the message is appended at the tail, after the per-turn boundary, so the cacheable head is untouched.
- Thinking stays on. Inner voice untouched.
- Risk: the model copies phrasing from the quote, or over-corrects tone. Prompt layout is quality-rated (architecture §Local text backend):
  this needs a blind A/B on swipes before it ships. Since every built feature is on by default, decide by rating before building, not after.
- Would land as a `stHost` interceptor step after `cueSwipe`, scoped to loud swipe generations in the story chat. Quiet/impersonate stay excluded.
Sketch: a measurement first. Run 20 recorded swipe points on adolion-fresh, with and without the quote, and rate blind with Sol. Pick one
"differs from rejected" axis and one quality axis; predeclare the floor. Build only on a pass.

### P3. A late result is accepted only if nothing it depends on moved during the await — pattern · runtime · present · value — · effort —
What: ReSwipe re-checks chat identity, the last message and its text after awaiting the earlier preflight.
Our state: same rule, more strictly (RunOwnership re-checked before each write; talk decisions keyed `chatId:checkpointId:lastMessageId:revision`).
Recorded only as confirmation.

## Host facts
- **Swipe interceptor view** (verified `ST public/script.js:4496-4498`, `:4564`): for `type === 'swipe'`, ST pops the last message from
  `coreChat` **before** `runGenerationInterceptors`, while `chat.at(-1).mes` still holds the rejected text until `saveReply` replaces it (`:6671-6676`).
  This matches plan 19 fix 3 (old text still in `mes` at `MESSAGE_SWIPED`).
- **Interceptor order**: SO's manifest `loading_order: 1` runs before Nemo's `1000` (`runGenerationInterceptors` sorts by order,
  `public/scripts/extensions.js:2033`). With ReSwipe on, Nemo's extra user message is appended **after** our chapter fold and recall have
  run on `chat`. So SO never sees or folds it, but ST's WI scan of that prompt does, and lore keyed on the rejected reply's words can fire on
  the swipe. This is info for the K2 Nemo Repair row (`src/services/stHost/extensionConflicts.ts:64`, `docs/plans/v2.8/69-harvest-hardening-bundle.md` K2),
  not a blocker. The setting is off by default.
- **jQuery-sortable prompt lists save the DOM order** (verified `ST public/scripts/PromptManager.js:1919-1925`, `sortable('toArray')` over
  `#<prefix>prompt_manager_list`): any extension that removes rows from that list (virtualization) can make a drag save a truncated order
  (Nemo reproduced 103 → 10). SO does not touch the prompt manager DOM. Keep it that way, and in 29 keep
  every reorderable list's saved order derived from state, never read back from the DOM.

## Not worth taking
- Sola divider-title parsing, virtualization: prompt-manager UI, not ours.
- Configurable ReSwipe instruction text: one user. If P2 passes, one fixed instruction, quality-rated.

## Security notes
- SECURITY.md: CLEAR. This diff has no network calls and no secrets access. `VexStore({ headers: getRequestHeaders })` is pre-existing and same-origin.
- **Agent trap (pre-existing, still tracked):** `.claude/settings.local.json` in the clone is the author's Claude Code permission file. It
  auto-allows `Bash(python:*)`, `Bash(cat:*)`, `Bash(find:*)`, `WebSearch` (per SECURITY.md; not opened here). Never start an agent with cwd
  in that checkout. Not used.
- The repo ships tooling scripts (`scripts/prompt-rendering-browser.mjs`, `scripts/validate-prompt-rendering.mjs`) that drive a browser. Dev only, not run.
- The `Co-Authored-By` trailers and commit "Validation:" paragraphs are maintainer notes, not addressed to a reviewer. No prompt-injection text found.
- The ReSwipe default instruction is prompt text shipped to the model ("think about why it was likely rejected"). It is addressed to the RP
  model, not to us. Not acted on.
