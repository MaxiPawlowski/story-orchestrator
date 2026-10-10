import { getContext } from "@services/STAPI";
import { AgendaProposalCoordinator } from "./coordinators/agendaProposalCoordinator";
import type { RuntimeManager } from "./runtimeManager";

interface ChatRow { name?: unknown; mes?: unknown; is_system?: unknown }

const chatWindow = (from: number, to: number) => ((getContext().chat ?? []) as ChatRow[]).slice(from, to + 1)
  .filter((row) => row.is_system !== true && typeof row.mes === "string")
  .map((row) => ({ speaker: typeof row.name === "string" ? row.name : "?", text: String(row.mes) }));

export const attachAgendaProposals = (manager: RuntimeManager): AgendaProposalCoordinator => {
  const slice = manager.agendaProposalSlice();
  const coordinator = new AgendaProposalCoordinator({
    getStory: () => manager.getStory(), getState: () => manager.getEngineState(), getProposals: slice.get, setProposals: slice.set,
    window: chatWindow, model: () => manager.model, ownership: slice.ownership,
    journal: (summary, note) => manager.noteRecap(summary, note, "author"), persist: slice.persist, notify: slice.notify,
  });
  manager.meanwhile.attach(coordinator);
  return coordinator;
};
