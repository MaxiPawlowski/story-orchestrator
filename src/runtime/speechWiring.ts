import type { TalkPolicy } from "@talk/policy";
import type { RosterMember } from "@engine/index";
import { log } from "@utils/log";
import { readNpcReplies } from "./effectSteps";
import type { ManagerPort } from "./managerWiring";
import { getGlobalSettings } from "./settingsStore";
import { TALK_CHAIN_FIXED } from "./settingsModel";
import type { SpeechBudget, SpeechBudgetDeps } from "./speechBudget";
import type { SpeechReservation } from "./speechLedger";
import { resolveChainConfig } from "./talkControl";

type SpeechPortDeps = Pick<ManagerPort, "loaded" | "extras" | "engine" | "view" | "lifecycle" | "journal">;
type SpeechUnit = typeof import("./speechUnit");

export type SpeechPort = Pick<SpeechBudget, "reserve" | "settle" | "recordEntry" | "yieldPending" | "causeHandled" | "lastAddressAt">;

export interface LeadLength {
  rosterId: string;
  name: string;
  words: number;
}

const findMember = (roster: readonly RosterMember[], ref: string | undefined): RosterMember | undefined => {
  const wanted = ref?.trim().toLowerCase();
  return wanted ? roster.find((member) => [member.id, member.name ?? ""].some((name) => name.trim().toLowerCase() === wanted)) : undefined;
};

export function wireSpeech(port: SpeechPortDeps, importer: () => Promise<SpeechUnit> = () => import("./speechUnit")) {
  let unit: SpeechUnit | null = null;
  let budget: SpeechBudget | null = null;
  const policy = (): TalkPolicy | null => {
    const story = port.loaded()?.story ?? null;
    if (!story || !unit) return null;
    const extras = port.extras();
    const checkpoint = port.engine.activeCheckpoint;
    const control = extras.talk.enabled && extras.requirements.ready ? checkpoint?.talk_control ?? null : null;
    const chain = control ? resolveChainConfig(control, { ...getGlobalSettings().talk.chain, ...TALK_CHAIN_FIXED }) : null;
    const activeReplies = readNpcReplies(checkpoint?.effects).some((reply) => reply.trigger !== "onEnter" && reply.enabled !== false);
    return unit.resolveTalkPolicy({ control, defaults: story.talk_defaults, chainMax: chain?.enabled ? chain.max : null, activeReplies });
  };
  const deps: SpeechBudgetDeps = {
    chat: () => port.view.hosts.chat.chatRows(),
    chatId: () => String(port.view.hosts.chat.chatId() ?? ""),
    events: () => (port.loaded() ? port.extras().speech ?? [] : null),
    setEvents: (events) => { if (port.loaded()) port.extras().speech = events; },
    policy,
    persist: () => { void port.lifecycle.persist(); },
    journal: (summary, note) => port.journal("story", summary, note),
  };
  const ready = importer().then((loaded) => {
    unit = loaded;
    budget = new loaded.SpeechBudget(deps);
  }, (error: unknown) => log.warn("the speech budget could not load, so automatic voices are not budgeted", error));
  const speech: SpeechPort = {
    reserve: (request): SpeechReservation | null => (budget ? budget.reserve(request) : { id: -1, send: -1, request }),
    settle: (reservation, messageId) => budget?.settle(reservation, messageId),
    recordEntry: (member, messageId, generated, entry) => budget?.recordEntry(member, messageId, generated, entry),
    yieldPending: () => budget?.yieldPending() ?? false,
    causeHandled: (cause) => budget?.causeHandled(cause) ?? false,
    lastAddressAt: () => budget?.lastAddressAt() ?? -1,
  };
  const leadLength = (): LeadLength | null => {
    const words = policy()?.leadWords;
    const member = findMember(port.loaded()?.story.roster ?? [], port.engine.activeCheckpoint?.talk_control?.lead);
    return words && member ? { rosterId: member.id, name: member.name ?? member.id, words } : null;
  };
  return { speech, policy, leadLength, ready };
}
