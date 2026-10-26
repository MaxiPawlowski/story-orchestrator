import type { Checkpoint, NpcReplyEffect } from "@engine/index";
import { getContext } from "@services/STAPI";
import { isOpeningHook, readNpcReplies } from "./effectSteps";
import { hostChat, playerHasSpoken } from "./npcSpeak";
import { identitySettled } from "./playerSetup";
import type { RunGuard } from "./runToken";
import type { RuntimeExtras } from "./types";

export interface NewChatOpening { fired: boolean; fresh?: boolean; hooked?: boolean }

export interface OpeningHost {
  fire: (checkpoint: Checkpoint, extras: RuntimeExtras, allow: (reply: NpcReplyEffect) => boolean) => Promise<number>;
  fireOnEnter: (checkpoint: Checkpoint, extras: RuntimeExtras, gate: number | undefined, deferrable: boolean) => Promise<void>;
  castSettled: () => Promise<void>;
  journal?: (summary: string, note?: string) => void;
}

const chatId = () => String(getContext().chatId ?? "");

const isOpener = (reply: NpcReplyEffect) => reply.new_chat_only === true && reply.kind === "scripted";

export class OpeningSequence {
  private held: { key: string; gate?: number } | null = null;
  private posting: string | null = null;

  constructor(private readonly host: OpeningHost) {}

  posts(): boolean { return this.posting !== null && this.posting === chatId(); }

  async open(opening: NewChatOpening, checkpoint: Checkpoint, extras: RuntimeExtras, run: RunGuard) {
    if (opening.fired || !extras.requirements.ready || !identitySettled(extras.playerSetup) || !run.stillOwns()) return;
    opening.fired = true;
    opening.fresh = hostChat().length === 0;
    if (opening.fresh) await this.post(isOpener, checkpoint, extras);
  }

  hold(checkpoint: Checkpoint, gate?: number) {
    this.held = { key: `${chatId()}|${checkpoint.id}`, ...(gate !== undefined ? { gate } : {}) };
    this.host.journal?.(`the entering lines of ${checkpoint.name || checkpoint.id} wait for the opener`, "the player's identity is not settled, so the story's opener has not posted yet");
  }

  async after(opening: NewChatOpening, checkpoint: Checkpoint, extras: RuntimeExtras, run: RunGuard) {
    const held = this.held;
    if (held?.key === `${chatId()}|${checkpoint.id}` && opening.fired && extras.requirements.ready && run.stillOwns()) {
      this.held = null;
      await this.host.fireOnEnter(checkpoint, extras, held.gate, false);
    }
    await this.hook(opening, checkpoint, extras, run);
  }

  private async hook(opening: NewChatOpening, checkpoint: Checkpoint, extras: RuntimeExtras, run: RunGuard) {
    if (!opening.fresh || opening.hooked || !extras.requirements.ready || !run.stillOwns()) return;
    if (!readNpcReplies(checkpoint.effects).some(isOpeningHook)) return;
    opening.hooked = true;
    await this.host.castSettled();
    if (!run.stillOwns() || playerHasSpoken()) return;
    await this.post(isOpeningHook, checkpoint, extras);
  }

  private async post(allow: (reply: NpcReplyEffect) => boolean, checkpoint: Checkpoint, extras: RuntimeExtras) {
    this.posting = chatId();
    try {
      await this.host.fire(checkpoint, extras, allow);
    } finally {
      this.posting = null;
    }
  }
}
