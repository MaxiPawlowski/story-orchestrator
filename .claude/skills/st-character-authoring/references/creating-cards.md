# Creating, editing and removing cards (UI, STscript, REST, our wizard)

Open this when you need to create a character or group **from code or a test**, edit a card without the UI, or clean up after a run. Path convention: `st:` means `C:\dev\SillyTavern-MainBranch\`. Bare paths are relative to this extension's root.

## 1. Pick a path

| Path | Use when | Notes |
|---|---|---|
| **Wizard provisioning** (`applyProvisioning`) | You are testing the product path (J9), or an author is building a story | Create-only, validated in code, and only exposes a subset of fields (§6) |
| **In-page `POST /api/characters/create`** (JSON) | Throwaway test cards in a live run. Fastest, with no popup and no chat switch | The same call `src/services/stHost/provisioning.ts:63` makes. Body = `templates/create-body.json` |
| **In-page `POST /api/characters/import`** (multipart) | You want a full V2 JSON (alternate greetings, extension objects) created as-is | Body = `templates/test-card.v2.json` as a file |
| **`/char-create …`** (STscript) | Quick manual creation from the chat bar or a QR | Opens the new character by default (`select=true`). Pipe hazard in values (§3) |
| **UI** | A human is doing it | Character Management → **Create New Character** (`#rm_button_create`, user-plus icon), **Import Character from File** (`#character_import_button`), **Import content from external URL** (`#external_import_button`). Book icon (`#advanced_div`) → Advanced Definitions (verified: st:public/index.html:6073, 6370-6372) |

The file importer accepts `.json, .png, .yaml, .yml, .charx, .byaf` (verified: st:public/index.html:6362, st:src/endpoints/characters.js:1567-1574). Community tip: closing the new-character panel mid-edit loses nothing. Click Create New Character again (community-reported, 2024-09).

## 2. REST endpoints (all `POST`, all need `ctx.getRequestHeaders()`)

| Endpoint | Body | Returns |
|---|---|---|
| `/api/characters/create` | Flat form model (see `card-fields.md` §3). JSON, or multipart with an `avatar` image | Avatar filename as **text** (verified: st:src/endpoints/characters.js:1024-1051) |
| `/api/characters/import` | multipart: `avatar` = the file, `file_type` = `json`/`png`/…, optional `preserved_name` | `{ file_name }` **without** `.png`, or **HTTP 200 with `{ error: true }`** on failure. Check `.error`, not just `.ok` (verified: st:src/endpoints/characters.js:1560-1599). The multipart field must be named `avatar` (verified: st:src/server-main.js:269) |
| `/api/characters/merge-attributes` | `{ avatar: "X.png", …partial card… }`. Deep-merges and **validates against V1/V2**. Supports bulk `{ avatars: [], data, filter }` and the `"__@@UNSET@@__"` sentinel to delete a key | 200 or 400 with the validation error (verified: st:src/endpoints/characters.js:1243, 1276-1304, 1328-1414) |
| `/api/characters/edit-attribute` | `{ avatar_url, ch_name, field, value }`. Top-level keys only (`char[field]` and `char.data[field]`), so nested extension fields are out of reach | 200 (verified: st:src/endpoints/characters.js:1193-1232) |
| `/api/characters/edit` | The full form model plus `avatar_url`, `chat`, `create_date` (what the UI sends) | 200 (verified: st:src/endpoints/characters.js:1101-1140) |
| `/api/characters/delete` | `{ avatar_url, delete_chats: true }` | 200 (verified: st:src/endpoints/characters.js:1416-1450) |

After any write, call `await ctx.getCharacters()`. It reloads characters **and** groups (verified: st:public/scripts/st-context.js:230, st:public/script.js:1294-1327). With `performance.lazyLoadCharacters: true` in `config.yaml`, entries in `ctx.characters` are shallow (no description and so on). Use `ctx.unshallowCharacter(...)` or `/char-get` to read full fields (verified: st:src/endpoints/characters.js:35, 1470; st:public/scripts/st-context.js:298).

## 3. STscript character commands

All verified in st:public/scripts/slash-commands.js. Named-arg names are at 773-906.

- `/char-create name=… description=… firstMessage=… personality=… scenario=… messageExamples=… creatorNotes=… systemPrompt=… postHistoryInstructions=… creator=… characterVersion=… tags="a,b" favorite=… talkativeness=… world=… depthPrompt=… depthPromptDepth=… depthPromptRole=… avatar=… select=true` returns the avatar key (908-954). Alternate greetings are always `[]` (5229).
- `/char-update [char=…] <same fields>` (955-999). `/char-duplicate` (alias `/dupe`) (1001-1045). `/char-get [char=…] [field=…] [return=…]` (alias `/char-data`) (1046-1110). `/char-delete [char=…] deleteChats= silent=` (1111-1136). `/char-find` (708).
- **Pipe hazard**: without the `STRICT_ESCAPING` parser flag, a bare `|` ends a quoted value (verified: st:public/scripts/slash-commands/SlashCommandParser.js:969-972, 1235-1245). A TwoList summary line (`[a|b|c]`) passed as `description="…"` gets cut. Escaping rules are in the `st-scripting` skill. For those cards, prefer the REST path.
- Tags given to `/char-create` are embedded card tags, not ST folder tags. Use `/tag-add` for those (verified: st:public/scripts/slash-commands.js:933, st:public/scripts/tags.js:2352).

## 4. Throwaway test characters: recipe

**Name them with a marker prefix that is not an English word**, e.g. `SOTEST <Name>` (see SKILL.md → Naming). Then:

```bash
# create from the template (Git Bash; the JSON is inlined into the snippet)
node scripts/debug/st-eval.mts "const body = $(cat .claude/skills/st-character-authoring/templates/create-body.json); const r = await fetch('/api/characters/create', { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify(body) }); const avatar = (await r.text()).trim(); await ctx.getCharacters(); return { status: r.status, avatar };"

# or import the full V2 card as a file
node scripts/debug/st-eval.mts "const card = $(cat .claude/skills/st-character-authoring/templates/test-card.v2.json); const fd = new FormData(); fd.append('avatar', new File([JSON.stringify(card)], 'card.json', { type: 'application/json' })); fd.append('file_type', 'json'); const r = await fetch('/api/characters/import', { method: 'POST', headers: ctx.getRequestHeaders({ omitContentType: true }), body: fd }); const out = await r.json(); await ctx.getCharacters(); return out;"

node scripts/debug/st-navigation.mts open-character "SOTEST Brannoc"   # open a solo chat
node scripts/debug/so-assets.mts list --marker SOTEST                  # what exists
node scripts/debug/so-assets.mts remove --marker SOTEST                # delete + leak re-check
```

- To vary the card, edit a copy of the template's `ch_name`/`description`. Don't hand-build a body from scratch. The coercions in `card-fields.md` §3 bite.
- Journeys: set `cleanup.removeCreatedAssets: "<MARKER>"` in the journey file, as `test/journeys/j9-wizard.journey.json` does with `SO-J9`. The runner deletes in `finally` and fails the run on a leak.
- Card-embedded lorebooks (`character_book`) raise a blocking confirm popup on first open (see `card-fields.md` §2). Keep them out of test cards and link a separately created lorebook instead (the `st-lorebook-authoring` skill).

### `so-assets.mts` semantics (read before running `remove`)

- It matches a name if it **starts with** the marker (case-insensitive), **or** if it is in the created-asset ledger (`wizardSessions[].applied`) of a **test** session. A test session is one whose key starts with the slugged marker (`SO-J9` → `so-j9-wizard`). A real author's sessions are never read (verified: scripts/debug/so-assets.mts:38-86).
- A journey passes the baseline it took at start (`snapshotAssets`). That adds ledger entries recorded during the run in *any* session, and it spares any asset that existed before the run, even when a test ledger names it. Those show up under `protected`.
- It deletes groups first, then characters (`delete_chats: true`), then lorebooks, and deselects the deleted lorebooks. Then it drops only the test sessions. With a baseline, the sessions go back to exactly what the run found, minus the marker's (verified: scripts/debug/so-assets.mts:89-144).
- An empty `--marker` is refused. Run `list` first: `ledger` names each ledger entry's session and why it counts (`test-session` / `this-run`).
- Standalone `remove` (no baseline) trusts a marker-keyed session's whole ledger. That is how a crashed run's leftovers get cleaned, but it would also delete a hand-made asset that later took the same name. Read `list` before `remove`.

## 5. Groups

- Body (what the UI sends): `{ name, members: [avatar filenames], avatar_url, allow_self_responses, activation_strategy, generation_mode, disabled_members: [], fav, chat_id, chats: [chat_id], auto_mode_delay }` (verified: st:public/scripts/group-chats.js:2087-2132). The server fills defaults and returns the group object with `id = String(Date.now())` (verified: st:src/endpoints/groups.js:156-188).
- `activation_strategy`: `0` Natural, `1` List, `2` Manual, `3` Pooled. `generation_mode`: `0` Swap, `1` Join (exclude muted), `2` Join (include muted) (verified: st:public/scripts/group-chats.js:122-133, st:public/index.html:6257-6272).
- **Members are avatar filenames**, not names. Resolve through `ctx.characters` first. `createGroup` in `src/services/stHost/provisioning.ts:76-86` does exactly that and refuses unknown names.
- Disabling members mutates the group itself, and that change outlives sandbox chats (see `.claude/rules/debug-scripts.md`).

## 6. Our wizard's provisioning (project hooks)

- Op shape: `{ kind: "createCharacterCard", name, description, personality?, scenario?, first_mes?, mes_example?, tags? }` (`src/wizard/types.ts:19`). The wizard **cannot** set alternate greetings, the Character's Note, talkativeness, system prompt or PHI. `createCharacterCard` hard-codes `talkativeness "0.5"`, `depth_prompt 4/system`, `creator "Story Orchestrator"`, and `creator_notes "Created by the Story Orchestrator wizard."` (`src/services/stHost/provisioning.ts:40-68`).
- Validation (`src/wizard/provisioning.ts:73-77`): the name must be non-empty, the description must be non-empty ("an empty card is not playable"), and the name must not already exist (trim plus lowercase compare against `getAllCharacterNames()`, `src/services/stHost/characters.ts:29`). The same guard runs in the review card and in `copilotCoordinator.applyProvisioning` (`src/runtime/coordinators/copilotCoordinator.ts:51-58`).
- The model-facing grammar and stage text are `src/copilot/prompts.ts:44-54, 70`, parsed at `src/copilot/parse.ts:415-426`. Improve card quality there, following the rules in SKILL.md → "Writing the wizard's character prompt".
- **Join keys** between a story and ST:
  - `requirements.members` is compared against the group's member **avatar basenames** (`Name.png` becomes `Name`) (`src/runtime/requirements.ts:15-19`, `src/services/stHost/selectors.ts:58-64`).
  - The roster and talk control compare against card **display names**, case-insensitively (`src/runtime/roster.ts:49-54`, `src/services/stHost/groups.ts:13-25`).
  - Both break when the server sanitizes a name or suffixes a duplicate filename (`card-fields.md` §2). `createCharacterCard` returns the *requested* name, not the stored one (`src/services/stHost/provisioning.ts:67`).

## 7. Character management tips (community)

- **Location hubs with tag folders**: turn on User Settings → **Tags as Folders** (verified: st:public/index.html:5156-5158). Set a location tag (e.g. `School`) to a **closed** folder in Tag Management and give it to every character who belongs there. Use **open** folders for sub-locations. Folder types are `OPEN` / `CLOSED` / `NONE` (verified: st:public/scripts/tags.js:316-321). The tip calls the setting "show tags as folders" and doesn't mention that tags must be marked as folders in Tag Management (community-reported, 2024-09).
- Mobile: if the character panel covers the chat, tap the character icon in the top bar to close it (community-reported, 2024-09).

## 8. Troubleshooting

| Symptom | Cause |
|---|---|
| Created card name differs from what you sent | Server `sanitize-filename` (`card-fields.md` §2) |
| Second card got avatar `Name1.png` | `/create` never rejects duplicates. Check `ctx.characters` first |
| `fav`/`talkativeness`/`extensions` values ignored | Form-model coercions (`card-fields.md` §3) |
| Import "succeeded" but no card | `/import` returned `{error:true}` with HTTP 200 |
| New chat has no greeting | `first_mes` is empty and there are no alternates (by design) |
| Fresh group chat opens with several greetings | Every member with a `first_mes` greets (SKILL.md → Groups) |
| Popup "This character has an embedded World/Lorebook" blocks a scripted run | The card has `character_book`. Remove it or answer the popup |
| Card fields read as `undefined` in `ctx.characters` | Lazy-loaded shallow characters. Unshallow first |
| Requirement "member missing" although the character is in the group | The avatar basename differs from the required name (§6) |
