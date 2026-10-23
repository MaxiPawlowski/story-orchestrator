import type { MemberCue, Story } from "@engine/index";
import { inactionProblem } from "@engine/validate/factions";
import { speaksForPlayer } from "@wizard/cardChecks";

type CueCode = "cue-needs-event" | "cue-tie" | "cue-narrates-player" | "topic-ungated-depth";

export const CUE_CONSEQUENCES: Record<CueCode, string> = {
  "cue-needs-event": "The story cannot load: this reaction or norm would fire because time passed or nothing happened.",
  "cue-tie": "Two cues of one character can be offered on the same reply with the same lane and priority; the one declared first always wins.",
  "cue-narrates-player": "The character is handed a line that says what the player does or feels, and may narrate it as fact; name what the character noticed instead.",
  "topic-ungated-depth": "Every tier of this topic opens by asking again; asking alone reaches the deepest tier. Gate a deeper tier on an event if it should wait.",
};

export interface CueRun {
  draft: Story;
  push: (code: CueCode, severity: "blocking" | "warning" | "info", path: string, message: string) => void;
}

const PLAYER_ACT = /\bthe player\s+(?:feels?|felt|wants?|wanted|thinks?|thought|decides?|decided|fears?|loves?|hates?|is\s+(?:afraid|angry|sad|happy|sure))\b/i;

export const narratesPlayer = (text: string): boolean => speaksForPlayer(text) || PLAYER_ACT.test(text);

const startValues = (draft: Story) => Object.fromEntries(draft.qualities.flatMap((quality) => (quality.step_rule?.start !== undefined ? [[quality.key, quality.step_rule.start]] : [])));

const tieKey = (cue: MemberCue) => `${cue.lane === "must" ? "must" : "may"}:${cue.priority ?? 0}`;

export const checkCueDiagnostics = ({ draft, push }: CueRun) => {
  const start = startValues(draft);
  draft.roster.forEach((member, index) => {
    const base = `roster.${index}`;
    const seen = new Map<string, string>();
    (member.cues ?? []).forEach((cue, at) => {
      const path = `${base}.cues.${at}`;
      const why = cue.kind === "reaction" && cue.when ? inactionProblem(cue.when, start)?.replace("the move fires", "it fires") : null;
      if (why) push("cue-needs-event", "blocking", `${path}.when`, `reaction '${cue.id}' of '${member.id}' fires on inaction: ${why}`);
      if (narratesPlayer(cue.cue ?? "")) push("cue-narrates-player", "warning", `${path}.cue`, `cue '${cue.id}' of '${member.id}' says what the player does or feels`);
      const earlier = seen.get(tieKey(cue));
      if (earlier) push("cue-tie", "warning", `${path}.priority`, `cues '${earlier}' and '${cue.id}' of '${member.id}' share lane and priority; declaration order decides`);
      else seen.set(tieKey(cue), cue.id);
    });
    (member.topics ?? []).forEach((topic, at) => {
      if ((topic.tiers ?? []).length >= 2 && !topic.tiers.some((tier) => tier.when)) {
        push("topic-ungated-depth", "info", `${base}.topics.${at}.tiers`, `topic '${topic.id}' of '${member.id}' has ${topic.tiers.length} tiers and none waits for an event`);
      }
      (topic.tiers ?? []).forEach((tier, tierAt) => {
        const path = `${base}.topics.${at}.tiers.${tierAt}.cue`;
        if (narratesPlayer(tier.cue ?? "")) push("cue-narrates-player", "warning", path, `topic '${topic.id}' tier ${tierAt + 1} says what the player does or feels`);
      });
    });
  });
  (draft.norms ?? []).forEach((norm, index) => {
    const why = norm.broken_when ? inactionProblem(norm.broken_when, start)?.replace("the move fires", "it fires") : null;
    if (why) push("cue-needs-event", "blocking", `norms.${index}.broken_when`, `norm '${norm.id}' breaks on inaction: ${why}`);
    if (narratesPlayer(norm.cue ?? "")) push("cue-narrates-player", "warning", `norms.${index}.cue`, `norm '${norm.id}' says what the player does or feels`);
  });
};
