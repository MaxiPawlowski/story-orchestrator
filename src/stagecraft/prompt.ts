import { CURATOR_MAX_OPS, CURATOR_MAX_TEXT, CURATOR_SHOWN_CONTENT, PATCH_ANCHOR_SEPARATOR, collapseContent, contentShownInPart, type CuratorEntryView, type CuratorScope } from "./types";
import { entryRef } from "./scope";
import { truncate } from "@utils/string";

export const NO_CURATOR_ENTRIES = "(this story's lorebooks have no entries yet)";

export const renderCuratorEntry = (entry: CuratorEntryView, entries: CuratorEntryView[]): string => [
  `- ${[
    entryRef(entry, entries),
    `"${entry.comment}"`,
  ].filter(Boolean).join(" ")} (${entry.lorebook})${entry.disabled ? " [currently off]" : ""}${contentShownInPart(entry.content) ? " [shown in part — patch only]" : ""}`,
  `  keys: ${entry.keys.join(", ") || "(none)"}`,
  `  content: ${truncate(collapseContent(entry.content), CURATOR_SHOWN_CONTENT) || "(empty)"}`,
].join("\n");

// Same discipline as the extractor contract: a closed vocabulary (only the entry titles listed here
// may be named), an explicit evidence expectation, and one line per change so a small model cannot
// drift into prose. The prompt never receives a lorebook the story did not put on its allowlist.
export function buildWiCuratorPrompt(scope: CuratorScope): string {
  const entries = scope.entries.length
    ? scope.entries.map((entry) => renderCuratorEntry(entry, scope.entries)).join("\n")
    : NO_CURATOR_ENTRIES;
  const declined = (scope.declined ?? []).slice(0, CURATOR_MAX_OPS).map((op) => `- [${op.kind}] ${op.comment}`);

  return [
    "[WORLD INFO CURATION TASK — output structured lines only. Do NOT continue the roleplay.]",
    "You keep a story's own lorebook honest as play moves on: switch entries on when they now matter, off when they no longer do, and correct text the story has overtaken.",
    "",
    `STORY: ${scope.storyTitle}`,
    `WHERE THE STORY IS: ${scope.checkpointName}${scope.objective ? ` — ${scope.objective}` : ""}`,
    scope.canon ? `WHAT HAS HAPPENED:\n${truncate(scope.canon, 1200)}` : "",
    scope.openArcs.length ? `OPEN THREADS:\n${scope.openArcs.map((arc) => `- ${arc}`).join("\n")}` : "",
    "",
    "ENTRIES YOU MAY TOUCH (no others exist for you):",
    entries,
    "",
    declined.length ? `THE AUTHOR DECLINED (do not propose these again):\n${declined.join("\n")}\n` : "",
    "Output one line per change, at most " + String(CURATOR_MAX_OPS) + ":",
    "[enable] <#number or entry title>",
    "[disable] <#number or entry title>",
    `[rewrite] <#number or entry title> ${PATCH_ANCHOR_SEPARATOR} <the full replacement text>`,
    `[patch] <#number or entry title> ${PATCH_ANCHOR_SEPARATOR} <first words of the span to replace> ${PATCH_ANCHOR_SEPARATOR} <last words of that span> ${PATCH_ANCHOR_SEPARATOR} <replacement text>`,
    "Then one final line: [why] <one sentence on what changed in the story that made these necessary>",
    "RULES:",
    "- Name each entry by its #number, or by its title exactly as listed above. Anything else is discarded.",
    "- [enable] only an entry marked [currently off]; every other entry is already on.",
    "- [disable] only an entry that is not marked [currently off].",
    "- An entry marked [shown in part — patch only] may only be patched: you have not seen all of it.",
    "- Some entries carry `{{// ...}}` bookkeeping markers. Never write, move or delete a marker, and never change the words between `{{// so:protect}}` and `{{// so:end}}`.",
    "- Prefer [patch] over [rewrite]: quote the first and last words of the span exactly as they appear in the content.",
    `- Keep replacement text under ${String(CURATOR_MAX_TEXT)} characters. Never restate the whole entry in a patch.`,
    "- Only propose a change the story has actually made necessary. Style preferences are not changes.",
    "- Never invent new entries, never touch anything outside the list, never write about the player's own knowledge.",
    "If nothing needs changing, output NONE. That is the expected answer most of the time.",
    "",
    "Output:",
  ].filter((line) => line !== "").join("\n");
}
