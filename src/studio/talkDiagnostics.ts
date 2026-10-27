import type { Story, TalkControl } from "@engine/index";
import { resolveTalkPolicy } from "@talk/index";

type TalkCode = "talk-budget-below-chain" | "talk-pacing-no-room" | "npc-reply-scope-unused" | "talk-member-unknown";

export const TALK_PACING_CONSEQUENCES: Record<Exclude<TalkCode, "talk-member-unknown">, string> = {
  "talk-budget-below-chain": "The speech budget stops the chain before its max, so fewer voices answer than the chain allows.",
  "talk-pacing-no-room": "Spotlight and reaction lines replace or add a second voice, so with one voice per player message or no chain they never happen.",
  "npc-reply-scope-unused": "An entering line fires when the beat is entered, never per player message, so this scope never counts anything.",
};

export interface TalkDiagnosticRun {
  draft: Story;
  push: (code: TalkCode, severity: "warning" | "info", path: string, message: string) => void;
}

const DEFAULT_CHAIN_MAX = 3;

const pacingMembers = (control: TalkControl): Array<[string, string]> => [
  ...(control.spotlight ? (control.spotlight.members ?? []).map((name, at): [string, string] => [name, `spotlight.members.${at}`]) : []),
  ...(control.reaction ? (control.reaction.members ?? []).map((name, at): [string, string] => [name, `reaction.members.${at}`]) : []),
  ...(control.address_player && Array.isArray(control.address_player.by) ? control.address_player.by.map((name, at): [string, string] => [name, `address_player.by.${at}`]) : []),
];

export const checkTalkPacing = ({ draft, push }: TalkDiagnosticRun) => {
  const known = new Set(draft.roster.flatMap((member) => [member.id, member.name ?? "", ...(member.aliases ?? [])]).map((name) => name.trim().toLowerCase()).filter(Boolean));
  draft.checkpoints.forEach((checkpoint, index) => {
    const path = `checkpoints.${index}.talk_control`;
    const control = checkpoint.talk_control;
    (checkpoint.effects?.npc_replies ?? []).forEach((reply, at) => {
      if (reply.trigger === "onEnter" && reply.once_per === "player_turn") {
        push("npc-reply-scope-unused", "info", `checkpoints.${index}.effects.npc_replies.${at}.once_per`, `${reply.member}'s entering line is scoped per player message`);
      }
    });
    if (!control) return;
    for (const [name, at] of pacingMembers(control)) if (!known.has(name.trim().toLowerCase())) push("talk-member-unknown", "warning", `${path}.${at}`, `'${name}' is not a roster member`);
    const chainMax = control.chain === false ? null : control.chain?.max ?? DEFAULT_CHAIN_MAX;
    const activeReplies = (checkpoint.effects?.npc_replies ?? []).some((reply) => reply.trigger !== "onEnter" && reply.enabled !== false);
    const policy = resolveTalkPolicy({ control, defaults: draft.talk_defaults, chainMax, activeReplies });
    if (chainMax !== null && policy.budget && policy.budget.voices < chainMax && (control.budget?.voices !== undefined || (control.chain && control.chain.max !== undefined))) {
      push("talk-budget-below-chain", "warning", `${path}.budget`, `the budget allows ${policy.budget.voices} voice(s) per player message, the chain max is ${chainMax}`);
    }
    if ((policy.spotlight || policy.reaction) && (chainMax === null || (policy.budget?.voices ?? 2) < 2)) {
      push("talk-pacing-no-room", "warning", path, "spotlight or reaction is on, but this beat answers a player message with one voice");
    }
  });
};
