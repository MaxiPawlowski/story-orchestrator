import type { DirectorPromptInput } from "./types";

export function renderDirectorPrompt(input: DirectorPromptInput): string {
  const names = input.candidates.map((candidate) => candidate.name);
  const answers = input.allowSilence ? [...names, "NONE"] : names;
  return [
    `Story: ${input.storyTitle}`,
    `Scene: ${input.checkpointName} — ${input.objective}`,
    "",
    "You are the scene director. Read the transcript and decide which character should speak next.",
    `Candidates: ${names.join(", ")}`,
    ...(input.lead ? [`Scene lead: ${input.lead} (prefer them when no one else is clearly addressed).`] : []),
    ...(input.instruction ? [`Author guidance: ${input.instruction}`] : []),
    "Pick the character who was addressed, challenged, or has the strongest reason to react.",
    ...(input.allowSilence ? ["If nobody was addressed and none of the candidates has a reason to speak, answer NONE."] : []),
    "",
    "Transcript:",
    ...input.window.map((message) => `${message.speaker}: ${message.text}`),
    "",
    `Answer with exactly one line: SPEAKER: <${answers.join(" | ")}>`,
  ].join("\n");
}
