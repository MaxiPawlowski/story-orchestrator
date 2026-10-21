# NemoPresetExt — 2026-10-21 harvest

meta: https://github.com/NemoVonNirgend/NemoPresetExt · `pre-refresh-2026-10-21` (v6.0.12) .. `9ffac50` (2026-10-16, v6.0.17), 5 commits, 58 files, +94.7k/−11.5k · **no licence file** (ideas only, never code) · read: log, diff of all code/docs (`features/preset-installer/*`, `features/preset-index/discovery.js`, `core/runtime-loader.js`, `features/vex-runtime/program-shape.js`, `features/cold-prompts/controller.js`, `docs/ADAPTIVE_PRESET_INDEX.md`, README, `NEMO_ENGINE_SETUP.md`); scripted scan of `assets/nemo-engine/v12.1-standard.json` (regex_scripts placement/flags, prompt names, 5 prompt bodies) · **skipped as vendored data**: `assets/nemo-engine/*` (≈94k of the +94.7k lines: four Nemo Engine v12.1 preset exports, the two "full" editions split into `.part-NN` files), tests, CSS · prior: `docs/plans/v2.8/extension-research-2026-10-14/nemopresetext.md` (its P1/P2/P4 are triage H16g/H16h/R42 → plan 69 K4/K2; P3 = R77 fixed; P5 = R43 SKIP). Nothing here changes those verdicts.

Paths: Nemo relative to its `source/`; `SO:` = `C:/dev/story-orchestrator/`; `ST:` = `C:/dev/SillyTavern-MainBranch/`.

## What it is / what changed
Still a CC prompt workstation. New code is all about installing/importing the author's own Nemo Engine preset:
- 6.0.13/6.0.14: bundles four v12.1 editions; one-click "Import & Process" verifies sha256 over the exact bytes, checks prompt/regex counts against a catalog, imports as a numbered copy (never overwrites), awaits ST's `selectPreset`.
- 6.0.15: "adaptive index" discovers selectors by the variables they set, not by prompt id/name; unfamiliar layout imports unchanged in "native mode" with a warning instead of failing.
- 6.0.16/6.0.17: inert loader placeholders compared modulo comments/whitespace/`{{trim}}`; executable controls and stored hashes stay strict.
**Prose/post-processing: the extension code ships none.** The bundled preset (data) carries prompt-time craft (Anti-Slop, Anti-Repetition, Voice Crafting with a "swap test", Exact Draft self-review inside the reasoning) plus 493 preset-scoped regex scripts, nearly all display-only renderers or prompt-only strippers. **Per-character: only in preset prompts** (per-speaker "Voice rows", per-owner hidden interiority blocks, a per-character "Mental Projection" tracker). The extension stores no per-character config.

## How it works
- **Verified install transaction** (`features/preset-installer/controller.js:90-131`): load → `OAI_PRESET_IMPORT_READY` processing → `JSON.stringify` *before* fetch so serialization barriers fire even when a listener's throw was swallowed (`:111-113`) → save → register → `await selectPreset` → record `{id, sha256, version}`. One install in flight; a second different edition is refused (`:95-98`). Integrity: concatenated parts hashed and counts compared to catalog (`presets.js:68-86`).
- **Structural discovery** (`features/preset-index/discovery.js:38-90`): walks the saved prompt order, groups by `=== X ===` / `<Sub>` headings, recognises a selector by `{{setvar::NCGenreId::…}}` etc. Read-only; never renames.
- **Soft fail on unknown shape** (`features/cold-prompts/controller.js:265-270`): validation failure on a not-yet-optimized import → warning + original import; on an already-referenced (shell) preset → still blocks.
- **Preset regex layer (data)**: of 493 scripts, 475 `markdownOnly` (display renderers: tracker cards, meters, scene headers, emoji FX, hidden-interiority strip), 12 `promptOnly` (strip older trackers/plans/workbench from context, keep the newest), 3 both, 3 neither (raw-output edits, all disabled). 402 belong to "Mental Projection", a per-character `<mental_state>` block the model writes and regex renders as a dashboard.
- **Voice Crafting prompt (data)**: per speaker, read definition + dialogue history + "Voice row"; record register/cadence/address habits "only when established… do not invent a trait to complete a row"; write a sample line for a real beat and apply a swap test; name and fix "Uniform Interiority" (every voice analysing feelings the same way). Register labels: announcer/withholder/qualifier/processor/deflector.
- **Exact Draft (data)**: inside the planning boundary, `DRAFT_1` → one critique ("ATTACK") → `FINAL_DRAFT` → verbatim publication; a `promptOnly`+`markdownOnly` regex removes the review block from display and context.
- **Hidden interiority (data)**: private passages wrapped `<nemo-interiority character="X">`, hidden on display, **kept in context**; rule: the displayed story must stay coherent after removal and nobody may react to unavailable private information.

## Patterns for SO

### P1. Per-member voice record + swap test as the validator's question — feature · per-character polish / roster · absent · value 4 · effort M
What: a short authored voice record per speaker (register, cadence, address habits, established tics, standing avoid) used both as drafting guidance and as the check "could another present member have said this line?". Their evidence: preset prompt `CraftVoiceProcedure` (in `🔧 Init · Narrator, world and craft defaults`, standard edition). Prompt-time only there; no post-pass, no model call of its own.
Ours: `RosterMember` has `role`, `drive`, `view`, mood, agenda, relationships, no voice (`SO: src/engine/schema.ts:326-339`). Triage R40 (`61-harvest-triage-2026-10-14.md:258`) skipped *ambient* per-roster voice (Dooms); this one is different: dialogue distinctness for drafted members.
Fit: lands in the drafted member's private block (per-member, like life lines); no invariant conflict. Two takeable rules: (a) "record only when established, leave unknown fields empty" is the right guard for a wizard/extraction-filled voice record (never invent traits); (b) the swap test is a cheap, typed judge question ("which present member most likely said this line: A/B/C/unclear") that flags drift without rewriting, so the judge stays read-only. Sketch: optional `roster[].voice {register?, cadence?, address?, lexicon?[], avoid?[]}`, validated, guide topic; judge use `voice-swap` (flag only) feeding the per-character polish pass when that exists. Calibrate before routing.

### P2. In-reasoning draft → one critique → final as the zero-extra-call polish — pattern · generation · absent · value 2 · effort S
What: the polish happens inside the model's own thinking; one critique round, no second review, the published copy is verbatim the final draft. Their evidence: preset `🐦‍⬛ Draft Style: Exact Draft + Vex Attack`.
Ours: thinking on with a llama.cpp reply budget (`SO: src/runtime/replyEffort*.ts`); owner's rated budget ≈400 tokens, far too small for two full drafts. Fit: keeps thinking on (owner wants it). Cost is reply latency × ~3 on the 3090. Only worth an A/B if the per-character polish post-pass proves too slow; record as the alternative design, not a build.

### P3. Display-only renderer / context-only stripper split for model-emitted machinery — pattern · prompt hygiene · partial · value 2 · effort S
What: anything the model writes for the UI (trackers) is rendered display-only and stripped from older context, newest kept. Their evidence: preset regex `Tracker UI - Strip Compact Trackers from Older Context` (`promptOnly`), renderers `markdownOnly`.
Ours: SO never asks the model to emit machinery (inline timeline renders DOM, `stHost/inlineMount.ts`); extraction's cleaned form already notes prompt-only regex is not mirrored (`SO: src/extraction/windowHygiene.ts:11`, triage V1/R7 → 35 G9). Use: Nemo-preset players are a ready G9 fixture (15 prompt-only scripts that remove tagged blocks from context while the stored text keeps them, so our read sees text the model never saw). Fold into 35 G9; no new row.

### P4. Hidden interiority kept in shared context — anti-pattern for SO · memory/privacy
Their hidden `<nemo-interiority>` blocks are display-hidden but stay in the prompt. In an SO group every drafted member reads the shared transcript, so a member's private thought would reach every other member: the same hole the held-secret invariant closes. Their coherence rule ("no one reacts to unavailable private information") is sound; the mechanism is not. SO's carried thought (plan 54) stays in `extra.reasoning`/private block; keep it that way. If the per-character polish ever adds interiority to visible text, it must be display-only *and* prompt-stripped, never context-kept.

### P5. Verified bundled install: hash exact bytes, count check, numbered copy, await select — pattern · install tooling · partial · value 1 · effort S
Their evidence: `features/preset-installer/presets.js:68-86`, `controller.js:100-124`. Ours: `adolion-fresh` pins and reads back the preset overlay (`.claude/rules/debug-scripts.md` §Lanes). Only difference worth noting: "never overwrite an existing preset, import a numbered copy" because the old one may hold user edits. Note for any future in-app story/preset installer; no row.

## For per-character polish
- **Mechanism**: none in extension code. In the preset, polish is prompt-time (voice procedure, anti-repetition, anti-slop) plus optional in-reasoning self-review (P2). No post-generation rewrite of reply text: all 3 regex scripts that would edit stored output are disabled; the rest are display-only or prompt-only.
- **Safety against added facts / player actions**: prompt-level rules only, e.g. "do not invent a trait to complete a row", draft inventory of "concrete commitments" (NPC appearances, lines, scene changes) that repairs must preserve; nothing enforced in code. The commitment inventory is a usable spec for our polish validator: a rewrite must keep exactly the source reply's commitments (who acts, who speaks, what changes), add none, and never write `{{user}}`'s actions.
- **Cost**: zero extra calls; tokens inside the one reply (large for Exact Draft).
- **Swipes/edits/streaming**: regex display renderers re-run on every render, so swipes and edits are free; a "streaming tracker shell / awaiting fence closure" renderer runs first so half-streamed blocks do not render broken. No stored-text change, so no swipe-sync problem (contrast Recast, triage R4/R6).
- **Per-character config kept**: "Voice rows" live in whatever continuity system the preset uses (model-maintained), not in the extension. Host fact below: ST itself already offers card-scoped regex, a no-model per-character display layer (e.g. a member's banned phrasing shown differently), but it edits display or prompt only, never meaning, so it is a lexicon tool, not a voice tool.

## Host facts
- Regex scripts have three scopes: global, character (`card.data.extensions.regex_scripts`) and preset (`readPresetExtensionField({path:'regex_scripts'})`); character and preset scripts run only when allow-listed in `extension_settings.character_allowed_regex` / `preset_allowed_regex[api]` (`ST: public/scripts/extensions/regex/engine.js:108-131`, `:219-235`). A CC preset can therefore bring hundreds of display/prompt regexes with it, active only while it is selected and allowed.
- `presetManager.selectPreset(value)` is async and awaited by ST's own `/preset` path (`ST: public/scripts/preset-manager.js:415`, `:948`); `OAI_PRESET_IMPORT_READY` is emitted by ST's import before save (`ST: public/scripts/openai.js:4815`), and an extension can emit it itself to reuse other extensions' import processing.
- No SO bug found from this round.

## Not worth taking
- Adaptive preset index / structural fingerprints: Nemo-preset grammar specific.
- Loader placeholder normalization: Nemo sidecar-specific; our `{{// so:*}}` markers are matched at the write edge already.
- Mental Projection tracker as model-emitted markup: costs reply tokens and needs 400 regexes to render; SO's state is code-owned and rendered by components (widgets, HUD).
- Braille-space editions: authoring quirk (prior review).
- Bundled 30 MB presets split into parts: distribution workaround.
