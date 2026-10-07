import { couldNot, wrote, type WriteResult } from "@utils/writeResult";
import { fnv1a } from "./hash";
import { beginRun, type RunGuard } from "./runToken";
import { setupNeedsPane, type PlayerSetupChoice, type PlayerSetupRecord } from "./playerSetup";
import { personaHost, personaRead, type PlayerSetupDeps, type PlayerSetupRequest } from "./playerSetupPort";

const LAPSED = "the chat changed before the choice was saved";
export const PERSONAS_UNREACHABLE = "SillyTavern's personas are not reachable from here";

interface Settled {
  outcome: WriteResult<PlayerSetupRecord>;
  recorded: boolean;
}

const notRecorded = (outcome: WriteResult<PlayerSetupRecord>): Settled => ({ outcome, recorded: false });

export class PlayerSetupControl {
  constructor(private readonly deps: PlayerSetupDeps) {}

  async choose(request: PlayerSetupRequest): Promise<WriteResult<PlayerSetupRecord>> {
    const run = beginRun(this.deps.ownership);
    const { outcome, recorded } = await this.settle(request, run);
    if (!recorded || !run.stillOwns()) return outcome;
    if (outcome.ok) {
      const detail = outcome.locked ? `start setup: ${request.choice}, locked to this chat` : `start setup: continued without the chat lock`;
      this.deps.journal(`Playing as ${outcome.name ?? "the current persona"}`, detail);
    }
    await this.deps.persist();
    if (!run.stillOwns()) return couldNot(LAPSED);
    if (outcome.ok) {
      this.deps.requirements.refresh();
      await this.deps.requirements.hydrate();
    }
    this.deps.notify();
    return outcome;
  }

  async autoResolve(): Promise<boolean> {
    const loaded = this.deps.loaded();
    const extras = this.deps.extras();
    if (!loaded || !extras.playerSetup?.pending || setupNeedsPane(loaded.story, extras.ui.playerSetup !== false)) return false;
    const choice = extras.playerSetup.lockFailed ? "retry" : "skip";
    return (await this.settle({ choice }, beginRun(this.deps.ownership))).outcome.ok;
  }

  async switchBack(): Promise<WriteResult<{ avatarId: string }>> {
    const host = personaHost();
    const record = this.deps.extras().playerSetup;
    if (!host || !record?.avatarId) return couldNot("this chat has no locked persona to switch back to");
    const run = beginRun(this.deps.ownership);
    const owns = () => run.stillOwns();
    const selected = await host.select(record.avatarId, owns);
    if (!selected.ok || !run.stillOwns()) return selected;
    const locked = await host.lock(owns);
    if (!run.stillOwns()) return couldNot(LAPSED);
    this.deps.journal(`Switched back to ${record.name ?? "the story's persona"}`, locked.ok ? "locked to this chat again" : locked.reason);
    this.deps.notify();
    return selected;
  }

  private async avatarFor(request: PlayerSetupRequest, previous: PlayerSetupRecord | undefined, title: string, run: RunGuard): Promise<WriteResult<{ avatarId: string | null; createdHash?: string }>> {
    const host = personaHost();
    const owns = () => run.stillOwns();
    const current = personaRead()?.avatarId ?? null;
    if (request.choice === "keep" || request.choice === "skip") return wrote({ avatarId: current });
    if (request.choice === "retry" && (!previous?.avatarId || previous.avatarId === current)) return wrote({ avatarId: previous?.avatarId ?? current });
    if (!host) return couldNot(PERSONAS_UNREACHABLE);
    let avatarId = request.choice === "pick" ? request.avatarId : request.choice === "retry" ? previous?.avatarId ?? "" : "";
    let createdHash: string | undefined;
    if (request.choice === "create") {
      const name = request.name.trim();
      if (!name) return couldNot("the new persona needs a name");
      const made = await host.create({ name, description: request.description, title: `Story: ${title}` }, owns);
      if (!made.ok || !run.stillOwns()) return made.ok ? couldNot(LAPSED) : made;
      avatarId = made.avatarId;
      createdHash = fnv1a(request.description);
    }
    const selected = await host.select(avatarId, owns);
    if (!selected.ok) return selected;
    return run.stillOwns() ? wrote({ avatarId, ...(createdHash ? { createdHash } : {}) }) : couldNot(LAPSED);
  }

  private continueUnlocked(previous: PlayerSetupRecord | undefined): Settled {
    if (!previous?.pending || !previous.lockFailed) return notRecorded(couldNot("there is no failed persona lock to continue past"));
    const record: PlayerSetupRecord = { ...previous, pending: false, locked: false };
    delete record.lockFailed;
    this.deps.extras().playerSetup = record;
    return { outcome: wrote(record), recorded: true };
  }

  private async settle(request: PlayerSetupRequest, run: RunGuard): Promise<Settled> {
    const loaded = this.deps.loaded();
    if (!loaded) return notRecorded(couldNot("no story is playing in this chat"));
    const previous = this.deps.extras().playerSetup;
    if (request.choice === "unlocked") return this.continueUnlocked(previous);
    const avatar = await this.avatarFor(request, previous, loaded.story.title, run);
    if (!avatar.ok) return notRecorded(avatar);
    const host = personaHost();
    if (!run.stillOwns()) return notRecorded(couldNot(LAPSED));
    const locked = host ? await host.lock(() => run.stillOwns()) : couldNot(PERSONAS_UNREACHABLE);
    const name = personaRead()?.name;
    if (!run.stillOwns()) return notRecorded(couldNot(LAPSED));
    const choice: PlayerSetupChoice = request.choice === "retry" ? previous?.choice ?? "skip" : request.choice;
    const createdHash = avatar.createdHash ?? (request.choice === "retry" ? previous?.createdHash : undefined);
    const base: PlayerSetupRecord = {
      pending: true, storyId: loaded.record.id, version: loaded.story.version ?? 1, choice, avatarId: avatar.avatarId,
      ...(name ? { name } : {}), locked: false, ...(createdHash ? { createdHash } : {}),
    };
    if (!locked.ok) {
      this.deps.journal("the persona was not locked to this chat", locked.reason);
      this.deps.extras().playerSetup = { ...base, lockFailed: locked.reason };
      return { outcome: couldNot(locked.reason), recorded: true };
    }
    const record: PlayerSetupRecord = { ...base, pending: false, locked: true };
    this.deps.extras().playerSetup = record;
    return { outcome: wrote(record), recorded: true };
  }
}
