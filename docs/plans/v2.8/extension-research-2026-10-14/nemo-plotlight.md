# Nemo Plotlight — 2026-10-14 harvest
meta: https://github.com/NemoVonNirgend/NemoPlotlight · head `e0c16d4` · **AGPL-3.0 (ideas only, no code)** · read: `lorebooks.js`, `personas.js`, `presets.js`, `api.js` (validators, download, `importAndVerify`), `server-plugin/index.mjs` (skim); skipped `index.js` UI, css, fonts · new repo, no prior review

## What it is / what changed
Browser for the Plotlight public catalogue: search, then one-click import of cards, lorebooks, CC presets and personas into ST.
A small server plugin proxies metadata/images that lack CORS. Interesting part is the import side: every import is
shape-validated before it touches ST, lands under a collision-free name, and is then **read back from disk and compared**;
a mismatch is an error, a failed persona import is rolled back.

## How it works
- Lorebook: `validateLorebook` (api.js:122) plain-object + per-entry type checks; collision-safe name NFC+lowercase with
  `(Plotlight N)` suffix against server list + picker (lorebooks.js:57-66); native `importWorldInfo` on a renamed `File`
  (original bytes kept, :69-71); re-list, `/api/worldinfo/get`, key-sorted JSON compare of `entries` (:72-80).
- Card: `importAndVerify` diffs `characters[].avatar` before/after `processFiles`; exactly one new avatar or error,
  because ST's importer swallows some errors (api.js:354-361).
- Persona: magic-byte image sniff (personas.js:107-113), bounded 30 MB stream read (api.js:200-217), fixed-pattern avatar key,
  upload + check returned `path`, `initPersona(..., {silent})`, `saveSettings`, re-read `/api/settings/get` and compare
  name/description/title AND that `user_avatar` did not change (:167-179); on any failure delete the persona keys, restore
  the active persona, delete the uploaded avatar (:180-189).
- Preset: emits `OAI_PRESET_IMPORT_READY`, then strips connection-binding keys (`settingsToUpdate[k][3]`) so importing a preset
  never repoints the user's API (presets.js:260-263); read-back of `prompts`/`prompt_order` (:269-273); `__proto__` names refused (:251).

## Patterns for SO
### P1. Read back what the wizard created — pattern · wizard/provisioning · partial · value 3 · effort S
What: after a create, identify the created asset from host state (list diff), not from the request, then read it back.
Their evidence: api.js:354-361, lorebooks.js:72-80.
Our state: `createCharacterCard` returns the *requested* `ch_name` and the response avatar, no read-back
(`src/services/stHost/provisioning.ts:40-67`); `applyProvisioning` records `created.name` into the ledger
(`src/runtime/coordinators/copilotCoordinator.ts:133-135`). gotchas.md already says stored names/avatars can differ from
requested. Lorebook create is already list-evidenced (`stHost/worldInfo.ts:169-185`). Persona create checks the list
(`stHost/personaWrites.ts:32-40`).
Fit: no invariant conflict; matches the `WriteResult` rule. Sketch: diff `getCharacters()` avatars around the POST, read the
new card's stored `name`, return `WriteResult` with the stored name; ledger and later `createGroup` use it.

### P2. Rollback a half-created persona — pattern · playerSetup · absent · value 2 · effort S
What: if the post-create check fails, remove what was created. Their evidence: personas.js:180-189.
Our state: `createPersona` returns `couldNot` when the new avatar is not listed, leaves anything created
(`stHost/personaWrites.ts:37-39`); playerSetup records `createdHash`. Low frequency (slash command path); only worth it if
a live run ever shows an orphan persona. Never delete an existing persona (nothing-deleted rule).

### P3. Active-persona guard around persona writes — test-idea · playerSetup · partial · value 2 · effort S
What: assert `user_avatar` is unchanged after creating a persona (`select=false` must hold). Their evidence: personas.js:174-179.
Our state: `/persona-create select=false` trusted (`personaWrites.ts:35`). Add a jest/live assertion; cheap.

## Host facts
- ST's card importer (`processFiles`) can fail without throwing; list diff is the evidence (api.js:354). Not verified in ST source.
- Importing a CC preset through the native path applies connection fields (`settingsToUpdate` index 3); stripping them keeps
  the user's API (presets.js:261-263). SO never writes presets (sampler overlay only), so informational.
- Their comment that `updateWorldInfoList` reuses a cached boot payload (`getCachedSettingsPayload`) does not apply to our
  ST: `world-info.js:2061-2071` fetches `/api/settings/get` fresh and `getCachedSettingsPayload` does not exist here.

## Not worth taking
- Catalogue browsing/import UI: SO has no public-asset import; Adolion installs via its own script.
- Server proxy + rate-limit cooldown: our judge plugin already adapts to 429/`Retry-After`.
- Magic-byte sniff / bounded stream: SO accepts no remote binary uploads today (model downloads have their own path).
