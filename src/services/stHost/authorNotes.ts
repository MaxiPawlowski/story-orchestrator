import {
  AUTHOR_NOTE_DEFAULT_DEPTH,
  AUTHOR_NOTE_DEFAULT_INTERVAL,
  AUTHOR_NOTE_DISABLED_FREQUENCY,
  AUTHOR_NOTE_LOG_SAMPLE_LIMIT,
} from "@constants/defaults";
import { quoteSlashArg } from "@utils/string";
import { executeSlashCommands } from "./slashCommands";

type ANPosition = "after" | "chat" | "before";
type ANRole = "system" | "user" | "assistant";

export async function applyCharacterAN(
  text: string,
  opts?: { position?: ANPosition; depth?: number; interval?: number; role?: ANRole },
) {
  const position = opts?.position ?? "chat";
  const depth = opts?.depth ?? AUTHOR_NOTE_DEFAULT_DEPTH;
  const interval = opts?.interval ?? AUTHOR_NOTE_DEFAULT_INTERVAL;
  const role = opts?.role ?? "system";

  console.log("[Story A/N slash] applying", {
    role,
    position,
    depth,
    interval,
    sample: text.slice(0, AUTHOR_NOTE_LOG_SAMPLE_LIMIT),
  });

  await executeSlashCommands(`/note-position ${position}`);
  await executeSlashCommands(`/note-depth ${depth}`);
  await executeSlashCommands(`/note-frequency ${interval}`);

  const ok = await executeSlashCommands(`/note ${quoteSlashArg(text ?? "")}`);
  if (!ok) {
    await executeSlashCommands(`/note ${quoteSlashArg("")}`);
  }
}

export async function clearCharacterAN() {
  await executeSlashCommands(`/note ${quoteSlashArg("")}`);
  await executeSlashCommands(`/note-frequency ${AUTHOR_NOTE_DISABLED_FREQUENCY}`);
}
