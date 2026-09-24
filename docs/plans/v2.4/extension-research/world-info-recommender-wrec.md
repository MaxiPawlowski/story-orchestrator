# World Info Recommender (WREC) — v2.4 review

meta: author weather (bmen25124) · repo github.com/bmen25124/SillyTavern-WorldInfo-Recommender · commit `357e80f` (2026-06-09) · 121 upvotes / 2084 msgs · source available: y (src/ 7.4k lines, React + vite, depends on `sillytavern-utils-lib`, which is not vendored in the clone, so `getWorldInfos`/`buildPrompt`/`Generator` bodies are unread)

## What it is
An author-side, on-demand LLM tool for writing and revising World Info. You open a popup (a button in the character/group panels, or `/world-info-recommender-popup-open`), pick a Connection Manager profile, the lorebooks and entries to send, and a message range, then type an instruction. The model proposes new or updated entries. You accept, edit, continue, revise, compare or blacklist each one, or "Add all". A second mode, "Revise sessions", is a chat with the LLM about one entry or the whole selected set. Each turn returns structured ops (add/change/remove) with per-turn state snapshots, and Apply writes the final state. A headless `/wir-run` slash command does the same with an allowlist of ops and entries. It never runs during play, never injects anything and has no chat-event hooks.

## How it works
- **Boot / capability gate**: `src/index.tsx:76-83` refuses to start unless the context exposes `ConnectionManagerRequestService`, `getCharacterCardFields`, `getWorldInfoPrompt` and `reloadWorldInfoEditor`. It then mounts the settings React root into `#extensions_settings` (`index.tsx:14-31`) and prepends an icon to `.form_create_bottom_buttons_block`, `#GroupFavDelOkBack` and `#rm_buttons_container` (`index.tsx:37-73`).
- **Context assembly (main flow)**: `src/generate.ts:132-262`. Handlebars templates are filled from `templateData` (`currentLorebooks`, `suggestedLorebooks`, `blackListedEntries`, `userInstructions`), then passed through `substituteParams`. A user-editable "main context template preset" sets the block order and role (`settings.ts:233-273`: chatHistory, stDescription, currentLorebooks, blackListedEntries, suggestedLorebooks, responseRules, taskDescription). Chat history comes from utils-lib `buildPrompt(selectedApi, {messageIndexesBetween, …})` (`generate.ts:221`; the range is set from all/first/last/range at `MainPopup.tsx:300-322`). Entries are shown with `(ID: {{entry.uid}})` (`constants.ts:92-102`).
- **LLM call**: `ConnectionManagerRequestService.sendRequest(profileId, messages, maxResponseToken)` with a message array (`generate.ts:266`).
  - Continue mode prefills an unterminated assistant XML (`getPrefilledXML`, `xml.ts:70-78`) and concatenates it before parsing (`xml.ts:24-26`).
  - Revise mode sends the full entry as an assistant turn plus the instruction as a user turn (`generate.ts:247-259`).
- **Output parsing**: XML `<lorebooks><entry><worldName/><id/><name/><triggers/><content/>` via fast-xml-parser (`xml.ts:16-67`). A cheap balanced-tag check rejects truncated output (`xml.ts:28-33`). A missing `id` gets a random 6-digit uid (`xml.ts:53`).
- **Revise sessions**: `request.ts:81-157` `makeStructuredRequest` has three tiers: `native` = `overridePayload.json_schema` (zod→JSON schema, `request.ts:94-103`); `json`/`xml` = a prompt carrying the schema plus an example generated from it (`schema-to-example.ts:33-40`). The lenient parser strips code fences and unwraps the `<item>` wrappers LLMs add (`parsers.ts:17-110`). The result is then validated with zod (`request.ts:147-155`).
  - Global ops are grouped `add[]/change[]/remove[]` "because it is easier for LLMs than a discriminated union" (`revise-types.ts:21-50`).
  - Every assistant turn stores a `stateSnapshot`. After a change the extension appends a hidden system "state update" message listing only the added/modified/removed entries (`ReviseSessionChat.tsx:183-282`).
  - A manual edit becomes a user turn, "I made a change manually.", carrying its snapshot (`ReviseSessionChat.tsx:568-585`).
  - Deleting a message truncates everything after it, which rewinds state (`ReviseSessionChat.tsx:545-566`).
  - A "Readonly" toggle turns a turn into a plain discussion with no ops (`ReviseSessionChat.tsx:359-376`).
- **Writes**: an entry is created with `st_createWorldInfoEntry` (ST `createWorldInfoEntry`), and `{entries}` is rebuilt from the in-memory list. Then `saveWorldInfo(name, {entries})` runs **without `immediately`**, followed by `reloadWorldInfoEditor(name, true)` (`MainPopup.tsx:246-258`, `commands.ts:542-549`).
  - Change detection compares content, comment and sorted keys and reports `unchanged` (`MainPopup.tsx:80-90`).
  - Only `key/content/comment` are written. Every other activation field is left alone (`MainPopup.tsx:98-102`), except in the slash path, which clones the **last entry's** fields onto a new one (`generate.ts:351-358`).
- **Headless**: `/world-info-recommender-run profile= lorebooks=[…] allowed-ops=[add,update] editable-entries=[World.Comment|World.UID] messages=last:N` (`commands.ts:95-212`). It filters in code at apply time (`commands.ts:445-538`). A suggestion for an unknown world is **re-targeted to the first allowed book** (`commands.ts:458-470`).
- **Persistence**: settings in `extension_settings.worldInfoRecommender` through utils-lib `ExtensionSettingsManager`, with a chained `F_1.0→F_1.4` migration that upgrades a prompt only while it is still the default (`settings.ts:307-431`).
  - Popup session (suggestions, blacklist, selection) goes to **IndexedDB via `SillyTavern.libs.localforage`**, keyed by character avatar or group id (not by chat), with a one-shot migration from localStorage (`main-session-storage.ts:25-68`, `MainPopup.tsx:65,131`).
  - Revise sessions are stored under one localforage key, sanitized on load (`revise-session-storage.ts:39-107`).
- **Mutation handling**: none. No swipe/edit/delete/rollback awareness, because it never touches chat state.
- **Tests**: vitest for the parser's tolerance for wrapped arrays and fences, and for storage migration against injected fake storage (`src/test/*.test.ts`).

## Overlap with Story Orchestrator
- **WI curator** (`src/stagecraft/*`, `runtime/coordinators/stagecraftCoordinator.ts`) is our play-time counterpart. Ours is stricter: allowlist `stagecraft.lorebooks` minus gated entries, re-checked at the write edge (`stagecraft/scope.ts:24`); boundary-applied, journaled, revertible, `RunToken`-owned; line grammar `[enable]/[disable]/[rewrite]/[patch]` built for small models (`stagecraft/prompt.ts:8`); `first||last` patch instead of whole-entry rewrite. WREC has **create** and **remove**, which we deliberately lack (baseline §4; F5 seed).
- **Wizard lorebook provisioning** (`wizard/provisioning.ts`, `stHost/worldInfo.ts:136`) overlaps WREC's "suggest entries for this story" main flow. Our per-op review cards also exclude bulk accept, whereas WREC has "Add all" (`MainPopup.tsx:436-470`).
- **Saves**: we save WI with `immediately=true` (`stHost/worldInfo.ts:56`) and check book existence through `world_names`. WREC relies on the debounced save and on `loadWorldInfo` truthiness (`commands.ts:248`) — exactly our documented dummy-book trap.
- **Where WREC is better**:
  - Word-level diff for "update existing" (`CompareEntryPopup.tsx:13`, `CompareStatePopup.tsx`).
  - A rejected suggestion is remembered and fed back as a "don't suggest" list.
  - Entries are addressed by uid in the main flow.
  - The author can iterate conversationally on one entry with rewindable snapshots.

## Ideas for v2.4

| # | idea | kind | our area | our state | value | effort |
|---|---|---|---|---|---|---|
| 1 | Rejected-op memory in the curator prompt | pattern | stagecraft | absent | 3 | S |
| 2 | Curator ops address entries by uid; ambiguous or prefix title match is dropped | enhancement | stagecraft | partial | 3 | S |
| 3 | Word diff (before → after) on curator review cards | ux | stagecraft / player-ui (author view) | partial | 3 | S |
| 4 | `requirements.lorebooks` satisfied by chat-, character- or persona-bound books, not only global | host-integration | host / wizard | absent | 3 | M |
| 5 | Wizard: "discuss only" turn + delta note after manual Studio edits | ux | wizard | partial | 2 | S |
| 6 | Anti-pattern set: bulk apply, silent re-target, debounced save, name-keyed remove, clone-neighbour fields | anti-pattern | stagecraft / wizard | present (we avoid all) | 2 | S |

**1. Rejected-op memory.**
- *What*: put the last N author-rejected curator ops for this chat (target plus a short text hash or summary) into `buildWiCuratorPrompt` as a list headed "the author declined these; do not propose them again".
- *Theirs*: a blacklisted suggestion is added to the session (`MainPopup.tsx:498-510`) and rendered by `DEFAULT_BLACKLISTED_ENTRIES` (`constants.ts:104-109`) into every later prompt.
- *Ours*: `CuratorScope` has no such field (`stagecraft/types.ts:53-60`), and the prompt lists only entries (`stagecraft/prompt.ts:8-45`). Rejected records already sit in the proposal ring (`CuratorOpStatus "rejected"`, `types.ts:68`), so the data exists. The curator re-proposes the same declined patch every pass, which is noise in review mode.
- *Fit*: invariant 6 is unaffected (it still only proposes). It must derive from the per-chat ring so a rollback drops the rejection with the ring. Bound it to a few lines (request-size seed).

**2. Address by uid.**
- *What*: show each entry as `#<uid> "title"` and accept `[patch] #12 …`. An unknown uid, or a title matching more than one entry, is dropped with a reason.
- *Theirs*: `(ID: {{entry.uid}})` in the context (`constants.ts:97`) and `<id>` in the XML (`xml.ts:53`). They also show the failure mode when names are used instead: revise ops find the target by `comment` and take the first match (`ReviseSessionChat.tsx:52,62`).
- *Ours*: `stagecraft/parse.ts:18-19` does an exact title match, then a **bidirectional `startsWith` fallback**. "Harbor" can therefore resolve to "Harbor Master", and duplicate titles resolve to whichever is first.
- *Fit*: `isCuratorWritable(story, lorebook, comment)` stays the write-edge check. Resolve uid→comment first and re-check, so no widening. Keep the title as the fallback only when it is unique and exact.

**3. Word diff on review cards.**
- *What*: render a before/after word diff on `[rewrite]`/`[patch]` cards and on the wizard's entry edits.
- *Theirs*: `diffWords` from the `diff` package with added/removed spans (`CompareEntryPopup.tsx:11-30`); a global added/removed/changed grid (`CompareStatePopup.tsx:135-180`).
- *Ours*: `proposal.ts:86` already records `before.content`, and `previewCuratorOp` computes the patched `content` (`proposal.ts:49-60`). But the card shows only an editable textarea of the op text (`components/drawer/StagecraftPanel.tsx:~96`), so the reviewer cannot see what a patch does to the whole entry.
- *Fit*: author-only (invariant 9). A small word-LCS in `utils/` avoids a dependency. It needs a Storybook story (a11y: not colour-only, so use `<ins>/<del>`).

**4. Non-global lorebook sources.**
- *What*: a book counts as active for `requirements.lorebooks` when it is bound to the chat (`chat_metadata.world_info`), the character (primary plus extra books), each group member, or the persona.
- *Theirs*: the popup aggregates `getWorldInfos(['chat','persona','global'])` plus `['character']` for each group member (`MainPopup.tsx:154-168`). The helper body is in utils-lib and unread, so the scopes are evidenced but the lookup is not.
- *Ours*: `runtime/requirements.ts:20` checks only the global selection (`stHost/worldInfo.ts:176-185`). The gotchas record the cost: journeys must activate books install-wide, and the wizard's `createLorebook` must globally activate the book it just made, which touches every other chat.
- *Fit*: chat-binding a story's lorebook is the more private default. We already chat-bind the memory mirror (`bindChatLorebook`). ST paths must be verified in source before use (invariant 2). Invariant 14 is unaffected, because gating is per entry in the file regardless of binding.

**5. Wizard discuss-only turn + delta note.**
- *Theirs*: the Readonly toggle sends a plain request with a "discuss without changes" system line (`ReviseSessionChat.tsx:359-376`). A manual edit becomes a user turn plus a delta-only system note (`:183-282`, `:568-585`).
- *Ours*: the wizard sends the whole draft each run (`StudioCopilot.tsx:135`) but never tells the model what the author changed by hand since its last proposal, and it has no "just talk" mode. The interview covers part of this: `status:"questions"`.
- *Fit*: cheap. A delta note derived from the `draft.ts` undo history would avoid the copilot re-proposing what the author just reverted. Low value until the human wizard sessions (J9.6/J9.7) say it matters.

**6. Anti-patterns WREC exhibits.** All six are listed under §Patterns below. We already avoid every one of them, so this row is confirmation, not work.

## Patterns to copy / anti-patterns to avoid
**Copy**
- A declined suggestion becomes negative context for the next ask (#1).
- Address by stable id, not display name (#2).
- Show a diff before the author commits a change to existing text (#3).
- Grouped `add[]/change[]/remove[]` op arrays instead of a discriminated union, for weak models (`revise-types.ts:21-50`). It matches our "one line per op kind" grammar.
- Migrate a settings prompt only while it is still the default and keep a custom one (`settings.ts:346-354`, `386-397`). This is useful if we ever expose editable prompts.
- A capability gate on the context members the extension needs before it boots (`index.tsx:76-83`). It is the same idea as our `capabilities.ts` probes, but coarser.

**Avoid (we already do; keep it that way)**
- "Add all" bulk apply behind one confirm (`MainPopup.tsx:436-470`) → our per-op cards and the provisioning bulk exclusion.
- A silent re-target of an op aimed at an unknown book to the first allowed book (`commands.ts:458-470`) → we drop unknown targets.
- A debounced `saveWorldInfo` (`MainPopup.tsx:256`, `commands.ts:547`). ST sets the cache at once and POSTs later (`world-info.js:4177-4192`), so a reload in between loses the write while the UI says "Entry added".
- Rebuilding the book as `{entries}` only on save (`MainPopup.tsx:255`), which drops any other top-level book fields.
- `loadWorldInfo(name)` truthiness as an existence check (`commands.ts:248`). A typo'd `lorebooks=[…]` passes, and the save then writes an unlisted file.
- Change and remove keyed by `comment`, first match (`ReviseSessionChat.tsx:52,62`).
- A new entry inheriting the last entry's activation fields (`generate.ts:351-358`): constant, probability, sticky or position leak from an arbitrary neighbour, and the UI path differs (`MainPopup.tsx:92-96` uses the template).
- A random uid for an id-less XML entry (`xml.ts:53`), which can collide with a real one.
- XML/JSON-schema output as the only contract. The author's own FAQ says 8B/12B RP models fail it (`readme.md` FAQ). Our line grammar plus reasoning stripping is the right call for the Gemma/Artemis class.

## ST host facts learned
- `saveWorldInfo(name, data, immediately=false)` updates `worldInfoCache` **synchronously**, then debounces the POST to `/api/worldinfo/edit`. `WORLDINFO_UPDATED(name, data)` is emitted only after the POST (`world-info.js:4151-4192`). Consistent with our `immediately=true` usage (`stHost/worldInfo.ts:56`).
- `createWorldInfoEntry(_name, data)` ignores the name, picks a free uid from `data`, **mutates `data.entries`** with a clone of `newWorldInfoEntryTemplate`, and returns the entry (`world-info.js:4137-4148`).
- `getContext().reloadWorldInfoEditor` is `reloadEditor(file, loadIfNotSelected)`. It triggers `change` on `#world_editor_select` only if `file` is in `world_names` (`world-info.js:1040-1046`, `st-context.js:280`). This is a UI refresh, not a cache eviction, so it does not fix the stale-cache gap in `so-assets` cleanup.
- `getContext()` exposes `CONNECT_API_MAP` (`st-context.js:285`), `getWorldInfoPrompt` (`:283`), `getCharacterCardFields` (`:232`) and `substituteParams` (`:163`). WREC maps a profile's `api` to `CONNECT_API_MAP[api].selected` to build a prompt (`generate.ts:152`).
- `SillyTavern.libs.localforage` (IndexedDB) is available to extensions (`public/lib.js:9,89,117`; used at `main-session-storage.ts:25`). This is an option for large install-wide blobs outside `settings.json`. Not needed today.
- `ConnectionManagerRequestService` accepts a `json_schema` in its override/custom payload (`custom-request.js:54,490`), which is how WREC's "native" tier works. **Caution, matching our memory note**: llama.cpp ignores `json_schema` when ST also sends a grammar, so native structured output is backend-dependent.
- `loadWorldInfo` is used as an existence check in WREC (`commands.ts:248`). This **confirms, not contradicts**, our gotcha that it answers a missing name with a cached dummy. WREC carries that bug.

## Verdict
Relevance **medium**. WREC is an author-side lorebook writer with no play-time machinery, so it adds nothing to the engine, memory or turn path, and its host usage is looser than ours. The one thing worth taking is **#1 plus #2 together, as one small curator change**: remember what the author declined and address entries by uid. Both cut review noise and a real mis-target risk (`stagecraft/parse.ts:19` prefix fallback) without touching any invariant. #3, the diff on cards, is the next cheapest UX win.
