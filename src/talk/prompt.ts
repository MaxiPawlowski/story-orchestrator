import { distinctAliases } from "./aliases";
import type { DirectorPromptInput, TalkCandidate } from "./types";

const candidateLine = (candidate: TalkCandidate, aliases: string[]) =>
  `- ${candidate.name}${aliases.length ? ` (also called: ${aliases.join(", ")})` : ""}${candidate.role?.trim() ? `: ${candidate.role.trim()}` : ""}`;

export function renderDirectorPrompt(input: DirectorPromptInput): string {
  const names = input.candidates.map((candidate) => candidate.name);
  const answers = [...names, ...(input.handBack ? ["PLAYER"] : []), ...(input.allowSilence ? ["NONE"] : [])];
  const player = input.playerName?.trim() || "the player";
  const aliases = distinctAliases(input.candidates);
  const listed = input.candidates.some((candidate) => candidate.role?.trim() || aliases.get(candidate.rosterId)?.length);
  return [
    "[SPEAKER CHOICE TASK — answer with one line only. Do NOT continue the roleplay.]",
    `Story: ${input.storyTitle}`,
    `Scene: ${input.checkpointName} — ${input.objective}`,
    "",
    "You are the scene director. Read the transcript and decide which character should speak next.",
    listed ? `Candidates:\n${input.candidates.map((candidate) => candidateLine(candidate, aliases.get(candidate.rosterId) ?? [])).join("\n")}` : `Candidates: ${names.join(", ")}`,
    player === "the player" ? "The player is not a candidate." : `${player} is the player, not a candidate.`,
    ...(input.lead ? [input.sceneWork === false
      ? `Scene lead: ${input.lead}, only for scene work (an arrival, a move, time passing, an action no one answers). `
        + `A character has just spoken and nothing new needs narrating: do not pick ${input.lead} to fill the pause.`
      : `Scene lead: ${input.lead} (prefer them when no one else is clearly addressed).`] : []),
    ...(input.instruction ? [`Author guidance: ${input.instruction}`] : []),
    "Pick the character who was addressed, challenged, or has the strongest reason to react.",
    ...(input.handBack ? [
      `Answer PLAYER if the scene has said all it needs and ${player} should act next.`,
      `A character ${player}'s last message spoke to who has not answered yet comes before PLAYER.`,
    ] : []),
    ...(input.allowSilence ? ["If nobody was addressed and none of the candidates has a reason to speak, answer NONE."] : []),
    "",
    "Transcript:",
    ...input.window.map((message) => `${message.speaker}: ${message.text}`),
    "",
    `Answer with exactly one line, the name only, spelled as listed: SPEAKER: <${answers.join(" | ")}>`,
  ].join("\n");
}
