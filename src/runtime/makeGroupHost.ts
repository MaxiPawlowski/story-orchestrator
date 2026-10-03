import { isValidationErrorList } from "@engine/index";
import {
  createGroup, getActiveCharacterId, getAllCharacterNames, getCharacterNameById, getContext, listGroupNames, openGroupById, showConfirmPopup,
} from "@services/STAPI";
import { chatSettle } from "./chatSettle";
import { setGroupStoryBinding } from "./groupStoryBindingHost";
import { makeGroupForStory, type MakeGroupDeps, type MakeGroupOutcome } from "./makeGroup";
import { findStoryRecord, loadStoryRecord } from "./storyLibrary";

export interface MakeGroupManager {
  selectStory(id: string): Promise<boolean>;
  getSnapshot(): { storyId: string | null };
}

const safe = <T>(read: () => T[]): T[] => {
  try {
    return read();
  } catch {
    return [];
  }
};

export const makeGroupDeps = (manager: MakeGroupManager): MakeGroupDeps => ({
  story: (storyId) => {
    const record = findStoryRecord(storyId);
    const loaded = record ? loadStoryRecord(record) : null;
    return loaded && !isValidationErrorList(loaded) ? loaded.story : null;
  },
  environment: () => ({ characterNames: safe(getAllCharacterNames), groupNames: safe(listGroupNames) }),
  character: () => getCharacterNameById(getActiveCharacterId()) ?? null,
  confirm: (question) => showConfirmPopup(question, { okButton: "Make the group", cancelButton: "Not now" }),
  beginRun: () => {
    const chat = String(getContext().chatId ?? "");
    return { stillOwns: () => String(getContext().chatId ?? "") === chat };
  },
  createGroup: (name, members) => createGroup(name, members),
  bind: (groupId, storyId) => { void setGroupStoryBinding(groupId, storyId); },
  open: async (groupId) => {
    const opened = await openGroupById(groupId);
    return opened.ok ? { ok: true } : { ok: false, reason: opened.reason };
  },
  select: async (storyId) => {
    await chatSettle.until();
    return manager.getSnapshot().storyId === storyId || manager.selectStory(storyId);
  },
});

export const makeGroupFor = (manager: MakeGroupManager, storyId: string): Promise<MakeGroupOutcome> => makeGroupForStory(makeGroupDeps(manager), storyId);
