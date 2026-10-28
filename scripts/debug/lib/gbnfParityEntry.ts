import { expressionGrammar, expressionPrompt, parseExpressionLines, type ExpressionInput } from "../../../src/sprites/classify";
import { segmentText } from "../../../src/sprites/segment";
import { pickPose } from "../../../src/sprites/poses/pick";
import { shippedPoses } from "../../../src/sprites/poses/library";

export interface GbnfCase { id: string; kind: "expression" | "pose"; system: string; user: string; grammar: string; valid: (text: string) => boolean }

const LABELS: ExpressionInput["labels"] = {
  neutral: { what: "calm, unreadable face", notFor: "strong feeling", examples: [], fallback: [] },
  joy: { what: "smiling or laughing", notFor: "a polite smile", examples: [], fallback: [] },
  anger: { what: "scowl, bared teeth, raised voice", notFor: "mild annoyance", examples: [], fallback: [] },
  sadness: { what: "downcast eyes, tears, a falling face", notFor: "tiredness", examples: [], fallback: [] },
  surprise: { what: "wide eyes, open mouth", notFor: "curiosity", examples: [], fallback: [] },
};

const REPLIES: Array<{ speaker: string; cast: string[]; text: string }> = [
  { speaker: "Belle", cast: ["Belle"], text: "Belle laughs and slams her tankard down. \"Ha! You call that a punch?\"\n\nThen her face falls. \"He didn't make it back, did he?\" She stares at the fire." },
  { speaker: "Arin", cast: ["Arin", "Belle"], text: "Arin's jaw tightens. \"You sold the map?\"\n\nBelle shrugs, grinning. \"For a good price.\"\n\nThe fire pops between them." },
  { speaker: "Arin", cast: ["Arin"], text: "Arin blinks at the open chest, mouth slack. \"Empty. All of it.\"" },
  { speaker: "Belle", cast: ["Belle", "Arin"], text: "The rain keeps falling on the empty road.\n\nBelle wipes her eyes and says nothing.\n\nArin hums a tune, calm as stone." },
];

const POSE_TEXTS: Array<{ member: string; text: string }> = [
  { member: "Arin", text: "Arin sits down heavily on the bench and rubs his knees." },
  { member: "Arin", text: "\"I would never,\" Arin says." },
  { member: "Belle", text: "Belle crosses her arms and leans against the doorframe." },
  { member: "Belle", text: "Belle raises her sword above her head and charges." },
  { member: "Arin", text: "If Belle were here she would be dancing on the table." },
  { member: "Belle", text: "Belle kneels beside the wounded scout and presses on the cut." },
];

const expressionCase = (reply: (typeof REPLIES)[number], index: number): GbnfCase => {
  const input: ExpressionInput = { speaker: reply.speaker, cast: reply.cast, labels: LABELS, localMap: {}, fallbackLabel: "neutral", segments: segmentText(reply.text, 400, true).map((segment, at) => ({ index: at + 1, text: segment.text })) };
  const { system, user } = expressionPrompt(input);
  return { id: `expression-${index + 1}`, kind: "expression", system, user, grammar: expressionGrammar(input), valid: (text) => parseExpressionLines(text, input) !== null };
};

async function poseCase(entry: (typeof POSE_TEXTS)[number], index: number): Promise<GbnfCase> {
  const poses = shippedPoses();
  let captured: { system: string; user: string; grammar: string } | null = null;
  await pickPose({ text: entry.text, member: entry.member, poses }, { judge: null, llm: async (system, user, grammar) => { captured = { system, user, grammar }; return "none"; } });
  if (!captured) throw new Error(`pose case ${index + 1}: pickPose made no grammar call`);
  const { system, user, grammar } = captured as { system: string; user: string; grammar: string };
  const ids = new Set([...poses.map((pose) => pose.id), "none"]);
  return { id: `pose-${index + 1}`, kind: "pose", system, user, grammar, valid: (text) => ids.has(text.trim()) };
}

export async function gbnfCases(): Promise<GbnfCase[]> {
  return [...REPLIES.map(expressionCase), ...(await Promise.all(POSE_TEXTS.map(poseCase)))];
}
