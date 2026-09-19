import { CURATOR_MAX_OPS, CURATOR_MAX_TEXT, PATCH_ANCHOR_SEPARATOR, type CuratorScope } from "./types";

const truncate = (value: string, limit: number) => (value.length > limit ? `${value.slice(0, limit)}…` : value);

// Same discipline as the extractor contract: a closed vocabulary (only the entry titles listed here
// may be named), an explicit evidence expectation, and one line per change so a small model cannot
// drift into prose. The prompt never receives a lorebook the story did not put on its allowlist.
export function buildWiCuratorPrompt(scope: CuratorScope): string {
  const entries = scope.entries.length
    ? scope.entries.map((entry) => [
        `- "${entry.comment}" (${entry.lorebook})${entry.disabled ? " [currently off]" : ""}`,
        `  keys: ${entry.keys.join(", ") || "(none)"}`,
        `  content: ${truncate(entry.content.replace(/\s*\r?\n\s*/g, " ").trim(), 400) || "(empty)"}`,
      ].join("\n")).join("\n")
    : "(this story's lorebooks have no entries yet)";

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
    "Output one line per change, at most " + String(CURATOR_MAX_OPS) + ":",
    "[enable] <entry title>",
    "[disable] <entry title>",
    `[rewrite] <entry title> ${PATCH_ANCHOR_SEPARATOR} <the full replacement text>`,
    `[patch] <entry title> ${PATCH_ANCHOR_SEPARATOR} <first words of the span to replace> ${PATCH_ANCHOR_SEPARATOR} <last words of that span> ${PATCH_ANCHOR_SEPARATOR} <replacement text>`,
    "Then one final line: [why] <one sentence on what changed in the story that made these necessary>",
    "RULES:",
    "- Name entry titles exactly as listed above. A title that is not listed is discarded.",
    "- Prefer [patch] over [rewrite]: quote the first and last words of the span exactly as they appear in the content.",
    `- Keep replacement text under ${String(CURATOR_MAX_TEXT)} characters. Never restate the whole entry in a patch.`,
    "- Only propose a change the story has actually made necessary. Style preferences are not changes.",
    "- Never invent new entries, never touch anything outside the list, never write about the player's own knowledge.",
    "If nothing needs changing, output NONE. That is the expected answer most of the time.",
    "",
    "Output:",
  ].filter((line) => line !== "").join("\n");
}
