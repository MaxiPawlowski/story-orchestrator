import { slugifyStoryId, type StoryV2 } from "@engine/index";

export interface LivingStartInput {
  title: string;
  premise: string;
  tone?: string;
  playerRole?: string;
  members: readonly string[];
}

const rosterId = (name: string, taken: Set<string>): string => {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "member";
  let id = base;
  for (let index = 2; taken.has(id); index += 1) id = `${base}_${index}`;
  taken.add(id);
  return id;
};

export function buildLivingStory(input: LivingStartInput): StoryV2 {
  const taken = new Set<string>();
  const roster = input.members.map((name) => ({ id: rosterId(name, taken), name: name.trim() }));
  const premise = input.premise.trim();
  const title = input.title.trim() || "A living story";
  return {
    format: 2,
    id: slugifyStoryId(title),
    title,
    description: premise,
    ...(input.playerRole?.trim() ? { player: { role: input.playerRole.trim() } } : {}),
    living: {
      premise,
      ...(input.tone?.trim() ? { tone: input.tone.trim() } : {}),
      ...(roster.length ? { cast: roster.map((member) => member.id) } : {}),
      autonomy: "auto",
    },
    qualities: [],
    checkpoints: [],
    transitions: [],
    roster,
    ...(roster.length ? { requirements: { members: roster.map((member) => member.name) } } : {}),
  };
}
