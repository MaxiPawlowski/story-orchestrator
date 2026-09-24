# ST CharacterLibrary — v2.4 review

Author Reaper (manifest says "Anonymous") · repo https://github.com/Sillyanonymous/SillyTavern-CharacterLibrary · commit `5c99e79` 2026-09-02 (manifest 7.2.2) · 184 upvotes / 4970 msgs · source available: **y** (`source/`, ~110 JS/CSS files, no tests)

## What it is
Standalone character-library manager. Opens `app/library.html` in a new tab or as an iframe overlay inside ST, and drives ST over REST. Features: grid, search, tags, favourites, dupes, a card editor with diffs, local and remote version snapshots, bundle zip export/import (cards + chats + gallery + lorebooks), 10+ online card providers, a lorebook manager, an AI "Character Creator"/AI Studio, an AI lorebook-entry generator, a CSS assistant and a recommender. Optional `cl-helper` server plugin (CORS proxies, thumbnails). It hooks the chat only for cosmetics: media URL localisation and display-name override. It does no generation-path work, so there is no overlap with SO's narrative engine.

## How it works
- **Entry** `index.js`: injects settings (`extensionSettings.SillyTavernCharacterGallery`, `saveSettingsDebounced` index.js:78), adds a top-bar button or **hijacks ST's Characters button** with a launcher dropdown (index.js:490ff, `setupLauncherDropdown` index.js:998), registers `/characterlibrary` via `ctx.SlashCommandParser.addCommandObject(SlashCommand.fromProps…)` (index.js:1006-1020).
- **Separate page, CSRF by URL**: fetches `/csrf-token` (index.js:28-47) and opens `library.html?csrf=<token>` (index.js:225, 454, 478). The page reads it back from the query (`getCSRFToken` app/library.js:5643) and puts it on every `apiRequest` (app/library.js:5659). ST context is reached through `window.opener`/parent (`getSTContext` app/library.js:704). Embedded mode is an iframe plus a `postMessage` bridge.
- **Chat hooks** (cosmetic only): `CHARACTER_MESSAGE_RENDERED` / `USER_MESSAGE_RENDERED` / `CHAT_CHANGED` / `MESSAGE_SWIPED` / `CHARACTER_EDITED` (index.js:1712-1756). Each rewrites `.mes_text` media src in the DOM, retries on timers `[200,500]` or `[50,150,300,600]` for swipes, and adds a MutationObserver fallback (index.js:1758ff). A display-name override does the same (index.js:2025-2080). Nothing is persisted per chat and nothing touches the prompt.
- **LLM client** (`callLLM` app/library.js:927): no Connection Manager service. It reads `/api/settings/get` (app/library.js:772), picks the CC profiles (`p.mode === 'cc'` app/library.js:910), **rebuilds the chat-completions body from profile fields itself** (`secret_id`, `custom_url`, proxy lookup app/library.js:786), and POSTs `/backends/chat-completions/generate` with a fallback to `/openai/generate` (app/library.js:823, 975-978). It passes an `AbortSignal`. `extractLlmContent` (app/library.js:857) throws on `finish_reason === 'length'` when asked, and `stripLlmSurrogates` (app/library.js:849) removes lone UTF-16 halves. A second path, `callCustomLLM`, goes straight to a user-supplied OpenAI URL (app/library.js:1015ff).
- **AI lorebook generator** (`modules/lorebook-manager.js`): `AI_GEN_SYSTEM` asks for a JSON array of `{comment, keys, secondary_keys, content, constant, position, order}` (:3043).
  - Source is paste, URL/wiki category, or ST characters and chats.
  - Split into batches by input chars **and** by the output cap: pages per batch = 8000/450 (`aiSplitBlocksIntoBatches` :3628, constants :2960-2966). Up to 4 requests run concurrently, with a Stop control via `AbortController` (:3920, :3985).
  - Tolerant array parse with truncation salvage (:3063); each batch is flagged when its output was cut (:3976).
  - Entries map onto `newEntry` defaults (:3090). Dedupe on `comment|firstKey` (:4023). A **staging tray** with per-entry include toggles runs before commit (:4037).
- **AI Studio** (`modules/character-creator.js`): per-field system prompts (`FIELD_PROMPTS` :12) with a per-field user override (:1139). Other parts:
  - Brainstorm chat mode (:1036).
  - Refine locked to a selected span (`studioLockedSelection` :1896, :2334).
  - 50-step undo (:2262).
  - An "inspiration pool" of the user's own cards, cut to a token budget (:2536-2610).
- **Versions** (`modules/character-versions.js`): card snapshots go to ST's **Files API** (`/api/files/upload` base64 into `user/files/_clv_*`, read via `/user/files/<name>`, `/api/files/delete`) with an index file (:34-95). Diffs are field-level LCS diffs (:1160).
- **Card writes**: `/api/characters/merge-attributes` with dot-paths. `UNSET_VALUE` sentinel deletes a key, feature-detected via `ctx.writeExtensionField`/`ctx.UNSET_VALUE`, then `/api/extensions/version` (app/library.js:717-760, 29989ff).
- **Bundles** (`modules/batch-transfer.js`): the zip writer is STORE-only and zip64-aware, with a `manifest.json` (:442-633). On import, lorebook collisions are **case-insensitive**. A book with identical content (crc32 of `entries`) is **reused**; otherwise the book is imported as `name (n)` (`resolveBundleWorlds` :764-812). Cards follow an overwrite/skip policy.
- **Persistence**: settings in `extension_settings`, snapshots and playlists in ST user files. No `chat_metadata`, no swipe/edit/delete semantics beyond DOM re-localisation.

## Overlap with Story Orchestrator
- **Card/lorebook creation**: our wizard creates cards, a lorebook and a group, create-only, one reviewed card at a time (`src/wizard/provisioning.ts:25`, `src/services/stHost/provisioning.ts:40`). Theirs is broader (editing, overwrite, bulk) and deliberately not create-only. Our guard is stronger, their tooling richer.
- **LLM calls**: we go through `ConnectionManagerRequestService` with instruct and preset, textgen or CC (`src/services/stHost/connectionProfiles.ts:43`). They support CC only and hand-roll the body, which is worse and has drifted (see anti-patterns).
- **Lorebook name existence**: already case-insensitive in ours (`src/services/stHost/worldInfo.ts:32-34, 157, 173`), so parity.
- **Undo/redo**: the Studio already has it (`src/studio/draft.ts:52-101`).
- **Story diff**: ours is structural and state-aware (`src/engine/storyDiff.ts:100`). Theirs is a textual field diff with no semantics.
- **Truncation**: we refuse an oversized read whole (`src/extraction/sharedRead.ts:13-24,131`). They salvage what they can. Ours is right for state writes.

## Ideas for v2.4

| # | idea | kind | our area | our state | value | effort |
|---|---|---|---|---|---|---|
| 1 | Pass the RunOwner `AbortSignal` into CM `sendRequest` (the host accepts it; our comment says it does not) | host-integration | extraction / host | partial | 4 | S |
| 2 | Truncation from `finish_reason`, not a char-length guess (`extractData:false` + `ctx.extractMessageFromData`) | host-integration | extraction | partial | 3 | S |
| 3 | Bound batches by input size AND output capacity for backlog/whole-chat passes | pattern | extraction / memory | absent | 3 | M |
| 4 | Story bundle: story + required cards + lorebooks in one file, create-only import with content-hash reuse | new-feature | wizard / studio | absent | 3 | L |
| 5 | Truncate prompts and curator text without splitting surrogate pairs | enhancement | stagecraft / judge | absent | 2 | S |
| 6 | Library version history (keep prior versions; diff vs the chat's pinned copy) stored in ST user files | enhancement | studio / host | absent | 2 | M |
| 7 | Per-field "regenerate with instruction" on wizard provisioning cards | ux | wizard | absent | 2 | M |

**1. Abortable memory-LLM calls.** Theirs: every AI call carries a signal (`callLLM` app/library.js:978; Stop button lorebook-manager.js:3920). Host check (ST source, prompted by this): `ConnectionManagerRequestService.sendRequest` documents and destructures `custom.signal` (`public/scripts/extensions/shared.js:416,424`) and passes it to `processRequest` (:463, :483) and on into `fetch` (`custom-request.js:462-468`). **This contradicts our `src/runtime/runOwner.ts:60-63` comment**, which says sendRequest "takes no signal (shared.js:423)" and so leaves extraction uncancellable. Only the judge honours the signal today (`src/runtime/judge.ts:130`); `sendConnectionProfileRequest` never sends one (`src/services/stHost/connectionProfiles.ts:43-50`). Fix: add an optional signal to the seam and to `callExtractionModel` (`src/extraction/client.ts:11`), fed from `ownership.signal()`. Then a chat switch stops occupying the single local llama.cpp slot with a doomed read. The RunToken check stays as the write-edge defence. Fits invariants 5 and 10. Needs a live check that llama.cpp actually stops generating on client abort.

**2. Typed truncation signal.** Theirs: `extractLlmContent(..., {checkFinishReason})` throws on `'length'` (app/library.js:857-864), and every batch is flagged "OUTPUT TRUNCATED" (lorebook-manager.js:3976). Ours: `extractData:true` (`connectionProfiles.ts:47`) discards `finish_reason` (`custom-request.js:477-488` returns only content/reasoning). `isOversized` guesses from `raw.length > maxTokens*4` (`sharedRead.ts:22-23`), and a reasoning block that never closed collapses to `""` (`extraction/parse.ts:51`). Change: take `extractData:false`, read `choices[0].finish_reason`, and extract with `ctx.extractMessageFromData` (exported, `st-context.js:287`). Record `truncated: true` in the audit and refuse on it: same R6 policy, better evidence. Keep the char heuristic as a fallback, because textgen backends vary in whether they report finish_reason. No invariant conflict.

**3. Input- and output-aware batching.** Theirs: a batch closes when the next block would overflow the input budget **or** when the batch already holds as many pages as the output cap can answer (`aiSplitBlocksIntoBatches` lorebook-manager.js:3628-3641; `AI_GEN_PAGES_PER_BATCH` :2963), with bounded concurrency (:3985). Ours: this is seed D, "no request-size bound". `runMemorizeBacklog`'s final pass sends `getChatWindow(0, chat.length-1)` (`src/runtime/coordinators/extractionCoordinator.ts:428`). Take the two-bound rule, not the concurrency: one local backend means concurrency 1. Invariant 11: each chunk must record its own derived range (`memory/derived.ts`), or rollback ≡ replay breaks.

**4. Story bundle.** Theirs: zip manifest (batch-transfer.js:442-633). On import, identical lorebooks are reused by entries-hash, and a differing book of the same name lands as `name (n)` rather than overwriting it (:764-812). Ours: export is story JSON only (`src/studio/io.ts:4`), so a shared story arrives without the cards and lorebook its `requirements` name. The import must be **create-only** (invariant 8): reuse on an identical hash, otherwise create under a new name and rewrite the story's `requirements`/roster through the ordinary mutation path. Never take their "Overwrite" policy (anti-pattern for us). Personas are excluded. Could ride the provisioning ops so the per-op review cards apply.

**5. Surrogate-safe truncation.** Theirs: `stripLlmSurrogates` (app/library.js:849) exists because a lone UTF-16 half crashes strict encoders. Ours: raw `.slice(0,n)` on prompt text in several places:
- `src/stagecraft/prompt.ts:3`
- `src/judge/lore.ts:47`, `loreScore.ts:27`
- `curatorFilter.ts:26`
- `judge/extraction.ts:165`
- `src/stagecraft/parse.ts:9`, which caps text that is then **written into a lorebook**

Emoji-heavy RP makes this reachable. The fix is one util. No conflict.

**6. Library version history.** Theirs: snapshots in ST user files through `/api/files/upload|delete`, with an index file (character-versions.js:34-95). This keeps them out of `settings.json`. Ours: `v2Stories` keeps one record per id in extension settings (`src/runtime/storyLibrary.ts:6`), so a save discards the prior library version. Only chats that pinned it still hold it. Worth it for authors iterating with the wizard: restore vN-1, and diff the library against this chat's pinned copy using `storyDiff`. Invariant 12 is untouched, since this is library-side only.

**7. Field regenerate on provisioning cards.** Theirs: per-field generate with an author-editable system prompt (character-creator.js:12, :1139), plus refine restricted to a selected span (:2334). Ours: `ProvisioningCard` fields are editable textareas and nothing else (`src/studio/components/ProvisioningCard.tsx:81-89`). Regenerating means re-running a stage. Pre-apply only, so create-only still holds.

## Patterns to copy / anti-patterns to avoid
Copy:
- The two-bound batching rule (idea 3).
- Surfacing truncation as a named outcome rather than a short answer (idea 2).
- A staging tray that opens expanded at ≤5 items and collapsed above that (lorebook-manager.js:4040): a cheap UX rule for our curator and wizard review lists.
- Content-hash reuse before creating a duplicate asset (batch-transfer.js:783-791).
- Probing a host capability by function presence before falling back to version sniffing (app/library.js:731-758). Same spirit as our `capabilities.ts`.

Avoid:
- **Hand-rolled CC request bodies.** Theirs already drifted: ST's CM sends `pollinations_endpoint: profile['api-url']` (`shared.js:456`) and `callLLM` does not (app/library.js:949-957). It also skips the instruct template. We learned that one in v2 acceptance (Gemma token loops).
- **CSRF token in a URL query** (index.js:225). It leaks to history and referrers, and goes stale after an ST restart. That is the same trap as our stale-CSRF gotcha, and they refresh only when the tab opens.
- **Hijacking ST's own nav button** (index.js `setupLauncherDropdown`).
- **Rewriting `.mes_text` on render with timer retries plus an observer** (index.js:1712-1790). SO never touches message DOM; keep it so.
- **Salvaging truncated JSON arrays** (lorebook-manager.js:3063-3081). Fine for a reviewed staging tray, but it conflicts with R6 for any state write.
- **Reading the whole `/api/settings/get`** (proxies and passwords included) into a second page (app/library.js:772-805).

## ST host facts learned
- `ConnectionManagerRequestService.sendRequest(profileId, prompt, maxTokens, custom, overridePayload)` accepts `custom.signal` and threads it to `fetch` (`public/scripts/extensions/shared.js:416,424,463,483`; `custom-request.js:462-468`). **Contradicts our `src/runtime/runOwner.ts:60-63` comment.** Found while checking their abortable-call pattern; verified in ST source.
- `extractData:false` returns the raw backend JSON, including `finish_reason`. `extractData:true` returns `{content, reasoning}` only (`custom-request.js:133-144, 477-488`). `extractMessageFromData` is on the context (`st-context.js:287`).
- `UNSET_VALUE = '__@@UNSET@@__'` deletes a card extension key through `writeExtensionField`/`merge-attributes` (`extensions.js:2061,2070`; context `st-context.js:80-82,306`). Their code: app/library.js:717-760.
- ST Files API: `POST /api/files/upload {name, data:base64}` writes atomically to `user/files/<name>` (name validated), `POST /api/files/delete {path}` is restricted to the files dir, and reads are a plain GET `/user/files/<name>` (`src/endpoints/files.js:28-76`). Their code: character-versions.js:52-83.
- `/api/worldinfo/edit` writes through case-insensitive filesystems, so a case-differing "new" name clobbers an existing book on Windows/macOS (batch-transfer.js:766-770). Consistent with our case-insensitive `lorebookExists`; not a contradiction.
- `CHARACTER_MESSAGE_RENDERED` can fire before the final media DOM exists (markdown re-render, lazy images), and swipe content renders after `MESSAGE_SWIPED` (index.js:1712-1760, retry timers). Irrelevant to us because we read the `chat` array, not the DOM. Consistent with our gotchas.
- `/csrf-token` returns the current token; a token captured earlier goes stale after a server restart (index.js:28-31 comment). Consistent with our stale-CSRF gotcha.

## Verdict
Relevance **low-medium**. It is a library/asset manager with no narrative, memory or generation-path logic. The one thing worth taking is not a feature. Checking its abortable LLM calls showed that ST's CM `sendRequest` **does** take an `AbortSignal`, which our `runOwner.ts` says it cannot. Wiring `ownership.signal()` into `sendConnectionProfileRequest` (idea 1), together with the `finish_reason` truncation signal (idea 2), is a small, high-leverage host-seam fix. The bundle import (idea 4) is the only feature-sized idea, and it must stay create-only.
