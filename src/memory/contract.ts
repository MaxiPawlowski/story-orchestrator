import { FACT_ENTRY_TYPES, MEMORY_EXPIRATIONS, SESSION_ENTRY_TYPES } from "./types";

export function renderArcContractSection(openArcs: string[] = []): string {
  const existing = openArcs.length
    ? ["EXISTING OPEN ARCS (read-only context — do not copy or re-output these):", ...openArcs.map((arc) => `[arc] ${arc}`), ""]
    : [];
  return [
    ...existing,
    "Track story arcs: open narrative threads still in motion — unresolved conflicts, unfulfilled promises, active goals, open mysteries, unplayed tensions. Report the few that matter most, not every loose detail.",
    "Not arcs: tactical/logistical details, single-scene contingencies, or facts about events that already happened and are over.",
    "Output arc lines in exactly these formats:",
    "[arc] <a NEW unresolved thread introduced in this window, not already listed above>",
    "[resolved] <brief description of an existing open arc that this window explicitly closed>",
    "Only mark [resolved] when the window directly closes the thread (promise kept, mystery answered, conflict ended); a related revelation is not a resolution.",
  ].join("\n");
}

export function renderMemoryContractAddendum(openArcs: string[] = []): string {
  return [
    "Also extract memory notes worth keeping across turns, report scene breaks, and track story arcs.",
    `Facts tier types (${FACT_ENTRY_TYPES.join(", ")}) — durable, cross-session:`,
    "- fact: an established truth about a character or the world.",
    "- relationship: the current state of the bond between participants.",
    "- preference: something the user demonstrably enjoys (tone, pacing, content).",
    "- event: a significant event that occurred and should be recalled.",
    `Session tier types (${SESSION_ENTRY_TYPES.join(", ")}) — finer within-chapter specifics:`,
    "- scene: a current/recent scene detail (location, atmosphere, time, layout).",
    "- revelation: something revealed or discovered in this exchange.",
    "- development: how a relationship or situation changed.",
    "- detail: a specific fact, name, object, or physical detail mentioned.",
    `Rate importance 1-3 (1=atmospheric/minor, 2=useful context, 3=critical/defining) and classify expiration as one of ${MEMORY_EXPIRATIONS.join("|")}.`,
    "Optionally tag involved named entities (proper nouns only) as entity=\"Name1,Name2\", and the enabled roster member the memory concerns as character=\"<roster id>\".",
    "Output additional lines in this exact format:",
    "MEMORY type=<type> importance=<1|2|3> expiration=<scene|session|permanent> [entity=\"Name1,Name2\"] [character=\"<roster id>\"] text=\"memory text\" evidence=\"exact quote from transcript\"",
    "Then report whether a scene break occurred in this window:",
    "SCENE_BREAK at=<message index> reason=<time_skip|location|divider|cast>",
    "If no scene break occurred, output SCENE_NONE.",
    "",
    renderArcContractSection(openArcs),
  ].join("\n");
}

export function buildArcSummaryPrompt(arcContent: string, sceneSummaries: string, memories: string): string {
  const sceneSection = sceneSummaries ? `\nSCENE SUMMARIES:\n${sceneSummaries}\n` : "";
  const memSection = memories ? `\nKEY MEMORIES FROM THIS ARC:\n${memories}\n` : "";
  return [
    "Write a single paragraph summarising the story arc below from opening to resolution.",
    "Write in past tense, narrative style. Cover what happened, who was involved, and how it resolved. Be concise — 3-5 sentences.",
    "Output only the paragraph, no labels or commentary.",
    "",
    `ARC: ${arcContent}${sceneSection}${memSection}`,
  ].join("\n");
}

export function buildSceneSummaryPrompt(sceneText: string): string {
  return [
    "Write a 2-3 sentence summary of the following scene for use as scene history.",
    "Write in past tense, narrative style. Capture what happened, where, and the emotional tone. Be concise.",
    "Output only the summary text. No notes, no commentary, no disclaimers.",
    "",
    "SCENE:",
    sceneText,
  ].join("\n");
}
