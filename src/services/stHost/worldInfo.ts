import { trimStringList } from "@utils/dataHelpers";
import { quoteSlashArg } from "@utils/string";
import { getContext } from "./context";
import { worldInfoModule } from "./modules";
import { executeSlashCommands } from "./slashCommands";

export interface Lorebook {
  entries: Record<number, LoreEntry>;
}

export interface LoreEntry {
  uid: number;
  comment: string;
  [key: string]: unknown;
}

export const getWorldInfoSettings: () => WorldInfoSettings = worldInfoModule.getWorldInfoSettings;

export async function loadLorebook(name: string): Promise<Lorebook | null> {
  const lorebook = name.trim();
  if (!lorebook) return null;
  return await getContext().loadWorldInfo(lorebook) as Lorebook | null;
}

function findMatchedLoreEntries(lorebook: Lorebook, comments: string[]) {
  const entries = Object.values(lorebook.entries);
  const matched: Array<{ comment: string; uid: number }> = [];
  for (const comment of comments) {
    const found = entries.find((entry) => entry.comment?.trim() === comment);
    if (!found) continue;
    matched.push({ comment, uid: found.uid });
  }
  return matched;
}

async function setWIEntryDisabledState(lorebook: string, comments: string | string[], disabled: boolean) {
  if (!lorebook) return false;
  const commentList = trimStringList(Array.isArray(comments) ? comments : [comments]);
  if (!commentList.length) return false;

  const loadedInfo = await loadLorebook(lorebook);
  if (!loadedInfo) {
    console.warn("[Story WI] failed to load lorebook", { lorebook });
    return false;
  }

  const matched = findMatchedLoreEntries(loadedInfo, commentList);
  for (const comment of commentList) {
    if (!matched.some((entry) => entry.comment === comment)) {
      console.warn("[Story WI] no matching world info entry found", { lorebook, comment });
    }
  }
  if (!matched.length) return false;

  let allOk = true;
  for (let index = 0; index < matched.length; index += 1) {
    const entry = matched[index];
    const ok = await executeSlashCommands(
      `/setentryfield file=${quoteSlashArg(lorebook)} uid=${entry.uid} field=disable ${disabled ? 1 : 0}`,
      { silent: false },
    );
    if (!ok) {
      console.warn(`[Story WI] failed to ${disabled ? "disable" : "enable"} world info entry`, {
        lorebook,
        comment: entry.comment,
        uid: entry.uid,
      });
      allOk = false;
    }
    if (index < matched.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return allOk;
}

export async function enableWIEntry(lorebook: string, comments: string | string[]) {
  return setWIEntryDisabledState(lorebook, comments, false);
}

export async function disableWIEntry(lorebook: string, comments: string | string[]) {
  return setWIEntryDisabledState(lorebook, comments, true);
}
