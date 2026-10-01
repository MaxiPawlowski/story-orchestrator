import { hashMemoryText } from "./stores";

export interface CanonCheckpoint {
  id: string;
  name: string;
  objective: string;
}

// The checkpoint is an input: without it the model can only guess "where things stand" from arcs
// resolved long ago, and a transition would never mark the canon stale.
export function canonInputHash(arcSummaries: string[], facts: string[], checkpoint: CanonCheckpoint | null = null): string {
  const parts = [...arcSummaries.map((summary) => `A:${summary}`), ...facts.map((fact) => `F:${fact}`), ...(checkpoint ? [`C:${checkpoint.id}`] : [])];
  return hashMemoryText(parts.join("\u0000"));
}

// Readers who already see live state (the player's "Where you are") take only the history: the
// canon's CURRENT STATE is as old as its last regeneration. Unlabelled text is kept whole.
export function canonHistory(text: string): string {
  const match = text.match(/WHAT HAS HAPPENED\s*:?\s*([\s\S]*?)(?=\n\s*(?:CURRENT STATE|ESTABLISHED FACTS)\s*:|$)/i);
  return (match ? match[1] : text).trim();
}

export function buildCanonSummaryPrompt(storyTitle: string, arcSummaries: string[], facts: string[], checkpoint: CanonCheckpoint | null = null): string {
  const arcSection = arcSummaries.length
    ? `RESOLVED ARC SUMMARIES:\n${arcSummaries.map((summary, index) => `Arc ${index + 1}: ${summary}`).join("\n\n")}`
    : "RESOLVED ARC SUMMARIES: (none)";
  const factSection = facts.length ? `KEY FACTS:\n${facts.map((fact) => `- ${fact}`).join("\n")}` : "KEY FACTS: (none)";
  return [
    "Write plain TEXT ONLY. Do NOT continue the roleplay or speak as any character. You are writing a document.",
    "Write a canon summary for the story below: a stable narrative document capturing the essential truth of what has happened and where things stand.",
    "Base everything strictly on the source material below — do not invent facts. Write in past tense, narrative style.",
    "Structure the output as three labelled paragraphs:",
    "WHAT HAS HAPPENED:",
    "[the key events and resolved arcs so far]",
    "CURRENT STATE:",
    "[where things stand now, at the current checkpoint below: unresolved tensions, active goals, and where the story is heading]",
    "ESTABLISHED FACTS:",
    "[the durable truths about the characters and world]",
    "Output only the three labelled paragraphs. No preamble, no disclaimers.",
    "",
    `STORY: ${storyTitle}`,
    ...(checkpoint ? [`CURRENT CHECKPOINT: ${checkpoint.name}${checkpoint.objective ? ` — ${checkpoint.objective}` : ""}`] : []),
    "",
    arcSection,
    "",
    factSection,
  ].join("\n");
}
