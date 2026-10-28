import type { EngineState, NormalizedStory, TalkControl } from "@engine/index";
import { getContext } from "@services/STAPI";
import { lastReplyAsksPlayer, latestSend, speechRows } from "@talk/index";
import { playerTurnIds } from "./agencyRecovery";
import { EffectsApplier, type EffectApplierDeps } from "./effectsApplier";
import { readEffectTarget, restoreCastFlags, restoreEffectTarget } from "./effectHost";
import { speakerNames } from "./roster";
import type { RunOwnership } from "./runToken";

export type { EffectsApplier };

export interface EffectsApplierView {
  getStory(): NormalizedStory | null;
  getActiveTalkControl(): TalkControl | null;
  getEngineState(): EngineState | null;
}

const chatRows = (): unknown[] => (Array.isArray(getContext().chat) ? getContext().chat : []);

export const entryKey = (state: Pick<EngineState, "activeCheckpointId" | "checkpointStartedMessageId"> | null): string =>
  (state ? `${state.activeCheckpointId}@${state.checkpointStartedMessageId}` : "");

export interface EffectsApplierHost extends Pick<EffectApplierDeps, "persist" | "unsaved" | "journal" | "roll" | "direct" | "speech"> {
  view: EffectsApplierView;
}

export const hostEffectsApplier = (ownership: RunOwnership, { view, ...deps }: EffectsApplierHost): EffectsApplier => new EffectsApplier(ownership, {
  reads: { read: readEffectTarget }, restore: restoreEffectTarget, restoreCast: restoreCastFlags, ...deps,
  speakerNames: (name) => speakerNames(view.getStory(), name),
  scope: () => {
    const state = view.getEngineState();
    return { entryStart: state?.checkpointStartedMessageId ?? -1, send: latestSend(speechRows(chatRows())), playerTurns: playerTurnIds(chatRows()), entry: entryKey(state) };
  },
  awaitsPlayer: () => lastReplyAsksPlayer(view.getStory()?.roster ?? [], view.getActiveTalkControl(), getContext().chat ?? [], String(getContext().name1 ?? "")),
});
