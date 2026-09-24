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
