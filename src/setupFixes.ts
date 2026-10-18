import { addGroupMembers, setGroupMembersDisabled, showConfirmPopup } from "@services/STAPI";
import { chatUpdateOutcome } from "@runtime/librarySave";
import { runCastRepair } from "@runtime/castRepair";
import { withoutPersonas, type OneClickFix, type RepairAction } from "@runtime/repair";
import { saveStoryRecord } from "@runtime/storyLibrary";
import { makeGroupFor } from "@runtime/makeGroupHost";
import { requestBriefing } from "@runtime/briefingRequest";
import { acknowledgeLibraryLost } from "@runtime/libraryIndexPort";
import type { RuntimeManager } from "@runtime/runtimeManager";
import type { WriteResult } from "@utils/writeResult";

export const createSetupFixes = (manager: RuntimeManager) => {
  const dropPersonaRequirement = async (names: string[]): Promise<WriteResult<object>> => {
    const snapshot = manager.getSnapshot();
    const active = snapshot.library.find((story) => story.id === snapshot.storyId);
    const next = withoutPersonas(active?.raw ?? manager.getPlayedStoryRaw(), names);
    if (!next) return { ok: false, reason: "No story is playing in this chat." };
    const named = names.map((name) => `"${name}"`).join(", ");
    const confirmed = await showConfirmPopup(`Remove the persona requirement ${named} from this story? The story is saved to the library and this chat takes the change.`, {
      okButton: "Remove it", cancelButton: "Keep it",
    });
    if (!confirmed) return { ok: false, reason: `The story still requires ${named}.` };
    const saved = saveStoryRecord(next);
    if (Array.isArray(saved)) return { ok: false, reason: "The story could not be saved without that requirement; edit it in the Studio's Story tab." };
    const outcome = await manager.applyStoryUpdate(saved.record);
    return outcome.applied ? { ok: true } : { ok: false, reason: chatUpdateOutcome(outcome)?.detail ?? "The library has the change; this chat did not take it." };
  };

  const repairCast = async (action: RepairAction): Promise<string | null> => {
    const result = await runCastRepair(action, {
      add: addGroupMembers,
      unmute: (names) => setGroupMembersDisabled(names, []),
      dropPersonas: dropPersonaRequirement,
      refresh: () => manager.refreshRequirementsNow(),
      journal: (summary, detail) => manager.chatSave.note(summary, detail),
      ownership: manager.requirementsHost.ownership,
    });
    return result.ok ? null : result.reason;
  };

  const fixSetup = async (action: OneClickFix): Promise<string | null> => {
    if (action.kind === "open-player-setup") {
      requestBriefing({ kind: "identity" });
      return null;
    }
    if (action.kind === "acknowledge-library-lost") {
      const acknowledged = await acknowledgeLibraryLost(action, () => manager.notify());
      return acknowledged.ok ? null : acknowledged.reason;
    }
    if (action.kind === "switch-persona") {
      const switched = await manager.playerSetup.switchBack();
      return switched.ok ? null : switched.reason;
    }
    if (action.kind !== "make-group") return repairCast(action);
    const outcome = await makeGroupFor(manager, action.storyId);
    return !outcome.ok && outcome.reason !== "cancelled" ? outcome.message : null;
  };

  return { fixSetup };
};
