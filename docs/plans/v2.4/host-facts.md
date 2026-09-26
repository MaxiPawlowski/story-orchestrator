# v2.4 host facts (X9)

Every v2.4 plan cites host behaviour from this file (rule 2: no fixture, no fix; a host fact needs its
`file:line`). Rows are labelled `<plan>-H<n>`, and later plans append their own rows below. A row is a
claim about a specific tree: re-verify on the current checkout before building on it, and correct the row
(with the date) rather than arguing with it.

Plan 01 wrote these rows on 2026-09-24. The 1.19.0 lines are from `public/` on the live install
(`7c3994196`); the 1.18.0 lines are from `51ad27f`. Spot-checked on 2026-09-24 against the live tree:
H1 (`script.js:1611`, `:1699`), H5 (`:3532-3537`), H9 (`slash-commands.js:3772`) and H13
(`authors-note.js:272,275`) all hold.

## Plan 01

| # | Fact | 1.19.0 | 1.18.0 |
|---|---|---|---|
| 01-H1 | `MESSAGE_DELETED` payload = the **post-delete `chat.length`** | `script.js:1611` (`deleteLastMessage`), `:1699` (`deleteMessage`), `:4411` (regenerate/swipe tail pop), `:11734` (delete-mode truncate) | `:1609`, `:1672`, `:4352`, `:11672` |
| 01-H2 | Tail paths therefore decode **correctly** today; only a non-tail `deleteMessage` or `/cut` is wrong | splice-from-end `:1683-1690` | same |
| 01-H3 | One event can remove **several** messages (a tool-call run before the reply) | `getMessageDeletionStartId` `:1614-1630`; param `:1639` | **no**: `deleteMessage(id, swipe, ask)` `:1618` splices one message. The row is `blocked` on 1.18.0 (X4) |
| 01-H4 | `/cut a-b` = one `MESSAGE_DELETED` per message, each after its own splice | `power-user.js:2820-2857` | `:2848` |
| 01-H5 | `GENERATION_ENDED` comes from `hideStopButton`, only while `#mes_stop` is visible; its payload is `chat.length`. **ENDED is not paired with STARTED** | `script.js:3532-3537` | `:3473-3477` |
| 01-H6 | A nested quiet run's `unblockGeneration` → `activateSendButtons` clears `is_send_press` and `dataset.generating` mid-turn. `isGenerating()` = `is_send_press \|\| is_group_generating`, so in solo `isHostGenerating()` reads **false** inside the outer generation | `:5693-5704`, `:7075-7080`, `:604` | `:7016` |
| 01-H7 | `GENERATION_STARTED(type, {automatic_trigger, force_name2, quiet_prompt, quietToLoud, skipWIAN, force_chid, signal, quietImage}, dryRun)`; `AFTER_COMMANDS` takes the same arguments | `:4299`, `:4321` | `:4240` |
| 01-H8 | `generateQuietPrompt` → `Generate('quiet', {… force_chid: forceChId ?? null})`; positional calls are accepted with a trace | `:3084-3108` | `:3025` |
| 01-H9 | `/comment`: `name 'Note'` (`slash-commands.js:3772`), `is_system:true`, `extra.type:'comment'`. It emits `MESSAGE_SENT` and `USER_MESSAGE_RENDERED`, never `CHARACTER_MESSAGE_RENDERED` | `slash-commands.js:6113-6152` | `:6112-6117` |
| 01-H10 | `/sys`: `name` = `narrator_name` or `'System'`, `is_system` only for a bias-only message, `extra.type:'narrator'` | `slash-commands.js:6020-6036`, `:3770-3771` | re-check |
| 01-H11 | Group `/sd` post: `name = systemUserName` (`'SillyTavern System'`, `script.js:405`, **not on the context**), `is_system: !visible`, media in `extra.media[]` (not `extra.image`) | `stable-diffusion/index.js:4966-4991` | `extra.media` too |
| 01-H12 | `sendRequest` honours `custom.signal` | `shared.js:395`, `:415`, `:423-424`, `:464`, `:484`; wrapped at `:487-489` | `:391`, `:411`, `:420`, `:458`, `:478` |
| 01-H13 | Author's Note defaults: depth 4, system role | `authors-note.js:272,275` | re-check |

Third-party facts go in the same file, marked "not ST":
- **Stepped Thinking** (`b79df5e`):
  - listeners `thinking/engine.js:50-61`, with `AFTER_COMMANDS` at `:56`;
  - the thought is a positional `generateQuietPrompt(…, characterId)` at `:443-451`, i.e. **a quiet run with
    `force_chid`**;
  - its regenerate path calls `Generate(null, {force_chid})` at `:293` (a **null type**);
  - `settings` is a live reference to `extension_settings['st-stepped-thinking']` (`settings/settings.js:53-56`),
    and `is_enabled` is read at `engine.js:490`, so an in-place flip takes effect immediately. This install:
    enabled, `is_enabled:false`, `mode:'embedded'`.
- **Guided Generations** (research clone `64456d4`; not installed here): `emitGenerationEvent` at
  `scripts/utils/llmClient.js:565-572` emits **single-argument `{source}` payloads** for `GENERATION_STARTED`
  (`:899`, `:912`), `GENERATION_ENDED` (`:908`, `:914`) and `GENERATION_STOPPED` (`:917`).

Still to re-check on 1.18.0 during plan 01's live gate: H10 and H13, and that H3 really is absent.

## Plan 02 (T14 additions, 2026-09-24)

Plan 02's own H1-H19 live in its plan doc. These are the facts T14 rests on beyond them, read on the
1.19.0 tree (`public/` of the live install). 1.18.0 was not checked (no git access to the ST checkout
from the build worktree); a host that answers differently reads as "cannot tell", which the reaper turns
into a Repair row, never a delete.

| # | Fact | 1.19.0 |
|---|---|---|
| 02-H20 | `eventSource.emit` awaits each listener in turn, so a listener that waits on a popup holds the emitter (for `deleteGroup`, before its `response.ok` check) | `lib/eventemitter.js:130-151` (`await` at `:146`) |
| 02-H21 | `/api/chats/group/info {id}` answers a missing file with `{match:false}` and no `file_name` (`getChatInfo`'s ENOENT branch), and an existing file, empty or not, with its `file_name` | `src/endpoints/chats.js:883-898`; `getChatInfo` `:393-426` (ENOENT `:398-410`) |
| 02-H22 | `/api/characters/chats {avatar_url, simple:true}` lists `{file_name, file_id}` per `.jsonl`, `[]` for an empty directory, and `{error:true}` for a missing directory **or** any failure | `src/endpoints/characters.js:1499-1535` |
| 02-H23 | `/api/groups/delete` deletes every chat file the group lists | `src/endpoints/groups.js:212-226` |
| 02-H24 | A `CONFIRM` popup's cancel control is `.popup-button-cancel`, labelled by `cancelButton` | `popup.js:256`, `:274` |
| 02-H25 | H13/H14 re-read: `deleteWorldInfo` is `:4346-4393` (returns false for an unlisted name before any request); keyless non-constant, non-sticky entries are skipped at `world-info.js:4892-4907` | `world-info.js` |

## Plan 03 (budget modules, 2026-09-24)

Re-verified on the 1.19.0 tree (`public/`, `package.json:118`) and on `51ad27f` (1.18.0) via `git show`.
Plan 03's own H1-H14 live in its plan doc; this row is the one the budget read (`stHost/contextLimit.ts`) rests on.

| # | Fact | 1.19.0 | 1.18.0 |
|---|---|---|---|
| 03-H12 | Context size comes from the profile's settings preset: `ctx.CONNECT_API_MAP[profile.api].selected` names the preset manager, `ctx.getPresetManager(selected)` returns it (`null` for an API with none), `getCompletionPresetByName(profile.preset)` returns the preset or `undefined` (with a `console.error`). TC key `max_length` (written into a saved TC preset from `max_context`), CC key `openai_max_context`. The CM profile has no size field. Profiles live in `extensionSettings.connectionManager.profiles`; CM disabled = `disabledExtensions` holds `connection-manager` | `st-context.js:285` (`CONNECT_API_MAP`), `:288` (`getPresetManager`); `preset-manager.js:83-96`, `:531-588` (`getPresetList`), `:744-747`, `:757-778`; `openai.js:361`; `slash-commands.js:142`; `extensions/shared.js:530-550` | `st-context.js:283`, `:286`; `preset-manager.js:83`, `:739`, `:750`; `openai.js:353` |

## Plan 03 (off-path call hygiene, 2026-09-24)

Re-read on the live 1.19.0 tree (`7c3994196`, `package.json:118`) and on 1.18.0 via `git show 51ad27fb:<path>`
(both present). Rows H1–H14 are the plan's; H15–H19 were found while building D1/D6 and change what the seam
has to do. "Δ" marks a correction of the plan's citation.

| # | Fact | 1.19.0 | 1.18.0 |
|---|---|---|---|
| 03-H1 | `sendRequest(profileId, prompt, maxTokens, custom, overridePayload)` destructures `custom.signal` and passes it to both services | `extensions/shared.js:423-424`, CC `:463`, TC `:483` (Δ plan `:393-400,415`: those are the JSDoc) | `:419-420`, `:458`, `:478` ✔ |
| 03-H2 | Errors raised inside the `try` are wrapped `Error('API request failed', {cause})` | `shared.js:489-490` | `:485` ✔ |
| 03-H3 | The CM-disabled check, `getProfile` and `validateProfile` run **before** the `try`, so they throw **unwrapped**: `Connection Manager is not available` (`:427-429`), `Profile not found (ID: …)` (`:548`), `Could not find profile.` (`:607`), `Select a connection profile that has an API` (`:610`), `Unknown API type <api>` (`:616`), `API type … is not supported. Supported types: …` (`:619`) | as listed; call order `:431-432` | `:423-427`, `:543`, `:602`, `:605` ✔ |
| 03-H4 | Services pass `signal` to `fetch`; a non-OK reply (or a 200 carrying `json.error`) throws `Error(json.error?.message \|\| 'Response not OK')`, so the HTTP status is lost | TC `custom-request.js:125,129-130`; CC `:468,473-474` | `:125,130`, `:468,474` ✔ |
| 03-H5 | The ST server aborts the upstream call when the client socket closes | TC `src/endpoints/backends/text-completions.js:284-292`; CC `chat-completions.js:243` (Claude; one `socket.on('close')` per source, e.g. `:675,812,894`) | TC `:286,291` ✔. **Confirmed live on 1.19.0** (v2.4 plan 03, `03-off-path-call-hygiene.md:1000-1002`: `AbortError` from `text-completions.js:291` on socket close; llama `requests_processing` 1 → 0 within 0.59 s). Row updated by v2.5 plan 02 C4 |
| 03-H6 | `extractData:false` returns the raw JSON (TC `custom-request.js:133-135`, CC `:477-478`); `ctx.extractMessageFromData(json, type)` gives the same content the extracted path reads (`script.js:6276-6300`, exported `st-context.js:287`). It reads no finish reason; the seam must | as listed | `script.js:6217`, `st-context.js:285`, `custom-request.js:133,477` ✔ |
| 03-H7 | `overridePayload` spreads **last** over the preset-derived payload | `custom-request.js:414` (TC), `:605` (CC) | `:414`, `:605` ✔ |
| 03-H8 | CC `createGenerationParameters` deletes `temperature`/`top_p` for constrained model families; an override puts them back | `openai.js:2691` (function), deletes at `:3039-3040`, `:3058-3059`, `:3088-3089`, `:3100-3101`, `:3110-3111` | `:2970`, `:2989`, `:3019` (three sites; the Claude-5 rule is 1.19.0-only) ✔ |
| 03-H9 | `ONLINE_STATUS_CHANGED` fires on change only, main API only | `script.js:7151-7157` (`emitAndWait` `:7156`), key `events.js:79` | `script.js:7097`, `events.js:79` ✔ |
| 03-H10 | `CONNECTION_PROFILE_CREATED/UPDATED/DELETED` are emitted by connection-manager | `connection-manager/index.js:347,780,796,879,996,1015`; keys `events.js:82-84` | same lines ✔ |
| 03-H11 | `getTokenCountAsync` counts with the **main API's** tokenizer (`power_user.tokenizer`; the OpenAI counter whenever `main_api==='openai'`), not the extraction profile's | `tokenizers.js:443-468` | `:443-457` identical ✔ (confirmed here; the plan left it open) |
| 03-H12 | A profile's context size is readable from its preset: `ctx.getPresetManager(api).getCompletionPresetByName(profile.preset)` → TC `max_length`, CC `openai_max_context`; the CM profile has no size field | `st-context.js:288`, `preset-manager.js:83,757`; `openai.js:361,422`; e.g. `data/default-user/TextGen Settings/Artemis Extraction.json:127` `max_length: 98304` | `st-context.js:286`, `preset-manager.js:83,750`, `openai.js:353,414` ✔ (confirmed here) |
| 03-H13 | llama.cpp `/props` is reachable only through ST's server | `text-completions.js:234`, `llamacpp.post('/props')` `:521` | recorded only; **not used** |
| 03-H14 | `AbortSignal.timeout` exists in the jest runtime (node v22.22.0, measured 2026-09-24) and is typed by TS 5.4's DOM lib; **`AbortSignal.any` is not in TS 5.4's lib** (`lib.dom.d.ts:2337-2344`), so `utils/signals.ts` feature-checks it and falls back to a listener chain | — | browser floor (Chromium ≥116 for `any`) is MDN, not measured |
| 03-H15 | `CONNECT_API_MAP[profile.api].selected` is `'openai'` (CC) or `'textgenerationwebui'` (TC) for every profile the service accepts; exported on the context | `slash-commands.js:142-147`, `st-context.js:285`; allowed types `shared.js:398-403` | `slash-commands.js:141`, `st-context.js:283` ✔ |
| 03-H16 | Validation inside the `try` is wrapped (H2), so three **config** failures arrive as `API request failed` with a config `cause`: `API type … does not support chat completions` (`:438`), `… does not support text completions` (`:467`), `Unknown API type …` (`:486`). A classifier reading only the wrapper would call them transport | `shared.js:438,467,486` | same messages ✔ |
| 03-H17 | With `extractData:false` the TC service **skips** its reply clean-up: per-line trailing whitespace, a partial stop string at the end, truncation at the instruct `stop_sequence`/`input_sequence`, removal of `output_sequence`/`last_output_sequence` lines. The seam re-applies that from the profile's instruct preset (`getPresetManager('instruct')`) | `custom-request.js:332-381`, raw return `:384`; instruct lookup `:293-296` | `:339-381`, `:384` ✔ |
| 03-H18 | TC `llamacpp` is sent to llama-server's **native** `/completion`, not `/v1/completions`, and the reply is passed through unchanged: it carries `stop_type`/`stopped_limit`, not `choices[0].finish_reason` (Δ H6's expectation). `readFinish` reads `choices[0].finish_reason`, Claude `stop_reason`, Gemini `finishReason`, Ollama `done_reason` and llama.cpp `stop_type`/`stopped_limit`/`stopped_eos`/`stopped_word`; anything else is `unknown` | `text-completions.js:315-316`, reply sent as-is `:420` | `:316` ✔. **The llama.cpp field names are upstream shape, not read from source here — confirm live** |
| 03-H19 | An upstream non-OK answer reaches the client as HTTP 200 `{error:true, status, response}`; `json.error.message` is undefined, so the client throws `Response not OK` and the provider text is lost | `text-completions.js:422-427` → `custom-request.js:129-130` | `:424` ✔ |

## Plan 07 (judge accounting, 2026-09-24)

Not ST facts: the judge's host is TypeSafe, reached only through our server plugin. The "source" column is
the live documentation (read 2026-09-24 as Markdown: `docs.typesafe.ai/models.md`, `/api.md`) or our
plugin (`server-plugin/story-orchestrator-judge/index.mjs` on `4151bc8`). A vendor statement is a source,
not a measurement (rule 1); the rows that need a measurement say so.

| # | Fact | Source | Measured? |
|---|---|---|---|
| 07-H1 | `jev-1.13.0` context: **64k tokens per request; 32k for `state` plus the longest question** | `models.md` §Current models, "Context length" row and bullet | **Partly (2026-09-25, `limit-probe --send`).** Past the limit the API **refuses**: HTTP 400 `{"detail":{"error_type":"max_tokens_exceeded"}}`, no silent truncation. It answered 30,132 tokens and refused about 67k; whether 32k or 64k is enforced is not pinned. Record: `test/journeys/records/v2.4-plan07/part1-live-7f1787158bf8/limit-probe.json` |
| 07-H2 | Aliases `jev-latest` and `jev-preview` both point to `jev-1.13.0`; "the response's `model` field reports the versioned ID that answered" | `models.md` §Aliases | Partly: v2.3 plan 10 §B saw `--model jev-latest` answered by `jev-1.13.0` (`10-judge-seeds.md` §B). `jev-preview` is new to our map (the plan named only `jev-latest`) |
| 07-H3 | `usage` is `{input_tokens, output_tokens}` (integers, required); **no cost field** | `api.md` §Response, `usage` ResponseField + four examples | Yes, by the v2.3 spike (334,328 input tokens metered, `docs/spikes/2026-09-19-typesafe-jev/report.md:8-9`) |
| 07-H4 | Price: charged per **input** token, `$0.042` per million; output free | `models.md` §Current models, "Price" | Consistent with the spike: 334,328 tokens → $0.01404 = $0.042/Mtok |
| 07-H5 | A malformed request is `422 Unprocessable Entity` upstream; rate limit `429`, overload `529` | `api.md` §Errors | The plugin refuses first with its own `400` (`index.mjs:135-136`) and retries 429/529 once (`:12-13`, `:116`) |
| 07-H6 | The plugin's `/status` reports its constant `DEFAULT_MODEL`, not the install's configured model | `index.mjs:132` (`:8`) | Code fact; the page-side mismatch uses the ring's last answered model instead (plan 07 §2) |
| 07-H7 | The plugin passes the upstream body back verbatim, so `usage` reaches the page | `index.mjs:141` | Code fact; jest covers the page side (`accounting.review.test.ts`) |
| 07-H8 | Characters per token, whole request, as reported by `usage.input_tokens`: English 4.525 (17,740 and 26,510 tokens), Spanish 3.488 (30,132), random base36 1.488 | `limit-probe --send`, 2026-09-25 | Yes. The token guard estimates at 3.488, the lowest natural-language ratio measured. A one-fact warden call costs 447 input / 22 output tokens |

## Plan 05 (World Info, 2026-09-24)

Re-read on the live 1.19.0 tree (`public/`, `package.json:118`, `7c3994196`) line by line with a file reader. The 1.18.0 column is
the plan's static reading of `51ad27fb` (`git show`); it was **not** re-read here, because the build worktree cannot run git
against the ST checkout. "Δ" marks a correction of the plan's citation.

| # | Fact | 1.19.0 | 1.18.0 (plan) |
|---|---|---|---|
| 05-H1 | `WORLD_INFO_ACTIVATED(Array)` = `allActivatedEntries.values()`, emitted in `getWorldInfoPrompt` only when `!isDryRun && size > 0`. No event for "nothing fired" | `world-info.js:899-903` ✓ | `:902` |
| 05-H2 | `WORLDINFO_ENTRIES_LOADED({globalLore, characterLore, chatLore, personaLore})`, awaited inside `getSortedEntries` before sort/hash/clone | fn `:4590`, emit `:4604` ✓ | `:4478`/`:4492` |
| 05-H3 | The arrays are per-call copies: `worldInfoCache` is `StructuredCloneMap({cloneOnGet:true})`, `loadWorldInfo` returns a clone, and each entry is re-spread `{uid, world, ...rest}`. A listener's `disable` write is scan-local | `:882`, `:2041-2042`, spreads `:4515`, `:4535`, `:4557` (Δ plan `:4556` is the load), persona `:4582` | `:882` |
| 05-H4 | Sorted AFTER the event (chat lore first, `:4624-4625`; `sortFn` sorts each array in place), hashed after it (`:4628-4633`), then `structuredClone`d (`:4638`). So the ENTRIES_LOADED array order is still the book's key order: the scan handler's "first entry carrying a comment" is the same entry the file path's `Object.values(entries).find` flips | ✓ | `:4527` |
| 05-H5 | Timed effects (sticky/cooldown) are keyed by that hash (`:585`, `:624`); a scan-time change that alters an entry's JSON changes its hash | ✓ | re-check (not done) |
| 05-H6 | `disable == true` is skipped (`:4801`) before the forced check (`:4886`, Δ plan `:4885` is the blank line above it); keyless non-constant entries skipped (`:4906`); forced entries still pass probability (`:5042-5053`) and budget (`:5061-5070`) | ✓ | `:4689`/`:4774` |
| 05-H7 | Every `checkWorldInfo`, dry included, ends in `buffer.resetExternalEffects()` (method `:418`, call `:5275`), which clears pending forces | ✓ | `:5156` |
| 05-H8 | `WORLDINFO_SCAN_DONE(args)` per scan loop, `args.activated.entries` the live Map. `args` carries no dry-run flag a listener can read (`:5150-5174`), so it cannot tell a real scan from a dry one | `:5175` ✓ | `:5056` |
| 05-H9 | `getSortedEntries` callers: `checkWorldInfo` (`:4744`), ST's CHAT_CHANGED pre-cache (`:1013-1018`, result discarded), vectors (`vectors/index.js:1629`), ours (`worldInfoActivate.ts`) | ✓ | pre-cache `:1016` |
| 05-H10 | Vectors WI: `rearrangeChat` interceptor (`vectors/index.js:776`, skips quiet `:778`) → `activateWorldInfo` `:1623`; skips `entry.disable` (`:1646-1649`); deletes vector items for entries absent from its view (`:1680-1690`); forces its matches with `WORLDINFO_FORCE_ACTIVATE` at `:1725` (Δ plan `:1723`) | ✓ | `:1629`/`:1646` |
| 05-H11 | `emit` copies the listener list at emit time and awaits each, swallowing errors (`lib/eventemitter.js:130-153`, copy `:141`); `makeLast` (`:66-83`) / `makeFirst` (`:90-107`) reposition at call time only | ✓ | `:66`/`:90` |
| 05-H12 | `deleteWorldInfo` requires the name in `world_names` (`:4347`), evicts `worldInfoCache` (`:4361-4363`), deselects (`:4365-4369`) and refreshes the list (`:4371`) | fn `:4346` ✓ | `:4234` |
| 05-H13 | Keys `WORLD_INFO_ACTIVATED` `events.js:62`, `WORLDINFO_FORCE_ACTIVATE` `:77`, `WORLDINFO_ENTRIES_LOADED` `:97`, `WORLDINFO_SCAN_DONE` `:98` | ✓ | same |
| 05-H14 | Generate interceptors run before the WI scan (`script.js:4561-4573` < `getWorldInfoPrompt` `:4635`), after `GENERATION_AFTER_COMMANDS` (`:4321`), and never on a dry run (`:4562`) | ✓ | ✓ static 2026-09-25 (`git show 51ad27fb`): GAC `script.js:4262` < `sendMessageAsUser` `:4394` (so `MESSAGE_SENT` `:5851` fires after GAC) < interceptors `:4505` < `getWorldInfoPrompt` `:4576` (T12c built on it) |
| 05-H15 | `getWorldInfoPrompt(chat, maxContext, isDryRun, globalScanData)` is on the context (`st-context.js:283`); `chat` is the message texts in reverse order (`world-info.js:884-892`). The T20 foreign dry-scan fixture (`test/fixtures/interop/wi-foreign.js`) calls it with `isDryRun = true` | ✓ | not read |
| 05-H16 | `getWorldInfoNames()` is a copy of `world_names` on the context (`st-context.js:284`); `deleteWorldInfo`/`updateWorldInfoList`/`worldInfoCache` are module exports only (not on the context), so harness code imports `/scripts/world-info.js` | ✓ | not read |
| 05-H17 | A WI entry's `characterFilter` (`{isExclude, names, tags}`) is checked in the scan loop BEFORE the constant check: a non-empty `names` list filters by `getCharaFilename()` (`world-info.js:4816-4818`), a non-empty `tags` list by the character's tags (`:4826-4835`); a filtered constant never activates. Found live 2026-09-25: sun-ruins `CP1 - Mission` is DM Narrator only, so T12's constant-miss flag must skip filtered copies | ✓ (live) | ✓ static `:4704`/`:4714`, constant `:4782` |

Still owed on 1.18.0 (live, plan 09 clean-host-older covers them only as jest seam tests): H5, H14, and H15/H16 (not read).

## Plan 04 (extraction input quality, 2026-09-24)

Re-read on the live 1.19.0 tree (`7c3994196`, `package.json:118`) by absolute path. **1.18.0 was not checked**: the
build worktree is refused `git` against the ST checkout (`git -C … show 51ad27fb:…` is blocked by the worktree
isolation), the same limit plan 02 recorded. Rows 04-H1, 04-H2, 04-H5 and 04-H6 are the ones the plan asked to
check on 1.18.0; they are owed to the integration session. Third-party rows are marked "not ST".

| # | Fact | 1.19.0 |
|---|---|---|
| 04-H1 | The prompt chat is `chat.filter(x => !x.is_system \|\| (canUseTools && tool_invocations))`; each message is `getRegexedString(mes, is_user ? USER_INPUT : AI_OUTPUT, {isPrompt:true, depth: coreChat.length - index - (isContinue ? 2 : 1)})`, then `extra.append_title` / media `append_title` titles are appended | `script.js:4496` (filter), `:4501-4506` (regex call), `:4510-4521` (titles) |
| 04-H2 | `isPrompt:true` runs only `promptOnly` scripts ("all cases" scripts already rewrote the stored `mes`); depth bounds come from `minDepth`/`maxDepth`; with the regex extension disabled the text comes back raw | `extensions/regex/engine.js:334` (signature), `:341-343` (disabled → raw), `:348-355` (placement gate), `:361-371` (depth), placements `:281-292` |
| 04-H3 | `getRegexedString` is **not** on `getContext()` (no hit in `st-context.js`), so a regex seam would be a dynamic import of `regex/engine.js` | grep, 2026-09-24 |
| 04-H4 | `system_message_types` = help, welcome, empty, generic, narrator, comment, slash_commands, formatting, hotkeys, macros, welcome_prompt, assistant_note, assistant_message; ST's own system posts are `is_system:true` | `system-messages.js:18-32`, defaults `:36-43` |
| 04-H5 | `/sys` posts `extra.type:'narrator'` with `is_system:false` unless the text is bias-only (story narration); `/comment` posts `is_system:true`, `extra.type:'comment'` | `slash-commands.js:6019-6041`, `:6113-6128` |
| 04-H6 | An `/sd` post is `{name: groupId ? systemUserName : name2, is_user:false, is_system: !visible, mes: template(prompt), extra:{media:[{…, generation_type, source:'generated'}], media_display, media_index:0, inline_image:false}}`; `generation_type` is a `generationMode` number (`:113-126`); `'extension'` is only the event argument; visibility comes from `sd.{interactive,wand,command,tool}_visible` | `stable-diffusion/index.js:4966-5000`, `:5009-5024` |
| 04-H7 | The per-message image button sets `inline_image = !(media.length && !inline_image)`: a reply's FIRST generated image makes it `true`, and a post that already holds a non-inline image (an `/sd` post) keeps `false`. So "has generated media" alone does not identify an `/sd` post; `inline_image === false` plus a numeric `generation_type` on `media[0]` does | `stable-diffusion/index.js:5226-5229`; media source enum `constants.js:75-80` |
| 04-H8 | (not ST) Stepped Thinking 3.2.0 posts a separated thought as `{is_user:false, is_system: bias-only, is_thoughts:true, owner_extension:'st-stepped-thinking', extra:{type: asSystem ? 'narrator' : undefined, api:'script', model:'stepped thinking'}}`; the default `mes` is `<details type="executing" …><summary>Thinking ({{char}}) 💭</summary>` + a ```` ```md ```` fence + `</details>`; `is_thoughts_spoiler_open` (default false) only toggles the `open` attribute | `third-party/st-stepped-thinking/thinking/mode.js:596-614`, `settings/settings.js:134`, `:147-155`, `index.js:27`, `manifest.json:9` |
| 04-H9 | (not ST) CYOA pushes `{name:'CYOA Suggestions', is_user:true, is_system:false, mes: <html buttons>, extra:{api:'manual', model:'cyoa'}}` with no event; not installed here | `C:/dev/st-extensions-research/cyoa-extension/source/index.js:154-169` |
| 04-H10 | `/hide` flips `is_system` and saves with no event, so hidden rows are already out of every window (D5) | `chats.js:147-168` |

**1.18.0 check (integration session, 2026-09-25).** Rows 04-H1, 04-H2, 04-H5 and 04-H6 re-read on `51ad27fb`
(`package.json` `"version": "1.18.0"`) with `git -C C:/dev/SillyTavern-MainBranch show 51ad27fb:<path>`. All four hold
on 1.18.0 with the same shape; only line numbers move.

| # | 1.18.0 | Result |
|---|---|---|
| 04-H1 | `script.js:4437` (filter, same `canUseTools && Array.isArray(x.extra?.tool_invocations)` clause), `:4443-4447` (`isPrompt:true`, same depth formula, then `appendFileContent`), `:4450-4463` (`extra.append_title` and media `append_title` titles) | holds |
| 04-H2 | `extensions/regex/engine.js` is byte-identical to 1.19.0 (`diff --strip-trailing-cr`, no output): `:334` signature, `:342` disabled → raw, `:350-354` placement gate, `:363-371` depth, placements `:281-292` | holds, same lines |
| 04-H5 | `slash-commands.js:6019` `sendNarratorMessage` (`is_system: bias && !removeMacros(text).length`, `extra.type: NARRATOR`); `:6112` `sendCommentMessage` (`is_system: true`, `extra.type: COMMENT`) | holds, lines −1 |
| 04-H6 | `stable-diffusion/index.js:4966-5001` `sendMessage` (identical text to 1.19.0 over `:4960-5030`), visibility `:5009-5019`; `generationMode` `:113-128` (FREE 6); `constants.js:75-78` `MEDIA_SOURCE.GENERATED = 'generated'` | holds, same lines |

## Plan 07 part 2 (T22/T23, 2026-09-25)

| # | Fact | Source | Verified |
|---|---|---|---|
| 07-H9 | A Score answer is a continuous value on `[0, levels − 1]`, not a level index: T22 reads it raw and flags at `> 2.5` on its 5-level rubric (0..4) | Our own recorded answers: `test/goldens/judge/lore-relevance.json` holds 1600 Score answers on a 6-level scale, min 0, max 4.14, 1591 non-integer (recounted 2026-09-25); Jeved reads it raw too (`extension-research/jeved.md` F1) | Yes, from recorded real answers; the agency rubric itself is unmeasured until Phase A |
| 07-H10 | `getPlayerName()` reads `context.name1` (the persona NAME, never its description) | `src/services/stHost/context.ts:58-61`, vendored `hostTypes.ts:68` | Code fact; T22 sends only this name |

## Plan 06 (sampler overlay, curator writes, 2026-09-25)

| # | Fact | 1.19.0 |
|---|---|---|
| 06-H1 | `GENERATE_AFTER_DATA(generate_data, dryRun)` is emitted, awaited, in main `Generate()` only, for every main API and on dry runs too; for Text Completion `generate_data` is the `getTextGenGenerationData` payload that is then sent, so a listener's writes reach the request | `script.js:5318` |
| 06-H2 | `CHAT_COMPLETION_SETTINGS_READY(generate_data)` is emitted, awaited, in `sendOpenAIRequest` after the per-model sampler deletions and before the fetch; `generate_data` starts `{type, messages, model, temperature: Number(temp_openai), …, top_p: Number(top_p_openai)}` | `openai.js:3146` (emit), `:2803-2810` (shape, `type` first), deletions up to `:3118` |
| 06-H3 | `generateRawData` builds quiet requests on both paths: textgen via `getTextGenGenerationData(…, 'quiet')`, CC via `sendOpenAIRequest('quiet', …)`, so a CC quiet request carries `type: 'quiet'` into 06-H2 while a textgen one never reaches 06-H1 | `script.js:4063` (textgen), `:4077` (CC) |
| 06-H4 | `TEXT_COMPLETION_SETTINGS_READY(params)` fires inside `getTextGenGenerationData` for every caller (foreign quiet calls included) with no type, so it is NOT the textgen hook | `textgen-settings.js:1844-1848` |
| 06-H5 | Connection Manager requests (`custom-request.js`) call neither `sendOpenAIRequest` nor `getTextGenGenerationData` and emit nothing, so memory/curator calls take no overlay | grep `custom-request.js`, 2026-09-25 |
| 06-H6 | `TempResponseLength.setupEventHook` also uses `GENERATE_AFTER_DATA` (a `once` hook, removed after), so listener order on that event is shared with ST itself | `script.js:4219`, `:4237` |
| 06-H7 | `getContext().getPresetManager(apiId).getPresetList(api?)` returns `{presets, preset_names}`; `preset_names` is an ARRAY for textgen and an OBJECT `{name: index}` for openai; `getCompletionPresetByName(name)` is an exact match over that list and returns `undefined` when missing; `getSelectedPresetName()` is the UI selection | `preset-manager.js:531`, `:757-770`, `:403` |
| 06-H8 | A saved CC preset is a parsed object with `*_openai` sampler keys (`temp_openai`, `top_p_openai`, …); the settings file keeps the selection in `oai_settings.preset_settings_openai` and the textgen one in `textgenerationwebui_settings.preset` | `openai.js:4320-4325`, `:307-310`, `:412-416`; `script.js:8081`, `:8090` |
| 06-H9 | The WI editor's own save path is `saveWorldInfo(name, data, immediately)`; an entry is addressed by its uid key in `data.entries`, which survives a rename in the editor (the comment is just a field) | `world-info.js:4177`; exercised by `live-v10b-uid-revert.json` |

## Plan 08 (author observability, 2026-09-25)

Re-read by absolute path on the live 1.19.0 tree (`7c3994196`, `package.json:118`) and on 1.18.0 (`git show 51ad27fb:…`)
where a 1.18.0 column is filled. The plan doc's §Host facts table is the source; line drifts found here are noted.

| # | Fact | 1.19.0 | 1.18.0 |
|---|---|---|---|
| 08-H1 | `/chat-jump N` (aliases `chat-scrollto`, `floor-teleport`): 0-based; loads older messages via `showMoreMessages`, scrolls `#chat`, `flashHighlight` 2 s | `slash-commands.js:3448-3503` (`name` at `:3449`); `utils.js:2184` | `slash-commands.js:3447` |
| 08-H2 | `/chat-jump` answers `''` on success AND on failure (out of range → `toastr.warning`; element not found → warning). Its result is **not evidence**; our adapter answers from the pre-check | `slash-commands.js:3454-3458`, `:3482-3486`, `:3488` | same shape |
| 08-H3 | `getMaxContextTokens()` = `max_context` on textgen/kobold, `oai_settings.openai_max_context` on CC; `getMaxResponseTokens()` = `amount_gen` / `openai_max_tokens`; `getMaxPromptTokens()` = context − response. Module exports of `/script.js`, **not** on `getContext()` | `script.js:5929`, `:5966`, `:5981-5987` | `:5870`, `:5907`, `:5922` |
| 08-H4 | `getContext().maxContext` = `Number(max_context)`, the textgen slider whatever the API (wrong on CC). Not used as the budget | `st-context.js:134` | `:133` |
| 08-H5 | Generate passes `getMaxPromptTokens()` to every interceptor on non-dry runs (`runGenerationInterceptors(coreChat, this_max_context, type)`); ours receives it as `_contextSize` | `script.js:4560-4564`; `extensions.js:2024`, `:2037` | `script.js:4505` |
| 08-H6 | `getTokenCountAsync(str, padding)` is on the context; with tokenizer BEST_MATCH (99) on a connected textgen backend it asks the backend's tokenizer (a network call); the count is cached per chat | `st-context.js:151`; `tokenizers.js:37`, `:443`, `:461` | `st-context.js:150` |
| 08-H7 | Extension prompt shape `{value, position, depth, scan, role, filter}`; `extension_prompt_types` NONE -1 / IN_PROMPT 0 / IN_CHAT 1 / BEFORE_PROMPT 2; roles SYSTEM 0 / USER 1 / ASSISTANT 2 | `script.js:484-489`, `:494-498`, `:8926-8935`; exposed as `getContext().extensionPrompts` (`st-context.js:152`) | `script.js:483`, `:8866`; `st-context.js:151` |
| 08-H8 | Assembly: `Object.keys(extension_prompts).sort()` per position/depth/role, a block whose `filter()` answers false is skipped, values joined with the separator | `script.js:3302-3320` (`getExtensionPrompt`) | not re-read |
| 08-H9 | `/inject` stores its blocks under `script_inject_<id>` | `slash-commands.js:3773` | not re-read |
| 08-H10 | Parametric macros through the `MacrosParser` seam: **no** on either engine. The bridge registers a zero-argument macro ("only `{{key}}` without arguments is valid"), and legacy substitution is an exact `{{key}}` regex | `macros.js:81-118`, `:183-207`, `:684` | bridge present, same contract |
| 08-H11 | A new-engine macro name must match `/^[a-zA-Z][\w-_]*$/`; our quality keys are `[a-z0-9_]` and prefixed `story_quality_`, so every valid key is a valid name | `macros/engine/MacroLexer.js:17`, `MacroRegistry.js:693-697` | `MacroLexer.js:17` |
| 08-H12 | `ConnectionManagerRequestService.sendRequest(profileId, …)` resolves the profile per request (`getProfile(profileId)`), so two passes can go to two profiles with no global switch | `extensions/shared.js:423-431`, `:546` | not re-read (plan 03 03-H1 covers the call) |

Line drift vs the plan's table: none beyond `:3449` for the command name (the plan cites the block `:3448-3503`).
