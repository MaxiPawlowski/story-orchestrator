# SillyTavern Character Hub Search (CHUB Search) — v2.4 review

author city_unit · repo https://github.com/city-unit/SillyTavern-Chub-Search · commit `8c699cc` (2025-12-14) · 73 upvotes / 101 msgs · source available: y (`source/index.js` 543 lines, `style.css`, `manifest.json`)

## What it is
Browse-and-import UI for chub.ai cards inside ST. A bolt button next to ST's "Import from URL" opens a wide popup: text search, include/exclude tags, sort, NSFW, paging, thumbnail grid, per-card download button. Download goes through ST's own content importer. No LLM, no chat hooks, no prompt injection, no events. Pure asset-acquisition utility.

## How it works
- Entry: `jQuery` ready block inserts `#search-chub` after `#external_import_button` (`index.js:537`), click → `displayCharactersInListViewPopup` (`index.js:287`).
- Host imports: static `import { getRequestHeaders, processDroppedFiles, callPopup } from "../../../../script.js"` (`index.js:3-7`), `extension_settings` (`index.js:9`). `callPopup` is `@deprecated` in ST (`public/script.js:9066`).
- Search: browser `fetch` straight to `https://api.chub.ai/api/characters/search?...` (`index.js:152,169`) — no ST proxy, no error handling (`searchData.nodes` read unchecked, `index.js:171-176`). Tags joined and truncated to 100 chars (`index.js:155-167`).
- Thumbnails: for EVERY result it POSTs `api.chub.ai/api/characters/download` for the full tavern card PNG, falls back to `avatars.charhub.io/.../avatar.webp` (`index.js:179-180,495-525`) — N+1 full downloads per page, `Promise.all` so one throw kills the page.
- Import: POST `/api/content/importURL` with the chub path, fallback `/import_custom` (legacy route, no longer in ST server), read `X-Custom-Content-Type` + `Content-Disposition`, wrap blob as `File`, `processDroppedFiles([file])` (`index.js:58-96`). Only `character` handled; lorebook type → "Unknown content type".
- Rendering: template strings with remote `name`/`tagline`/`topics` interpolated into `innerHTML` unescaped (`index.js:104,252-267,316-358`).
- Persistence: `extension_settings.chub = {findCount, nsfw}` defaults (`index.js:36-51`), never saved, no settings UI. Popup DOM cached in `savedPopupContent` and re-appended (`index.js:288-298`).
- Mutation handling / swipes / groups / multi-model: n/a.
- Leak: a document-level click listener is added on every popup open (`index.js:398`).

## Overlap with Story Orchestrator
- Asset acquisition: we CREATE assets (wizard provisioning: `src/services/stHost/provisioning.ts:40` `createCharacterCard`, `:83` `createGroup`; `src/services/stHost/worldInfo.ts:136` `createLorebook`), never import. Zero hits for `importURL|importFromExternalUrl|processDroppedFiles|getCharacterSource|chub` in `src/`.
- Requirements: `StoryRequirements {personas?, members?, lorebooks?}` are bare names (`src/engine/schema.ts:221`); Repair says "missing" and offers the wizard (create) only (`src/runtime/repair.ts:36-55`). No way to say WHERE a required card/book comes from.
- Popups: we already do it better — content passed as DOM nodes, escaped (`src/services/stHost/popup.ts:36`), `callGenericPopup`, not deprecated `callPopup`.

## Ideas for v2.4

| # | idea | kind | our area | our state | value | effort |
|---|---|---|---|---|---|---|
| 1 | Requirement provenance + Repair "Import from source" via `ctx.importFromExternalUrl` | host-integration | wizard / repair / studio | absent | 3 | M |
| 2 | Capture `ctx.getCharacterSource(chId)` when a member enters roster/requirements | enhancement | studio / wizard | absent | 2 | S |
| 3 | Never interpolate remote/LLM strings into HTML | anti-pattern | player-ui | present | 1 | S |

**1. Requirement provenance + import-from-source.** What: optional `source` per requirement (e.g. `members: [{name, source: "https://chub.ai/characters/x/y"}]`, lorebooks likewise); Repair's cast/lore step gains "Import from source" that calls ST's own importer, then re-reads evidence (character list / `world_names`) and adds nothing to the story (requirement goes green from evidence, same as provisioning). Makes shared stories (Adolion hubs, community cards) installable on another box. Their evidence: whole import path `index.js:58-96`. Our evidence: requirements are names only (`schema.ts:221`), Repair has no import branch (`repair.ts:36-55`), `importFromExternalUrl` unused. Fit: create-only holds (import never overwrites; check existence first — `hasCaseInsensitive` in `src/runtime/requirements.ts:19`); needs a new `stHost/` seam (inv. 2); the host call returns `void` and reports failure only by toast (ST `utils.js:3017-3020`), so the seam must answer a typed `WriteResult` from a before/after diff, not the promise (inv. 16/17); import name may differ from requested (known card-name gotcha) → match by returned file/`getCharacterSource`; schema change = format-2 normalization with string alias kept. Personas: never (inv. 8). Import refused while generating (ST `script.js:10531`). Domain whitelist is server config (`whitelistImportDomains`, content-manager.js:1051-1057) — non-chub/non-listed hosts 404.

**2. Capture source on roster add.** What: when Studio/wizard adds an existing card to roster/requirements, record `getCharacterSource` so export carries it (feeds idea 1). Their evidence: indirect (they build chub URLs by hand, `index.js:258`). ST derives it from `data.extensions.chub.full_path`, pygmalion, github, `source_url`, risu, perchance (`public/script.js:1247-1290`). Our evidence: no hits. Fit: authored content in the story record (inv. 13); read-only host access. S.

**3. Anti-pattern (already avoided).** Remote strings into `innerHTML` unescaped = XSS on any hostile card name. We pass DOM nodes (`popup.ts:36`, `storyUpdate.ts:46`). Keep it that way for any future import UI (idea 1 would display remote names).

## Patterns to copy / anti-patterns to avoid
- Copy: reuse ST's importer end to end rather than re-parsing cards; ST now exposes it on the context (`st-context.js:234` `importFromExternalUrl`), which also handles lorebooks (`utils.js:3038`) — this extension predates that and re-implements a subset.
- Avoid: static `../../../../script.js` imports (path-depth coupling; we use `importSTModule` + context); deprecated `callPopup`; N+1 full-card downloads for thumbnails; `Promise.all` with no per-item failure; unchecked JSON shape from remote API; listener added per open; defaults never saved; dead fallback route (`/import_custom`).

## ST host facts learned
- `/api/content/importURL` dispatches by host (chub, janitor, pygmalion, AICC, risu, perchance, whitelisted generic) and returns the file + `X-Custom-Content-Type: character|lorebook` + `Content-Disposition` (`src/endpoints/content-manager.js:978-1068`); non-whitelisted host → 404 (`:1051-1057`). `/api/content/importUUID` takes a bare id (`:1071`).
- `ctx.importFromExternalUrl(url, {preserveFileName})` = client wrapper: URL → importURL, else importUUID; `character` → `processDroppedFiles`, `lorebook` → `importWorldInfo`; failure = toast + `return` (void) (`public/scripts/utils.js:2998-3046`; exposed `st-context.js:234`). Not evidence of success — pairs with our "return value is not evidence" rule.
- `processDroppedFiles` imports, imports tags, then `selectImportedChar` → switches right panel to the character list and flashes the card, does not open a chat (`public/script.js:10461-10500`, `:10514`, `:8682`).
- `importCharacter` throws while a (group) generation is running (`public/script.js:10531-10533`).
- `ctx.getCharacterSource(chId)` returns a canonical source URL from card extensions or `''` (`public/script.js:1247`, `st-context.js:233`).
- `callPopup` is deprecated in favour of `callGenericPopup` (`public/script.js:9066`).
- `/import_custom` (used as fallback, `index.js:69`) no longer exists in ST server — no route found under `src/endpoints`.
- No contradictions with our gotchas. Consistent with "api.chub.ai 403s curl UA" memory: they call it from the browser.

## Verdict
Relevance low. Pure card-browser utility; nothing for engine, memory, extraction or play. The one thing worth taking: ST's own `importFromExternalUrl` + `getCharacterSource` as the seam for **requirement provenance → Repair "Import from source"**, so a shared story can fetch the community cards/lorebooks it names instead of only offering to create new ones.
