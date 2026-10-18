import { parseStoryOrThrow } from "@engine/validate";
import type { NormalizedStory, PrimitiveValue } from "@engine/schema";

export const LAB_FLAGS = ["met_tom", "heard_debt", "searched_dock", "found_ledger", "saw_mill", "asked_widow", "rang_bell", "read_letter", "paid", "lost"] as const;

const bool = (key: string) => ({ key, type: "bool", source: "extractor", rubric: `Whether ${key} is true.` });
const is = (key: string) => ({ q: key, op: "==", v: true });

export const labRaw = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({
  title: "Codex lab", description: "Synthetic codex.",
  roster: [{ id: "tom", name: "Tom" }, { id: "ada", name: "Ada" }],
  qualities: [...LAB_FLAGS.map(bool), { key: "location", type: "enum", values: ["landing", "boathouse", "mill"], source: "extractor", rubric: "Where the party is." }],
  checkpoints: [
    { id: "start", name: "Start", player_name: "The landing", type: "intermediate", start: true, objective: "Arrive." },
    { id: "river", name: "River", player_name: "The river", type: "intermediate", objective: "Cross." },
    { id: "mill", name: "Mill", player_name: "The mill", type: "intermediate", objective: "Search." },
    { id: "end", name: "End", player_name: "The far shore", type: "anchor", objective: "Finish." },
  ],
  transitions: [
    { from: "start", to: "river", priority: 0, gate: is("met_tom") },
    { from: "river", to: "mill", priority: 0, gate: is("saw_mill") },
    { from: "mill", to: "end", priority: 0, gate: is("paid") },
  ],
  quests: [{ id: "debt", title: "The ferryman's debt", kind: "side", visible_when: is("heard_debt"), done_when: is("paid"), steps: [], reward: { label: "Passage" } }],
  codex: {
    people: [
      { id: "ferryman", member: "tom", known_when: is("met_tom"), facts: [
        { id: "job", text: "Runs the night crossing.", known_when: { reached: "river" } },
        { id: "debt", text: "Owes money to someone upriver.", known_when: is("heard_debt"), source: "innkeeper" },
        { id: "boat", text: "Keeps a second boat hidden.", known_when: is("searched_dock") },
        { id: "fear", text: "Will not go near the mill.", known_when: { reached: "mill" } },
      ] },
      { id: "innkeeper", name: "Marla the innkeeper", aliases: ["Marla"], facts: [
        { id: "ledger", text: "Keeps the ledger behind the bar.", known_when: is("found_ledger") },
        { id: "widow", text: "Answers to the miller's widow.", known_when: is("asked_widow") },
        { id: "bell", text: "Rings the bell at closing.", known_when: is("rang_bell") },
      ] },
      { id: "widow", name: "Oriel Vasque", aliases: ["the widow"], facts: [
        { id: "owner", text: "Owns the mill and its debts.", known_when: is("asked_widow") },
        { id: "letter", text: "Wrote to the ferryman twice.", known_when: is("read_letter") },
        { id: "gone", text: "Has not been seen since spring.", known_when: { reached: "end" } },
        { id: "seal", text: "Seals her letters in green wax.", known_when: is("read_letter") },
      ] },
      { id: "self", name: "You", facts: [
        { id: "background", text: "Grew up on the far shore.", known_when: "start" },
        { id: "purse", text: "Carries little coin.", known_when: "start" },
        { id: "debt", text: "Now owes the ferryman a favour.", known_when: is("paid") },
      ] },
    ],
    places: [
      { id: "landing", name: "The landing", known_when: "start", facts: [
        { id: "planks", text: "The planks are rotten near the end.", known_when: "start" },
        { id: "post", text: "A post bears old rope burns.", known_when: is("searched_dock") },
      ] },
      { id: "boathouse", name: "Kessel boathouse", location: "boathouse", facts: [
        { id: "door", text: "The back door does not lock.", known_when: is("searched_dock") },
        { id: "nets", text: "The nets were cut, not torn.", known_when: is("found_ledger") },
      ] },
      { id: "mill", name: "Grimsby mill", aliases: ["the mill house"], location: "mill", facts: [
        { id: "wheel", text: "The wheel turns with no water.", known_when: { reached: "mill" } },
        { id: "cellar", text: "A cellar runs under the race.", known_when: is("lost") },
      ] },
    ],
  },
  ...patch,
});

export const labStory = (patch: Record<string, unknown> = {}): NormalizedStory => parseStoryOrThrow(labRaw(patch));

export interface Rng {
  next(): number;
  pick<T>(items: readonly T[]): T;
}

export const rng = (seed: number): Rng => {
  let state = seed >>> 0 || 1;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 1_000_000) / 1_000_000;
  };
  return { next, pick: (items) => items[Math.floor(next() * items.length)] };
};

export const randomWrites = (random: Rng, story: NormalizedStory): Array<{ q: string; v: PrimitiveValue }> => {
  const writes: Array<{ q: string; v: PrimitiveValue }> = [];
  LAB_FLAGS.forEach((key) => { if (random.next() < 0.18) writes.push({ q: key, v: true }); });
  if (random.next() < 0.3) writes.push({ q: "location", v: random.pick(story.qualityByKey.location.values ?? []) });
  return writes;
};
