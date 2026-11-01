import type { Feature } from "./registry";
import { settingsAt } from "./where";

export const RETENTION_FEATURES: readonly Feature[] = [
  {
    id: "mention-ledger", name: "Hold back what a character just said", area: "memory", audience: "author",
    oneLine: "A memory a character just brought up is left out of that character's next few replies, unless you raise it.",
    what: "After each reply the extension checks, in code, which memories, open threads and private lines the reply restated. A memory the character said "
      + "is left out of that character's own memory block for the next six turns, so the same callback is not offered every reply; it comes back at once when "
      + "your latest message names it. Other characters still get it. A swipe or edit takes the note back. No model call. Not rated yet.",
    where: settingsAt("#so-mention-ledger", "Authoring › Prompt trials"),
    settings: ["memory.mentionLedger"], doc: "player/memory.md", status: "shipped", needs: ["story", "group-chat"],
  },
  {
    id: "strength-retention", name: "Keep the memories the story uses", area: "memory", audience: "author",
    oneLine: "When a memory tier is full, the weakest memory leaves instead of the oldest, and it can still be recalled later.",
    what: "A memory a reply used gets stronger, and strength fades over turns, more slowly for important and lasting memories and after spaced uses. "
      + "When a tier is full, the weakest memory that is not pinned, locked or decided by you moves to the archive instead of the oldest one being deleted; "
      + "archive recall brings it back when the chat names it. A swipe or edit takes the use back. No model call. Not rated yet.",
    where: settingsAt("#so-strength-retention", "Authoring › Prompt trials"),
    settings: ["memory.strengthRetention"], doc: "player/memory.md", status: "shipped", needs: ["story"],
  },
  {
    id: "retrieval-query", name: "Pick memories from the last few messages", area: "memory", audience: "author",
    oneLine: "Which memories each reply gets is decided by the last few messages, the speaking character and who is on stage, not the last line alone.",
    what: "The memory score reads the last four messages, newer ones weighing more, plus the drafted character and the characters in the scene, and puts every "
      + "score term on the same scale before weighing them. A memory counts as recent when the chat last mentioned it, never because it was in a prompt. "
      + "Archive recall reads the last three messages the same way. No model call. Measured offline; not rated yet.",
    where: settingsAt("#so-retrieval-query", "Authoring › Prompt trials"),
    settings: ["memory.retrievalQuery"], doc: "player/memory.md", status: "shipped", needs: ["story"],
  },
  {
    id: "recap-outside-window", name: "Recap only what left the prompt", area: "memory", audience: "author",
    oneLine: "A summary of messages that are still in the prompt word for word is left out until those messages leave it.",
    what: "After each reply the extension notes the oldest chat message SillyTavern kept in the prompt. A session detail, the recent-events summary or a scene "
      + "summary whose messages all sit after it (with a four-message margin) is left out of the next prompts; once SillyTavern trims those messages, the summary "
      + "comes back. Pinned rows and rows you decided always stay. Saves prompt tokens and prefill time before a long chat fills the context. No model call. Not rated yet.",
    where: settingsAt("#so-recap-outside-window", "Authoring › Prompt trials"),
    settings: ["memory.recapOutsideWindow"], doc: "player/memory.md", status: "shipped", needs: ["story"],
  },
];
