import { outsideQuotes, phraseSpans, quoteSpans, sentenceSpans, type Span } from "./text";

export const FINDING_KINDS = ["avoid", "tic", "repeat"] as const;
export type FindingKind = (typeof FINDING_KINDS)[number];

export interface Finding extends Span {
  kind: FindingKind;
  phrase: string;
}

export interface PolishTargets {
  avoid: readonly string[];
  tics: readonly string[];
  repeats: readonly string[];
}

export interface PolishWindow extends Span {
  index: number;
  text: string;
  findings: Finding[];
}

export const targetPhrases = (targets: PolishTargets): string[] => [...new Set([...targets.avoid, ...targets.tics, ...targets.repeats].map((phrase) => phrase.trim()).filter(Boolean))];

const KIND_LISTS: ReadonlyArray<[FindingKind, keyof PolishTargets]> = [["avoid", "avoid"], ["tic", "tics"], ["repeat", "repeats"]];

export const findingsIn = (text: string, targets: PolishTargets, from = 0): Finding[] | null => {
  const quotes = quoteSpans(text);
  if (!quotes) return null;
  const found: Finding[] = [];
  for (const [kind, key] of KIND_LISTS) {
    for (const phrase of targets[key]) {
      for (const span of outsideQuotes(phraseSpans(text, phrase), quotes)) {
        if (span.start < from || found.some((seen) => span.start < seen.end && span.end > seen.start)) continue;
        found.push({ ...span, kind, phrase });
      }
    }
  }
  return found.sort((left, right) => left.start - right.start);
};

export const windowsFor = (text: string, findings: readonly Finding[]): PolishWindow[] => {
  const quotes = quoteSpans(text) ?? [];
  const picked = sentenceSpans(text, quotes).filter((sentence) => findings.some((finding) => finding.start >= sentence.start && finding.end <= sentence.end));
  const merged: Span[] = [];
  for (const sentence of picked) {
    const last = merged[merged.length - 1];
    if (last && !text.slice(last.end, sentence.start).trim()) last.end = sentence.end;
    else merged.push({ ...sentence });
  }
  return merged.map((span, position) => ({
    ...span, index: position + 1, text: text.slice(span.start, span.end),
    findings: findings.filter((finding) => finding.start >= span.start && finding.end <= span.end),
  }));
};

export const anchorsOf = (text: string, windows: readonly PolishWindow[]): string[] => {
  const anchors: string[] = [];
  let cursor = 0;
  for (const window of windows) {
    anchors.push(text.slice(cursor, window.start));
    cursor = window.end;
  }
  anchors.push(text.slice(cursor));
  return anchors;
};

export const assemble = (text: string, windows: readonly PolishWindow[], replaced: readonly string[]): string => {
  const anchors = anchorsOf(text, windows);
  return anchors.map((anchor, position) => anchor + (position < replaced.length ? replaced[position] : "")).join("");
};

export type AlignFailure = "outside-window" | "ambiguous-alignment";

export type Alignment = { ok: true; replaced: string[] } | { ok: false; code: AlignFailure };

const count = (text: string, needle: string): number => {
  if (!needle) return 0;
  let seen = 0;
  for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + 1)) seen += 1;
  return seen;
};

export const align = (original: string, windows: readonly PolishWindow[], candidate: string): Alignment => {
  const anchors = anchorsOf(original, windows);
  const head = anchors[0];
  const tail = anchors[anchors.length - 1];
  if (!candidate.startsWith(head) || !candidate.endsWith(tail) || candidate.length < head.length + tail.length) return { ok: false, code: "outside-window" };
  const body = candidate.slice(head.length, candidate.length - tail.length);
  const inner = anchors.slice(1, -1);
  const replaced: string[] = [];
  let cursor = 0;
  for (const anchor of inner) {
    if (!anchor.trim()) return { ok: false, code: "ambiguous-alignment" };
    const at = body.indexOf(anchor, cursor);
    if (at < 0) return { ok: false, code: "outside-window" };
    if (count(body.slice(cursor), anchor) > 1) return { ok: false, code: "ambiguous-alignment" };
    replaced.push(body.slice(cursor, at));
    cursor = at + anchor.length;
  }
  replaced.push(body.slice(cursor));
  return { ok: true, replaced };
};
