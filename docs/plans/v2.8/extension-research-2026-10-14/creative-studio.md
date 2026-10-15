# SillyTavern Creative Studio — 2026-10-14 harvest

meta: https://github.com/rustyorb/SillyTavern-CreativeStudio · head `26c2a15` (single commit in clone, v0.2.1, targets ST 1.19.0) ·
**AGPL-3.0: ideas only, no code** · read: `docs/ARCHITECTURE.md`, `docs/STATUS.md`, `src/ai/{pipeline,gateway,tasks}.js`,
`src/st/{live,stscript-live,studio-settings}.js`, `src/core/{project,lorebook,regex,stscript,qr,card}.js` (relevant parts) ·
skipped: UI (`src/ui/**`), ComfyUI/sprites (`src/core/comfy.js`, `src/st/comfy.js`), CHARX/PNG, providers panel, tests ·
prior review: none (new repo)

## What it is / what changed
No-build UI extension (Preact+htm). One sentence (or "Surprise me") -> 10-step pipeline: premise, concept, card, 3 alternate
openings, 10-entry lorebook, CC preset, character-scoped regex (with tests), QR set, image prompts, self-critique (+ optional
ComfyUI portrait). Everything lands in a **project** (JSON in `user/files` via `/api/files/upload`), never in ST; writing to
ST is a separate explicit "apply" per artifact, each capturing a backup of what it overwrites. Big lint/simulator layer
mirroring ST semantics (WI activation, regex stages, STscript effects, QR flags, V3 card spec).

## How it works
- Pipeline is pure with injected `runTask` (`src/ai/pipeline.js:249`): steps declare `needs`; a failed dep marks dependents
  `blocked` (`:263`); one auto-retry per step except after a main-connection timeout, since ST cannot abort `generateRaw`
  (`:273-279`); run record persisted per state change, so Resume after reload works (`:251-254`); per-step Retry (`:329`);
  `discardRun` removes every artifact the run created and strips links to them (`:340-360`).
- Missing-field repair: step declares `missing()` (MUST_HAVE description/scenario/first_mes/mes_example, `:17`, `:76`);
  re-ask with `only: still` up to 2 times in fill-only mode, so a repair never overwrites what landed (`:289-312`).
- Gateway (`src/ai/gateway.js:152-258`): always asks raw text (ST turns unparsable JSON into `{}`, `:10`), lenient
  extract + `coerce` + `validate` against a JSON schema, one repair round-trip with the error list; repair kept only if it has
  fewer errors; a failed repair keeps the first usable answer (`:233-247`). Thought-only answer gets its own error text
  (`:252-255`). Timeout scales with max tokens (`:29-31`).
- Prompts are a keyed table the author can edit/reset (`src/ai/tasks.js:14-64`, `promptReader :102`); a shared craft
  block opens every creative task; content level rule appended per task.
- Proposals (review mode): `before` captured at creation, `isProposalStale` = target changed since (`src/core/project.js:253-288`);
  accepting one alternative supersedes siblings on the same target (`:309-312`).
- Live writes (`src/st/live.js`): card apply = `merge-attributes` with `__@@UNSET@@__` for removed keys, then
  `getOneCharacter` + emit `CHARACTER_EDITED`, then read back and diff sent-vs-stored (`fidelityReport :59-65`, `:71-95`);
  WI via `saveWorldInfo`, existence via `getWorldInfoNames` (`:131-157`); every write returns a backup + restore fn.
- Settings self-heal (`src/st/studio-settings.js`): mirror of own settings in a user file; on open, restore keys a stale tab
  wiped; never resurrect a profile deleted on purpose (`:24-56`).
- Lint: WI (`src/core/lorebook.js:122-164`), activation simulator with recursion/delay/groups/budget (`:298+`), regex
  (`src/core/regex.js:158-191`, order-conflict test `:194`, previews in a Worker with 2 s timeout), STscript effect classifier
  (`src/core/stscript.js:6-48`, `analyze :230`) + ST's own parser for syntax (`src/st/stscript-live.js:6-27`), QR (`src/core/qr.js:62`).

## Patterns for SO

### P1. Card-mistake review on every agent-proposed card, not only the tutorial — pattern · wizard/provisioning · partial · value 4 · effort S
What: their `polish` step critiques the generated card (greeting acts for {{user}}, example dialogue shape, contradictions) before
it is used (`pipeline.js:200-227`, prompt `tasks.js:33`). Our code checks already exist but only the Build-a-character tutorial runs
them: `reviewTutorialCard` (`src/copilot/characterTutorial.ts:126`, used only at `src/studio/components/CharacterTutorial.tsx:102`),
with `speaksForPlayer :109`, `exampleBlocksWithoutChar :111`, token budget `:141`. An agent `createCharacterCard` card is validated
for name + description only (`src/wizard/provisioning.ts:93-101`).
Fit: no invariant conflict; findings shown on `ProvisioningCard` as warnings (`blocks` items refuse, like the tutorial). Needs the
"opening cast" bit: derive from the draft's start checkpoint cast instead of the tutorial checkbox.
Sketch: `cardFindings(op, draft, env)` in `wizard/` reusing the tutorial checks; `ProvisioningCard` lists them; also return them to the
agent as the tool observation so it can revise before the author sees the card.

### P2. Lore entry activation preview + key lint on the provisioning card — feature · wizard/lore · partial · value 3 · effort S-M
What: `lintWorld` (`lorebook.js:122-164`): keys under 3 chars, a key shared by >2 entries, AND-ANY secondary keys that look like
synonyms ("move them to primary"; their live run found AI secondary keys stopped entries firing, `docs/STATUS.md` row 1), sticky on
constant. Activation simulator explains why each entry fires/misses (`:298+`). Prompt rules: list every variant (nicknames, plurals),
avoid common words, title 1-5 words (`tasks.js:36-42`).
Ours: `loreEntryShapeProblem` checks shape only (regex keys, logic without secondaries, constant+secondaries, outlet, triggers;
`provisioning.ts:15-35`); runtime already has `keywordWillActivate` (`src/runtime/loreKeyMatch.ts:61`). Wizard prompt covers syntax
only (`src/copilot/prompts.ts:64-71`). No wizard tool previews activation.
Sketch: pure `previewEntryActivation(op, texts)` over `matchKey` against the draft's own text (checkpoint objectives, briefing,
first messages); card line "fires on: …" / "no story text mentions any key"; warn-only lint for short/shared keys. Wording in our own words.

### P3. Stale-tab settings overwrite of the library, wizard sessions and settings — host-fact/pattern · persistence · partial · value 4 · effort M
What: ST `/api/settings/save` writes the whole `settings.json` from the client body (`C:/dev/SillyTavern-MainBranch/src/endpoints/settings.js:206-216`),
so the tab that saves last wins; their testing saw a stale tab roll back extension settings and CM profiles; they mirror their
own slice to a user file and heal on open, with a rule that a deliberate deletion is not resurrected (`studio-settings.js:24-56`).
Ours: story library (`v2Stories`), `wizardSessions` and install settings all live in extension settings
(`src/runtime/storyLibrary.ts:99-101`, `src/runtime/settingsStore.ts:37`). `librarySave.ts:4-20` confirms a save landed at save
time, but nothing detects a later revert by another page (owner browser + the 9222 CDP page on the same ST = two writers; memory
"shared ST browser collisions" already saw the library eaten).
Fit: detection first, never silent restore (one check registry, no toasts; "nothing deleted from owner's ST data" is honoured).
Sketch: library mirror in `user/files/so-library.json` (new `stHost/` module, `WriteResult`); on start compare ids+hashes; a record in
the mirror but not in settings = `degrades` check "library record lost to another tab" with Restore / Forget buttons.

### P4. Proposal staleness (`before` captured at proposal) — pattern · Studio review · partial (unverified) · value 3 · effort S
What: `createProposal` stores `before`; `isProposalStale` compares to current (`project.js:253-288`); sibling alternatives superseded on accept.
Ours: lore provisioning shows before/after (`ExistingEntry`, `src/wizard/types.ts:62-67`), but I found no `before` on draft edit
proposals (`grep before src/copilot/types.ts` = none), so a review-mode card the author already overrode by hand may apply over it.
Verify in the accept path before building. Sketch: stamp the target path's value hash on each pending op; accept refuses
"changed since proposed — re-ask" when it differs.

### P5. Targeted missing-field re-ask + keep-the-better-answer repair — pattern · wizard/model calls · partial · value 2 · effort S
What: re-ask only for still-empty required fields, fill-only so nothing written is replaced (`pipeline.js:289-312`); schema repair
round-trip kept only when it has fewer errors, failed repair keeps the first answer (`gateway.js:222-248`).
Ours: agent loop refuses malformed calls and repeats (`REPEAT_LIMIT`, `src/copilot/agent/loop.ts:211`); stage authoring re-asks on
cut-off JSON (`src/copilot/authoring.ts:26`). Gap only for stage outputs with partially empty required fields. Low priority.

### P6. Post-create read-back of the stored card — pattern · stHost · absent · value 2 · effort S
What: after import/apply they read the character back and diff sent vs stored, reporting lossy fields (`live.js:59-65`, `:93-94`).
Ours: `createCharacterCard` returns `name: body.ch_name` and the avatar text, no read-back (`src/services/stHost/provisioning.ts:39-66`);
gotchas already know `/api/characters/create` coerces fields and stored names can differ. Sketch: `/api/characters/get` on the
returned avatar, compare the six authored fields + name, answer `WriteResult` with `lossy: [...]`.

### P7. Craft lines for the wizard prompt — idea · copilot prompts · absent · value 2 · effort S
Their shared craft block (`tasks.js:15-21`): stock-phrase blacklist, never write {{user}}'s actions in greetings/examples, there is no
`{{system}}` macro in mes_example (their live run found the model writing one), behaviours over adjectives. Our prompts carry none of
these (`grep -i "system}}\|stock phrase" src/copilot` = none); the tutorial `why` lines cover only greeting rules
(`characterTutorial.ts:54-59`). Write our own wording (AGPL).

## Host facts
- `/api/settings/save` overwrites the whole settings file from the request body; last writer wins (settings.js:206-216). See P3.
- `merge-attributes` deletes a key whose value is `__@@UNSET@@__` (`src/endpoints/characters.js:1243-1258`). Useful if we ever edit cards (we do not: create-only).
- `generateRaw` with `jsonSchema` returns `{}` for unparsable JSON unless `returnInvalid: true` (`public/script.js:4103`, `:4266`, `extractJsonFromData :6311`). SO does not use `jsonSchema` today (no hits in `src/`).
- Quick Reply sets: `/api/quick-replies/save` needs a reload; live install via `quickReplyApi.settingsUi.importSingleQrSet(file)`
  (`public/scripts/extensions/quick-reply/src/ui/SettingsUi.js:432`). A QR message runs as STscript only if its first char is `/` (their note, `stscript.js:283-295`; not re-verified).
- `SlashCommandParser.parse(text, true, null)` parses without executing (their `stscript-live.js:6-27`; not re-verified here).
- CM `sendRequest(profileId, msgs, max, {extractData:false, signal}, {json_schema:{name,value,strict:false}})` passes a schema on CC profiles (`gateway.js:179-186`).
- No SO bug found from this code.

## Not worth taking
- Regex / QR / preset generation: SO stories need none; thought leaks are handled in code (`runtime/thoughtLeak.ts`); a generated preset would be an install write (we use a per-request overlay).
- STscript effect classifier: only useful if the wizard ever writes QRs.
- Provider-key setup (`src/st/providers.js` `storeKey`): writes ST secrets, conflicts with the never-touch-secrets rule.
- Hands-free mode writing AI output straight in: our `auto-draft` already does this for draft edits; provisioning stays author-confirmed.
- `discardRun` deleting created ST assets: deletes from the owner's install; harness cleanup (`so-assets.mts`) already covers tests.
- ComfyUI portrait/sprite pipeline: `src/sprites/` + `src/image/` are further along.
- Project files in `user/files`: our story record + library is the project. Content-level prompt switches: one user, not needed.
- Alternate greetings (`provisioning.ts:60` hard-codes `[]`): group stories give greetings only to the opening cast; low value.
