import { couldNot, wrote, type WriteResult } from "@utils/writeResult";
import { fnv1a } from "./hash";
import { beginRun, type RunGuard } from "./runToken";
import { setupNeedsPane, type PlayerSetupChoice, type PlayerSetupRecord } from "./playerSetup";
import { personaHost, personaRead, type PlayerSetupDeps, type PlayerSetupRequest } from "./playerSetupPort";

const LAPSED = "the chat changed before the choice was saved";

export class PlayerSetupControl {
  constructor(private readonly deps: PlayerSetupDeps) {}

  async choose(request: PlayerSetupRequest): Promise<WriteResult<PlayerSetupRecord>> {
    const run = beginRun(this.deps.ownership);
    const result = await this.settle(request, run);
    if (!result.ok || !run.stillOwns()) return result;
    this.deps.journal(`Playing as ${result.name ?? "the current persona"}`, `start setup: ${request.choice}${result.locked ? ", locked to this chat" : ""}`);
    await this.deps.persist();
    if (!run.stillOwns()) return couldNot(LAPSED);
    this.deps.requirements.refresh();
    await this.deps.requirements.hydrate();
    this.deps.notify();
    return result;
  }

  async autoResolve(): Promise<boolean> {
    const loaded = this.deps.loaded();
    const extras = this.deps.extras();
    if (!loaded || !extras.playerSetup?.pending || setupNeedsPane(loaded.story, extras.ui.playerSetup !== false)) return false;
    return (await this.settle({ choice: "skip" }, beginRun(this.deps.ownership))).ok;
  }

  async switchBack(): Promise<WriteResult<{ avatarId: string }>> {
    const host = personaHost();
    const record = this.deps.extras().playerSetup;
    if (!host || !record?.avatarId) return couldNot("this chat has no locked persona to switch back to");
    const run = beginRun(this.deps.ownership);
    const selected = await host.select(record.avatarId);
    if (!selected.ok || !run.stillOwns()) return selected;
    const locked = await host.lock();
    if (!run.stillOwns()) return couldNot(LAPSED);
    this.deps.journal(`Switched back to ${record.name ?? "the story's persona"}`, locked.ok ? "locked to this chat again" : locked.reason);
    this.deps.notify();
    return selected;
  }

  private async avatarFor(request: PlayerSetupRequest, title: string, run: RunGuard): Promise<WriteResult<{ avatarId: string | null; createdHash?: string }>> {
    const host = personaHost();
    if (request.choice === "keep" || request.choice === "skip") return wrote({ avatarId: personaRead()?.avatarId ?? null });
    if (!host) return couldNot("SillyTavern's personas are not reachable from here");
    let avatarId = request.choice === "pick" ? request.avatarId : "";
    let createdHash: string | undefined;
    if (request.choice === "create") {
      const name = request.name.trim();
      if (!name) return couldNot("the new persona needs a name");
      const made = await host.create({ name, description: request.description, title: `Story: ${title}` });
      if (!made.ok || !run.stillOwns()) return made.ok ? couldNot(LAPSED) : made;
      avatarId = made.avatarId;
      createdHash = fnv1a(request.description);
    }
    const selected = await host.select(avatarId);
    if (!selected.ok) return selected;
    return run.stillOwns() ? wrote({ avatarId, ...(createdHash ? { createdHash } : {}) }) : couldNot(LAPSED);
  }

  private async settle(request: PlayerSetupRequest, run: RunGuard): Promise<WriteResult<PlayerSetupRecord>> {
    const loaded = this.deps.loaded();
    if (!loaded) return couldNot("no story is playing in this chat");
    const avatar = await this.avatarFor(request, loaded.story.title, run);
    if (!avatar.ok) return avatar;
    const host = personaHost();
    const locked = host ? await host.lock() : null;
    const name = personaRead()?.name;
    if (!run.stillOwns()) return couldNot(LAPSED);
    if (locked && !locked.ok) this.deps.journal("the persona was not locked to this chat", locked.reason);
    const choice: PlayerSetupChoice = request.choice;
    const record: PlayerSetupRecord = {
      pending: false, storyId: loaded.record.id, version: loaded.story.version ?? 1, choice, avatarId: avatar.avatarId,
      ...(name ? { name } : {}), locked: Boolean(locked?.ok), ...(avatar.createdHash ? { createdHash: avatar.createdHash } : {}),
    };
    this.deps.extras().playerSetup = record;
    return wrote(record);
  }
}
