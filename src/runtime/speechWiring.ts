import { resolveTalkPolicy, type TalkPolicy } from "@talk/index";
import type { RosterMember } from "@engine/index";
import { readNpcReplies } from "./effectSteps";
import type { ManagerPort } from "./managerWiring";
import { getGlobalSettings } from "./settingsStore";
import { TALK_CHAIN_FIXED } from "./settingsModel";
import { SpeechBudget } from "./speechBudget";
import { resolveChainConfig } from "./talkControl";

type SpeechPort = Pick<ManagerPort, "loaded" | "extras" | "engine" | "view" | "lifecycle" | "journal">;

export interface LeadLength {
  rosterId: string;
  name: string;
  words: number;
}

const findMember = (roster: readonly RosterMember[], ref: string | undefined): RosterMember | undefined => {
  const wanted = ref?.trim().toLowerCase();
  return wanted ? roster.find((member) => [member.id, member.name ?? ""].some((name) => name.trim().toLowerCase() === wanted)) : undefined;
};

export function wireSpeech(port: SpeechPort) {
  const policy = (): TalkPolicy | null => {
    const story = port.loaded()?.story ?? null;
    if (!story) return null;
    const extras = port.extras();
    const checkpoint = port.engine.activeCheckpoint;
    const control = extras.talk.enabled && extras.requirements.ready ? checkpoint?.talk_control ?? null : null;
    const chain = control ? resolveChainConfig(control, { ...getGlobalSettings().talk.chain, ...TALK_CHAIN_FIXED }) : null;
    const activeReplies = readNpcReplies(checkpoint?.effects).some((reply) => reply.trigger !== "onEnter" && reply.enabled !== false);
    return resolveTalkPolicy({ control, defaults: story.talk_defaults, chainMax: chain?.enabled ? chain.max : null, activeReplies });
  };
  const speech = new SpeechBudget({
    chat: () => port.view.hosts.chat.chatRows(),
    chatId: () => String(port.view.hosts.chat.chatId() ?? ""),
    events: () => (port.loaded() ? port.extras().speech ?? [] : null),
    setEvents: (events) => { if (port.loaded()) port.extras().speech = events; },
    policy,
    persist: () => { void port.lifecycle.persist(); },
    journal: (summary, note) => port.journal("story", summary, note),
  });
  const leadLength = (): LeadLength | null => {
    const words = policy()?.leadWords;
    const member = findMember(port.loaded()?.story.roster ?? [], port.engine.activeCheckpoint?.talk_control?.lead);
    return words && member ? { rosterId: member.id, name: member.name ?? member.id, words } : null;
  };
  return { speech, policy, leadLength };
}
