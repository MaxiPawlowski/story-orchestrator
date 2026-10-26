import type { NormalizedStory, TalkControl } from "@engine/index";
import { getContext } from "@services/STAPI";
import { lastReplyAsksPlayer } from "@talk/index";
import { EffectsApplier, type EffectApplierDeps } from "./effectsApplier";
import { readEffectTarget, restoreCastFlags, restoreEffectTarget } from "./effectHost";
import { speakerNames } from "./roster";
import type { RunOwnership } from "./runToken";

export type { EffectsApplier };

export interface EffectsApplierView {
  getStory(): NormalizedStory | null;
  getActiveTalkControl(): TalkControl | null;
}

export interface EffectsApplierHost extends Pick<EffectApplierDeps, "persist" | "unsaved" | "journal" | "roll" | "direct"> {
  view: EffectsApplierView;
}

export const hostEffectsApplier = (ownership: RunOwnership, { view, ...deps }: EffectsApplierHost): EffectsApplier => new EffectsApplier(ownership, {
  reads: { read: readEffectTarget }, restore: restoreEffectTarget, restoreCast: restoreCastFlags, ...deps,
  speakerNames: (name) => speakerNames(view.getStory(), name),
  awaitsPlayer: () => lastReplyAsksPlayer(view.getStory()?.roster ?? [], view.getActiveTalkControl(), getContext().chat ?? [], String(getContext().name1 ?? "")),
});
