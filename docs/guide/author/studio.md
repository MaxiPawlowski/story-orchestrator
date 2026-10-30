# Checkpoint Studio

The Studio is the visual editor for a story. Open it from the settings panel (**Author → Open Studio**) or, in a
chat that plays a story, from the drawer's **Edit story** (Author view). From the drawer it edits the copy this chat
plays.

## Pages

The left column lists every page, grouped: Story, Flow (Graph, Checkpoints, Transitions, Chapters), State (Qualities,
Game, Story rules), Characters (Roster, one page per cast member, Sprites), World, Presentation, Story features,
Wizard and Diagnostics (with the issue count). On a narrow screen the column becomes one **Section** list with a back
button.

| Page | What you edit |
|---|---|
| Graph | The story as a map of scenes and exits, with the selected checkpoint's editor beside it (a sheet on a narrow screen). Exit labels read the gate in quality names; hover one for the raw gate. |
| Story | Title, description and id, the player introduction, dramatic shape, requirements, thread bridges, the curator's lorebook scope, illustrations. |
| Qualities | The facts the story tracks, with their rubrics and how they are read. |
| Checkpoints | The scenes, in sections (Basics, Player sees, Pacing, State, Effects, Cast, Stretch, Offers, Agency, Scope) with an index at the top. Effects are added from **Add effect**; offers are rows, with **Edit as JSON** for the raw list. |
| Transitions | The exits between scenes and the condition (gate) that opens each one. |
| Roster | The cast list and the cast-wide parts (factions, the player card). Open a character for their identity, voice, relationship labels, promises, cues and topics, and the motives each checkpoint gives them. |
| Story features | One row per feature with a switch; a changed row shows a reset. **Changed** filters to what this story sets. |
| Diagnostics | Every problem the Studio finds, with what the story loses because of it and **Go to** for the field. |
| Wizard | The setup wizard (when it is turned on under Authoring): mode at the top, steps numbered. See [The setup wizard](wizard.md). |

The header holds the title (click to rename), the issue count (opens Diagnostics), Undo, Redo, **How to write this**
(the page's guide topics, each opening the guide reader), **Save** and a menu with Save As, Export JSON, Import JSON,
Copy Mermaid source and Reset draft.

## What players see

The Studio's **Player introduction**, **Public scene name** and **Public situation** are the text shown in the
player's recap and drawer. The checkpoint name and objective are author-facing. For stories written before these
fields existed, the library description serves as the introduction, and without a public scene name the player sees
"Current scene".

## Diagnostics

Every check says first what goes wrong in play ("The story never reads as ready: …"), then the technical detail.
Fix the errors before you play; warnings are worth reading. The guide topic named in each check explains it.

## Saving

**Save** writes the story to your library (`Saved "X" to the library.`). The header says `Unsaved` while
there are changes. Stories carry no version number: a chat tells that the library holds a different copy by its
content.

Saving does not switch other chats to the edited story; each chat keeps the copy it plays, and Author view shows
**Update to the latest** in that chat's drawer. When you save from the chat that plays the story:

- a compatible edit is applied there at once (`Applied to this chat: …`);
- an edit that invalidates progress asks whether this chat should **Keep playing** (only the parts that no longer
  exist are dropped), **Restart story**, or **Cancel**. The edit is in the library either way.

Export and import live in the Studio header menu, so a story can be shared as a JSON file.

---

[Author's guide](README.md)
