interface CharacterSummaryLike {
  name: string;
  description?: string;
}

interface CheckpointSummaryLike {
  name: string;
  objective: string;
  status: "complete" | "failed" | "current";
}

interface SeedQuestionnaireLike {
  genre: string;
  tone: string;
  length: string;
  focus: string;
}

export function buildCharacterContext(characters: CharacterSummaryLike[]): string {
  if (!characters.length) return "No characters specified.";
  return characters.map((character) => character.description ? `${character.name}: ${character.description}` : character.name).join("\n");
}

export function buildWorldInfoContext(worldInfo: string[]): string {
  if (!worldInfo.length) return "No active world info.";
  return worldInfo.join("\n");
}

export function buildPastCheckpointsContext(past: CheckpointSummaryLike[]): string {
  if (!past.length) return "None completed yet.";
  return past.map((checkpoint) => `[${checkpoint.status}] ${checkpoint.name} — ${checkpoint.objective}`).join("\n");
}

export function buildSeedRoadmapPrompt(args: {
  premise: string;
  characters: CharacterSummaryLike[];
  worldInfo: string[];
  globalLorebook: string;
  questionnaire?: SeedQuestionnaireLike;
}): string {
  const lorebookContext = args.globalLorebook && args.globalLorebook !== "Story World" ? `\nSETTING/LOREBOOK: ${args.globalLorebook}` : "";
  const questionnaireContext = args.questionnaire
    ? `\nSTORY PARAMETERS:\n- Genre: ${args.questionnaire.genre}\n- Tone: ${args.questionnaire.tone}\n- Length: ${args.questionnaire.length}\n- Focus: ${args.questionnaire.focus}`
    : "";

  return `You are a narrative director.\n\nPREMISE:\n${args.premise}${lorebookContext}${questionnaireContext}\n\nCHARACTERS:\n${buildCharacterContext(args.characters)}\n\nACTIVE WORLD INFO:\n${buildWorldInfoContext(args.worldInfo)}\n\nWrite a narrative roadmap for this story. Include:\n- Tone and themes\n- Each character's arc and motivation\n- Key turning points and possible paths\n- 2-3 possible endings\n\nWrite in prose, 150-250 words. This is a living outline, not a fixed script.\n\nReturn ONLY the prose text, no JSON, no headings.`;
}

export function buildSeedCheckpointPrompt(args: {
  roadmap: string;
  storyTitle: string;
  characters: CharacterSummaryLike[];
}): string {
  return `You are a narrative director.\n\nNARRATIVE ROADMAP:\n${args.roadmap}\n\nSTORY TITLE: ${args.storyTitle}\n\nGenerate the OPENING story beat as JSON. Return ONLY this JSON object (no code fences):\n{\n  "name": "short evocative name for this opening scene",\n  "objective": "what the player encounters and should do in this opening scene",\n  "roles": {\n    "roleId": "Character Display Name"\n  }\n}\n\nRole IDs should be short lowercase identifiers (e.g. "companion", "villain", "innkeeper").\nBase roles on these characters: ${args.characters.map((character) => character.name).join(", ")}`;
}

export function buildSeedTransitionsPrompt(args: {
  roadmap: string;
  checkpointName: string;
  checkpointObjective: string;
  roleList: string;
}): string {
  return `You are a narrative director.\n\nNARRATIVE ROADMAP:\n${args.roadmap}\n\nCURRENT CHECKPOINT: "${args.checkpointName}" — ${args.checkpointObjective}\nROLES: ${args.roleList}\n\nGenerate 2-3 outgoing transitions from this checkpoint. Each transition should have a unique destination ID.\nReturn ONLY this JSON (no code fences):\n{\n  "transitions": [\n    {\n      "to_id": "unique-destination-id",\n      "label": "short label",\n      "trigger": {\n        "type": "regex",\n        "patterns": ["/pattern/i"],\n        "condition": "plain-language description of what the player does to trigger this"\n      }\n    }\n  ]\n}`;
}

export function buildSeedActionsPrompt(args: {
  roadmap: string;
  checkpointName: string;
  checkpointObjective: string;
  roleList: string;
}): string {
  return `You are a narrative director.\n\nNARRATIVE ROADMAP:\n${args.roadmap}\n\nCHECKPOINT: "${args.checkpointName}" — ${args.checkpointObjective}\nROLES: ${args.roleList}\n\nGenerate scene configuration for this opening checkpoint. Return ONLY this JSON (no code fences):\n{\n  "authors_note": {\n    "roleId": {\n      "text": "behavioral instruction for this character in this scene",\n      "position": "chat",\n      "interval": 3,\n      "depth": 4\n    }\n  },\n  "talkControl": {\n    "replies": [\n      {\n        "memberId": "roleId",\n        "trigger": "onEnter",\n        "probability": 90,\n        "maxTriggers": 1,\n        "content": { "kind": "llm", "instruction": "Brief instruction for how this character should open the scene" }\n      }\n    ]\n  }\n}`;
}

export function buildExpansionRoadmapPrompt(args: {
  roadmap: string;
  transitionLabel: string;
  transitionCondition: string;
  chatSummary: string;
}): string {
  return `You are a narrative director managing a living story.\n\nCURRENT ROADMAP:\n${args.roadmap}\n\nWHAT JUST HAPPENED:\nThe player took the transition "${args.transitionLabel}": ${args.transitionCondition}\n\nRECENT CHAT:\n${args.chatSummary}\n\nUpdate the roadmap to reflect what actually happened and what new possibilities are now open.\nKeep 150-250 words. Adjust character arcs, remove closed paths, add new ones if the chat revealed something unexpected.\n\nReturn ONLY the updated prose roadmap text.`;
}

export function buildExpansionCheckpointPrompt(args: {
  roadmap: string;
  premise: string;
  pastCheckpoints: CheckpointSummaryLike[];
  transitionLabel: string;
  transitionCondition: string;
  chatSummary: string;
  characters: CharacterSummaryLike[];
  worldInfo: string[];
  targetCheckpointId: string;
  targetCheckpointName: string;
}): string {
  return `You are a narrative director.\n\nNARRATIVE ROADMAP:\n${args.roadmap}\n\nPREMISE: ${args.premise}\n\nSTORY SO FAR:\n${buildPastCheckpointsContext(args.pastCheckpoints)}\n\nTRANSITION TAKEN: "${args.transitionLabel}" — ${args.transitionCondition}\n\nRECENT CHAT:\n${args.chatSummary}\n\nCHARACTERS:\n${buildCharacterContext(args.characters)}\n\nACTIVE WORLD INFO:\n${buildWorldInfoContext(args.worldInfo)}\n\nGenerate the next story beat. Checkpoint ID must be exactly: "${args.targetCheckpointId}"\nThe player just did: "${args.transitionCondition}". Continue naturally.\n\nReturn ONLY this JSON (no code fences):\n{\n  "name": "${args.targetCheckpointName || "Next Beat"}",\n  "objective": "what the player encounters and should do in this beat"\n}`;
}

export function buildExpansionTransitionsPrompt(args: {
  roadmap: string;
  checkpointName: string;
  checkpointObjective: string;
  characterContext: string;
  existingCheckpointIds: string[];
}): string {
  return `You are a narrative director.\n\nNARRATIVE ROADMAP:\n${args.roadmap}\n\nCURRENT CHECKPOINT: "${args.checkpointName}" — ${args.checkpointObjective}\nCHARACTERS: ${args.characterContext}\n\nGenerate 2-3 outgoing transitions. Do NOT reuse these existing IDs: ${args.existingCheckpointIds.join(", ")}.\nReturn ONLY this JSON (no code fences):\n{\n  "transitions": [\n    {\n      "to_id": "unique-new-destination-id",\n      "label": "short label",\n      "trigger": {\n        "type": "regex",\n        "patterns": ["/pattern/i"],\n        "condition": "what the player does to trigger this"\n      }\n    }\n  ]\n}`;
}

export function buildExpansionActionsPrompt(args: {
  roadmap: string;
  checkpointName: string;
  checkpointObjective: string;
  characterContext: string;
}): string {
  return `You are a narrative director.\n\nNARRATIVE ROADMAP:\n${args.roadmap}\n\nCHECKPOINT: "${args.checkpointName}" — ${args.checkpointObjective}\nCHARACTERS: ${args.characterContext}\n\nGenerate scene configuration. Return ONLY this JSON (no code fences):\n{\n  "authors_note": {\n    "roleId": {\n      "text": "behavioral instruction for this character in this scene",\n      "position": "chat",\n      "interval": 3,\n      "depth": 4\n    }\n  },\n  "talkControl": {\n    "replies": [\n      {\n        "memberId": "roleId",\n        "trigger": "onEnter",\n        "probability": 90,\n        "maxTriggers": 1,\n        "content": { "kind": "llm", "instruction": "How this character should open the scene" }\n      }\n    ]\n  }\n}`;
}
