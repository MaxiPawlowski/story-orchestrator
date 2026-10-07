import type { StoryV2 } from "@engine/index";

type LifeCode = "agenda-pace-no-chapters";

export const LIFE_CONSEQUENCES: Record<LifeCode, string> = {
  "agenda-pace-no-chapters": "The story cannot load: this plan waits for a new chapter, and the story has none, so it would move once and never again.",
};

export interface LifeRun {
  draft: StoryV2;
  push: (code: LifeCode, severity: "blocking", path: string, message: string) => void;
}

export const checkAgendaPace = ({ draft, push }: LifeRun) => {
  if (draft.chapters?.length) return;
  draft.roster.forEach((member, at) => (member.agenda ?? []).forEach((agenda, index) => {
    if (agenda.pace !== "per_chapter") return;
    push("agenda-pace-no-chapters", "blocking", `roster.${at}.agenda.${index}.pace`,
      `agenda '${agenda.id}' of '${member.id}' paces per_chapter in a story without chapters; use per_n_boundaries with every, or add chapters`);
  }));
};
