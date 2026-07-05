import { FACT_ENTRY_TYPES, MEMORY_EXPIRATIONS, SESSION_ENTRY_TYPES } from "./types";

export function renderMemoryContractAddendum(): string {
  return [
    "Also extract memory notes worth keeping across turns, and report scene breaks.",
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
