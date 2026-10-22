import { DELIVERY_TOKEN_CAP, type RosterPolish } from "@engine/deliverySchema";

export const DELIVERY_HEADER = "How you speak (wording only; it never changes what you know, want or do):";
export const REPETITION_LINE_MAX = 3;

export interface DeliveryInput {
  sheet?: RosterPolish;
  mood?: string | null;
  repeated?: readonly string[];
}

export interface DeliveryRender {
  lines: string[];
  tokens: number;
  cut: string[];
}

export const deliveryTokens = (text: string): number => Math.ceil(text.length / 4);

const sentence = (text: string) => (/[.!?…]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);

const sentencesOf = (text: string): string[] => text.trim().match(/[^.!?…]+(?:[.!?…]+|$)/g)?.map((part) => part.trim()).filter(Boolean) ?? [];

interface Parts {
  notes: string[];
  mood: string | null;
  rhythm: string | null;
  prefer: string[];
  avoid: string[];
  repeated: string[];
}

const partsOf = (input: DeliveryInput): Parts => {
  const sheet = input.sheet;
  const moodText = input.mood && sheet?.by_mood?.[input.mood];
  return {
    notes: sheet?.notes ? sentencesOf(sheet.notes) : [],
    mood: moodText ? `Right now (${input.mood}): ${sentence(moodText)}` : null,
    rhythm: sheet?.rhythm ? `Rhythm: ${sheet.rhythm}.` : null,
    prefer: [...(sheet?.prefer ?? [])],
    avoid: [...(sheet?.avoid ?? [])],
    repeated: [...(input.repeated ?? [])].sort((left, right) => right.length - left.length).slice(0, REPETITION_LINE_MAX),
  };
};

const linesOf = (parts: Parts): string[] => {
  const voice = [...parts.notes.map(sentence), ...(parts.mood ? [parts.mood] : [])];
  const habits = [
    ...(parts.rhythm ? [parts.rhythm] : []),
    ...(parts.prefer.length ? [`Words that are yours: ${parts.prefer.join(", ")}.`] : []),
    ...(parts.avoid.length ? [`Say it your own way instead of: ${parts.avoid.join(", ")}.`] : []),
  ];
  const sheetLines = voice.length || habits.length ? [[DELIVERY_HEADER, ...voice].join(" "), ...(habits.length ? [habits.join(" ")] : [])] : [];
  const repetition = parts.repeated.length ? [`Lately you keep using: ${parts.repeated.map((phrase) => `"${phrase}"`).join(", ")} — vary it.`] : [];
  return [...sheetLines, ...repetition];
};

const tokensOf = (lines: string[]) => deliveryTokens(lines.join("\n"));

type Cut = { label: string; apply: (parts: Parts) => boolean };

const dropLast = (key: "prefer" | "avoid" | "repeated" | "notes", label: string): Cut => ({
  label, apply: (parts) => {
    if (!parts[key].length) return false;
    parts[key] = parts[key].slice(0, -1);
    return true;
  },
});

const dropField = (key: "rhythm" | "mood"): Cut => ({
  label: key, apply: (parts) => {
    if (!parts[key]) return false;
    parts[key] = null;
    return true;
  },
});

const CUTS: readonly Cut[] = [
  dropLast("prefer", "prefer"), dropLast("avoid", "avoid"), dropLast("repeated", "repetition"), dropField("rhythm"), dropLast("notes", "notes"), dropField("mood"),
];

export const renderDelivery = (input: DeliveryInput, cap: number = DELIVERY_TOKEN_CAP): DeliveryRender => {
  const parts = partsOf(input);
  const cut: string[] = [];
  let lines = linesOf(parts);
  for (const step of CUTS) {
    while (tokensOf(lines) > cap && step.apply(parts)) {
      if (!cut.includes(step.label)) cut.push(step.label);
      lines = linesOf(parts);
    }
  }
  return { lines, tokens: lines.length ? tokensOf(lines) : 0, cut };
};
