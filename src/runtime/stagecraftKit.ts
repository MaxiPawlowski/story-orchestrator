import type { StagecraftRuntimeState } from "./types";
import type { CuratorProposalRecord } from "@stagecraft/index";
import type { StagecraftCoordinatorDeps } from "./coordinators/stagecraftCoordinator";
import { CuratorWriter, createdEntryOf } from "./curatorWriter";
import { LoreCreator } from "./loreCreator";

export interface StagecraftKit {
  writer: CuratorWriter;
  creator: LoreCreator;
  createdEntryOf: typeof createdEntryOf;
}

export interface StagecraftSlice {
  state: () => StagecraftRuntimeState;
  patch: (next: Partial<StagecraftRuntimeState>) => void;
  updateOps: (id: string, update: (record: CuratorProposalRecord) => CuratorProposalRecord) => void;
  save: () => Promise<void>;
  uniqueId: (base: string) => string;
}

export const stagecraftKit = (deps: StagecraftCoordinatorDeps, slice: StagecraftSlice): StagecraftKit => ({
  writer: new CuratorWriter({
    getStory: () => deps.getStory(), state: slice.state, patch: slice.patch, updateOps: slice.updateOps, save: slice.save,
    journal: (summary) => deps.journal(summary), ownership: () => deps.ownership, host: () => deps.hosts.curator, ...(deps.chatOwner ? { owner: deps.chatOwner } : {}),
  }),
  creator: new LoreCreator({
    getStory: deps.getStory, getState: deps.getState, state: slice.state, patch: slice.patch, save: slice.save, journal: deps.journal, ownership: () => deps.ownership,
    model: deps.model, getCanon: deps.getCanon, getOpenArcs: deps.getOpenArcs, host: () => deps.hosts.curator, uniqueId: slice.uniqueId, ...(deps.lore ? { lore: deps.lore } : {}),
  }),
  createdEntryOf,
});
