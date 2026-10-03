# Checkpoint Studio

The Studio is the visual editor for a story. Open it from the settings panel (**Author → Open Studio**) or, in a
chat that plays a story, from the drawer's **Edit story** (Author view). From the drawer it edits the copy this chat
plays.

## Tabs

| Tab | What you edit |
|---|---|
| Graph | The story as a map of scenes and exits. Click a node to edit it. |
| Story | Title, description, id and version, the player introduction, dramatic shape, requirements, thread bridges, the curator's lorebook scope, illustrations. |
| Qualities | The facts the story tracks, with their rubrics and how they are read. |
| Checkpoints | The scenes: objective, tension target, guidance, and what happens on arrival (lore, author's note, background, cast changes, scripted lines). |
| Transitions | The exits between scenes and the condition (gate) that opens each one. |
| Roster | The cast: card names, roles, aliases, drives. |
| Diagnostics | Every problem the Studio finds, with what the story loses because of it. |
| Wizard | The setup wizard (when it is turned on under Author services). See [The setup wizard](wizard.md). |

Each editor has a **How to write this** section with the matching topic from this guide.

## What players see

The Studio's **Player introduction**, **Public scene name** and **Public situation** are the text shown in the
player's recap and drawer. The checkpoint name and objective are author-facing. For stories written before these
fields existed, the library description serves as the introduction, and without a public scene name the player sees
"Current scene".

## Diagnostics

Every check says first what goes wrong in play ("The story never reads as ready: …"), then the technical detail.
Fix the errors before you play; warnings are worth reading. The guide topic named in each check explains it.

## Saving

**Save** writes the story to your library as a new version (`Saved "X" vN to the library.`). The toolbar says
`unsaved draft` while there are changes.

Saving does not switch other chats to the new version; each chat keeps the copy it plays. When you save from the
chat that plays the story:

- a compatible edit is applied there at once (`Applied to this chat: …`);
- an edit that invalidates progress asks whether this chat should **Keep playing** (only the parts that no longer
  exist are dropped), **Restart story**, or **Cancel**. The edit is in the library either way.

Export and import live in the Studio toolbar, so a story can be shared as a JSON file.

---

[Author's guide](README.md)
