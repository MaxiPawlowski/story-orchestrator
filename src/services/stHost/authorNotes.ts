import {
  AUTHOR_NOTE_DEFAULT_DEPTH,
  AUTHOR_NOTE_DEFAULT_INTERVAL,
  AUTHOR_NOTE_DEFAULT_POSITION,
  AUTHOR_NOTE_DEFAULT_ROLE,
  AUTHOR_NOTE_DISABLED_FREQUENCY,
  AUTHOR_NOTE_LOG_SAMPLE_LIMIT,
} from "@constants/defaults";
import { quoteSlashArg } from "@utils/string";
import type { WriteResult } from "@utils/writeResult";
import { executeSlashCommands } from "./slashCommands";
import { log } from "@utils/log";

type ANPosition = "after" | "chat" | "before";
type ANRole = "system" | "user" | "assistant";

const AN_TEXT_FIELD = "#extension_floating_prompt";

// `/note ""` is a no-op (authors-note.js setNoteTextCommand guards `if (text)`); take the field's own input path instead.
function clearNoteText(): boolean {
  const field = globalThis.document?.querySelector<HTMLTextAreaElement>(AN_TEXT_FIELD);
  if (!field) {
    log.warn("author's note: author's note field not found; note text left as is");
    return false;
  }
  field.value = "";
  field.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

export async function applyCharacterAN(
  text: string,
  opts?: { position?: ANPosition; depth?: number; interval?: number; role?: ANRole },
): Promise<WriteResult<{ text: string }>> {
  const position = opts?.position ?? AUTHOR_NOTE_DEFAULT_POSITION;
  const depth = opts?.depth ?? AUTHOR_NOTE_DEFAULT_DEPTH;
  const interval = opts?.interval ?? AUTHOR_NOTE_DEFAULT_INTERVAL;
  const role = opts?.role ?? AUTHOR_NOTE_DEFAULT_ROLE;

  log.debug("author's note: applying", {
    role,
    position,
    depth,
    interval,
    sample: text.slice(0, AUTHOR_NOTE_LOG_SAMPLE_LIMIT),
  });

  await executeSlashCommands(`/note-position ${position}`);
  await executeSlashCommands(`/note-role ${role}`);
  await executeSlashCommands(`/note-depth ${depth}`);
  await executeSlashCommands(`/note-frequency ${interval}`);

  const ok = await executeSlashCommands(`/note ${quoteSlashArg(text ?? "")}`);
  if (ok) return { ok: true, text };
  clearNoteText();
  return { ok: false, reason: "ST refused the /note command, so the note was cleared rather than left stale" };
}

export async function clearCharacterAN(): Promise<WriteResult<{ text: string }>> {
  const cleared = clearNoteText();
  await executeSlashCommands(`/note-role ${AUTHOR_NOTE_DEFAULT_ROLE}`);
  await executeSlashCommands(`/note-frequency ${AUTHOR_NOTE_DISABLED_FREQUENCY}`);
  return cleared ? { ok: true, text: "" } : { ok: false, reason: "the Author's Note field is not on the page" };
}
