# Macros and slash commands

## Macros

Use these in cards, the author's note, presets or lore entries. They read the story this chat plays and update as it
moves. With no story, each answers a placeholder such as `(none)` or `(unknown)`.

| Macro | Expands to |
|---|---|
| `{{story_title}}` / `{{story_description}}` | Story title / description |
| `{{story_current_checkpoint}}` | Active checkpoint name and objective |
| `{{story_past_checkpoints}}` | Visited anchor names |
| `{{story_possible_transitions}}` | Outgoing transitions with their gate text (spoils; author use) |
| `{{story_tension}}` | Current tension level |
| `{{story_player_name}}` | Player persona name |
| `{{story_role_<id>}}` | Card name of the cast member with roster id `<id>` |
| `{{story_quality_<key>}}` | The current value of quality `<key>`. With SillyTavern's new macro engine, `{{story_quality::<key>}}` works too |
| `{{story_scene_location}}` / `{{story_scene_time}}` / `{{story_scene_present}}` | Where, when and who is present, from the judge's scene tracker (`(unknown)` without it, or while the memory holds a conflict about it) |
| `{{story_blackboard}}` | Compact memo of every tracked quality |
| `{{story_canon}}` | The derived canon summary |
| `{{story_memory_<tier>}}` | One memory tier: `facts`, `session_details`, `short_term`, `scene_history` |
| `{{story_epistemic}}` / `{{story_ledger}}` | The active speaker's private knowledge / the state ledger |
| `{{story_chapter}}` / `{{story_chapter_number}}` | Current chapter title / number (stories with chapters) |
| `{{story_so_far}}` | Chronicle + this chapter + open threads |
| `{{story_previously}}` | The last ended chapter's summary |

The extension already injects memory, private knowledge, pacing and scene facts into the prompt on its own; the
macros are for placing that text somewhere specific.

## Slash commands

| Command | Who | What |
|---|---|---|
| `/story recap \| threads \| chapters \| chapter <n> \| chronicle export \| flag [note]` | everyone | The player view; see [Starting, continuing and restarting](../player/playing.md#the-story-command). |
| `/so-mem list \| pin <n> on\|off \| exclude <n>` | everyone | Memory management from the chat box. |
| `/so-mem backlog` | Author view | Memorize the chat history. |
| `/cp list \| state \| activate <id> \| set <quality> <value> \| converge` | Author view | Inspect and steer the story. Spoils it. |
| `/cp memorize` | Author view | Read the chat history into memory. |
| `/cp chapters \| seal \| unseal <recordId>` | Author view | Chapter records: list them, end the current chapter now, undo the newest seal. |
| `/cp extract [response] \| expand [response]` | Author view | Debug: run a read or an expansion now. |
| `/so-image scene\|portrait\|background\|free [text]` (alias `/direct`) | everyone | Illustrate now, when images are set up. |

In player mode `/cp` answers with one line pointing to `/story recap` and does nothing else.

---

[Author's guide](README.md)
