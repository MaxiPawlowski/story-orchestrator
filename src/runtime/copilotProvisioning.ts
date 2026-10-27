import type { Story } from "@engine/index";
import type { ProvisioningEnvironment, ProvisioningOp, ProvisioningResult, WizardCreatedCard, WizardSessionState } from "@wizard/types";
import { newWizardSession, recordGrant } from "@wizard/interview";
import { describeReadBack, type CardReadBackRecord } from "@utils/cardReadBack";
import { lorebookFileId } from "@utils/string";
import { beginRun, type RunOwnership } from "./runToken";
import type { ProvisioningHost } from "./hostPorts";

export interface ProvisioningScope {
  ownership: RunOwnership;
  host: ProvisioningHost;
  session: (draft?: Story) => WizardSessionState | null;
  sessionKey: (draft?: Story) => string;
  storyScopeId: (draft?: Story) => string;
  environment: (draft?: Story) => ProvisioningEnvironment;
  save?: (session: WizardSessionState) => void;
}

const recordCreated = (scope: ProvisioningScope, name: string, kind: "character" | "lorebook" | "group", draft?: Story): void => {
  const session = scope.session(draft) ?? newWizardSession(scope.sessionKey(draft));
  const books = session.createdLorebooks;
  const applied = session.applied.includes(name) ? session.applied : [...session.applied, name];
  const createdLorebooks = kind === "lorebook" && !books.includes(name) ? [...books, name] : books;
  if (applied === session.applied && createdLorebooks === books) return;
  scope.save?.({ ...session, applied, createdLorebooks });
};

const recordCreatedCard = (scope: ProvisioningScope, card: WizardCreatedCard, draft?: Story): void => {
  const session = scope.session(draft) ?? newWizardSession(scope.sessionKey(draft));
  const createdCards = [...(session.createdCards ?? []).filter((entry) => entry.avatar !== card.avatar), card];
  const applied = session.applied.includes(card.name) ? session.applied : [...session.applied, card.name];
  scope.save?.({ ...session, applied, createdCards });
};

export async function recheckCreatedCard(scope: ProvisioningScope, op: Extract<ProvisioningOp, { kind: "createCharacterCard" }>, avatar: string, draft?: Story): Promise<CardReadBackRecord> {
  const read = scope.host.readBackCharacterCard;
  const readBack = read ? await read(avatar, op) : { state: "unconfirmed" as const, lossy: [], name: null };
  const known = (scope.session(draft)?.createdCards ?? []).find((entry) => entry.avatar === avatar);
  recordCreatedCard(scope, { name: readBack.name ?? known?.name ?? op.name, requested: op.name, avatar, readBack: readBack.state, lossy: readBack.lossy }, draft);
  return { state: readBack.state, lossy: readBack.lossy, avatar };
}

export async function applyProvisioning(scope: ProvisioningScope, op: ProvisioningOp, draft?: Story): Promise<ProvisioningResult> {
  const run = beginRun(scope.ownership);
  const lapsed = (): ProvisioningResult => ({ ok: false, message: "The story changed before this provisioning step could finish." });
  const host = scope.host;
  const { validateProvisioningOp, loreEntryShape } = await import("@wizard/provisioning");
  const validation = validateProvisioningOp(op, scope.environment(draft));
  if (!validation.ok) return { ok: false, message: validation.message };
  try {
    if (op.kind === "createCharacterCard") {
      if (!run.stillOwns()) return lapsed();
      const created = await host.createCharacterCard(op);
      if (!created.ok) return { ok: false, message: `Could not create the character card "${op.name}": ${created.reason}.` };
      recordCreatedCard(scope, { name: created.name, requested: op.name, avatar: created.avatar, readBack: created.readBack, lossy: created.lossy }, draft);
      const readBack = { state: created.readBack, lossy: created.lossy, avatar: created.avatar };
      return { ok: true, message: describeReadBack(created.name, readBack), created: created.name, readBack };
    }
    if (op.kind === "createStoryLorebook") {
      if (!run.stillOwns()) return lapsed();
      const result = await host.createLorebook(op.name);
      if (!result.ok) return { ok: false, message: `Could not create the lorebook "${op.name}": ${result.reason}.` };
      recordCreated(scope, op.name, "lorebook", draft);
      return { ok: true, message: `Created the lorebook "${op.name}".`, created: op.name };
    }
    if (op.kind === "grantLorebook") {
      const existing = scope.session(draft);
      const session = existing ?? newWizardSession(scope.sessionKey(draft));
      if (!existing) scope.save?.(session);
      scope.save?.(recordGrant(session, scope.storyScopeId(draft), lorebookFileId(op.lorebook), !op.revoke));
      return { ok: true, message: op.revoke ? `This story may no longer write into "${op.lorebook}".` : `This story may now write into "${op.lorebook}".` };
    }
    if (op.kind === "upsertLorebookEntry") {
      if (!run.stillOwns()) return lapsed();
      const live = scope.environment(draft);
      const fileId = lorebookFileId(op.lorebook);
      if (!live.lorebookNames.some((name) => name.toLowerCase() === fileId.toLowerCase()) || !live.ownedLorebooks.some((name) => name.toLowerCase() === fileId.toLowerCase())) {
        return { ok: false, message: `"${op.lorebook}" is not this story's to write into any more.` };
      }
      if (!run.stillOwns()) return lapsed();
      const result = await host.upsertWIEntry(op.lorebook, op.comment, op.content, op.keys, { ...loreEntryShape(op), guard: run });
      if (result === "failed") return { ok: false, message: `Could not write "${op.comment}" into "${op.lorebook}".` };
      return { ok: true, message: `${result === "created" ? "Added" : "Updated"} "${op.comment}" in "${op.lorebook}".`, created: `${op.lorebook}/${op.comment}` };
    }
    if (!run.stillOwns()) return lapsed();
    const group = await host.createGroup(op.name, op.members);
    recordCreated(scope, group.name, "group", draft);
    return { ok: true, message: `Created the group "${group.name}" with ${group.members.length} member(s).`, created: group.name };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Provisioning failed" };
  }
}
