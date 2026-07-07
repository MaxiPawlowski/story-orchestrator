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

export function renderEpistemicContractSection(): string {
  return [
    "On a high-signal knowledge shift (a secret revealed, a lie told, a character learns or is deliberately kept from a fact), also emit per-character knowledge lines:",
    "[knows] Character | fact they now have direct knowledge of",
    "[unaware] Character | fact they do not know that others do",
    "[suspects] Character | something they sense without proof",
    "[believes] Character | something they hold as true that is actually false",
    "[hiding] Concealer from Target | what they are actively concealing",
    "Use each name exactly as it appears in the transcript. Emit these only when the transcript establishes the knowledge — never infer.",
  ].join("\n");
}

export function renderLedgerContractSection(entities: string[] = []): string {
  const known = entities.length ? [`Known entities: ${entities.join(", ")}.`] : [];
  return [
    ...known,
    "When an entity's current physical or operational state is explicitly shown, emit state lines:",
    "[state:EntityName:type] field=value | field=value",
    "type is one of character|object|place|faction. Include only fields explicitly stated or directly shown; omit anything unknown (never write field=unknown).",
  ].join("\n");
}

export function renderMemoryContractAddendum(openArcs: string[] = [], capable = false, entities: string[] = []): string {
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
    ...(capable ? ["", renderEpistemicContractSection(), "", renderLedgerContractSection(entities)] : []),
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

export interface EpistemicPassEntry {
  tag: string;
  subject: string;
  content: string;
  hiddenFrom?: string;
}

export function buildEpistemicPassPrompt(sceneText: string, participants: string[], existingEntries: EpistemicPassEntry[] = []): string {
  const participantHint = participants.length ? `Characters present in this scene: ${participants.join(", ")}.` : "";
  const existingBlock = existingEntries.length
    ? [
        "Existing knowledge entries (do not repeat these as new entries):",
        ...existingEntries.map((entry, index) => {
          const label = entry.tag === "hiding" && entry.hiddenFrom ? `[hiding] ${entry.subject} from ${entry.hiddenFrom} | ${entry.content}` : `[${entry.tag}] ${entry.subject} | ${entry.content}`;
          return `[${index + 1}] ${label}`;
        }),
        "After your new entries, output [retire] <number> for each existing entry that this scene explicitly supersedes, contradicts, or resolves. Only retire on an explicit change — never on inference.",
        "",
      ]
    : [];
  return [
    "[EPISTEMIC EXTRACTION TASK — output structured data only. Do NOT continue the roleplay.]",
    "Build a knowledge map: for each named character, what do they know, what do they falsely believe, what do they suspect, and what are they concealing?",
    "Output one entry per character per fact, using these tags:",
    "[knows]    Character | fact they have direct knowledge of",
    "[unaware]  Character | fact they do not know (but others do)",
    "[suspects] Character | incomplete belief — they sense something but lack proof",
    "[believes] Character | something they hold as true that is actually false",
    "[hiding]   Concealer from Target | what they are actively concealing",
    "Rules:",
    "- Only record what the scene establishes — do not infer beyond what is shown.",
    "- Use each character's name exactly as it appears. One character and one fact per line. No duplicates.",
    "- WITNESS: if the scene states a character observed something, you MUST output a [knows] line for them.",
    "- DECEPTION: when a character makes a false statement, write [hiding] for the liar; if a listener accepts it unchallenged, also write [believes] for them with the false content.",
    "- KNOWS vs SUSPECTS: a character explicitly told a fact [knows] it; reserve [suspects] for a feeling without direct information.",
    "- BELIEVES is ONLY for demonstrably false beliefs — never for correct conclusions or mere feelings.",
    "If nothing is established, output NONE.",
    "",
    ...existingBlock,
    participantHint,
    "Scene:",
    sceneText,
    "",
    "Output:",
  ].filter((line) => line !== "").join("\n");
}

export interface LedgerPassEntity {
  name: string;
  type: string;
}

export function buildLedgerPassPrompt(excerpt: string, entityList: LedgerPassEntity[] = []): string {
  const entityLines = entityList.length ? entityList.map((entity) => `- ${entity.name} (${entity.type})`).join("\n") : "- (infer named entities from the excerpt)";
  return [
    "[STATE EXTRACTION TASK — do NOT continue the roleplay. Output structured data only.]",
    "Track the current physical and operational state of known entities.",
    "Known entities:",
    entityLines,
    "Available fields by type:",
    "- character: location, injuries, outfit_disguise, mood, active_goal, carried_items",
    "- object: owner, location, condition, status",
    "- place: occupants, hazards, political_control, damage, accessibility",
    "- faction: leadership, objective, alliances, hostility_level",
    "Output one line per entity, the tag first then all known fields separated by |:",
    "[state:EntityName:type] field=value | field=value",
    "STRICT RULES:",
    "- Include ONLY fields explicitly stated or directly shown. Never infer.",
    "- Omit any uncertain field entirely — never write field=unknown or a placeholder.",
    "- An entity not mentioned in the excerpt produces no line.",
    "If nothing is known about any entity, output NONE.",
    "",
    "Excerpt:",
    excerpt,
    "",
    "Output:",
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

export function buildShortTermSummaryPrompt(previousSummary: string | null, recentText: string): string {
  return [
    "Maintain a rolling 3-5 sentence summary of recent play; it complements scene history during long scenes.",
    previousSummary
      ? "Update the existing summary with the new messages: keep what still matters, fold in what changed, drop what the new messages made irrelevant."
      : "Write the summary from the messages below.",
    "Write in past tense, narrative style. Output only the updated summary text. No notes, no commentary.",
    ...(previousSummary ? ["", "EXISTING SUMMARY:", previousSummary] : []),
    "",
    "NEW MESSAGES:",
    recentText,
  ].join("\n");
}
