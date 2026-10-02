import { stripReasoningBlocks } from "@extraction/parse";

export interface Segment {
  start: number;
  end: number;
  text: string;
}

interface Unit {
  start: number;
  end: number;
  paragraphEnd: boolean;
}

const SENTENCE_END = /[.!?…]+["'”’)*\]]*(?=\s)|\n\s*\n/g;

function units(text: string, final: boolean): Unit[] {
  const out: Unit[] = [];
  let start = 0;
  for (const match of text.matchAll(SENTENCE_END)) {
    const end = (match.index ?? 0) + match[0].length;
    const paragraph = match[0].includes("\n") || /^\s*\n\s*\n/.test(text.slice(end));
    if (text.slice(start, end).trim()) out.push({ start, end, paragraphEnd: paragraph });
    else if (paragraph && out.length) out[out.length - 1].paragraphEnd = true;
    start = end;
  }
  if (final && text.slice(start).trim()) out.push({ start, end: text.length, paragraphEnd: true });
  return out;
}

const trimmed = (text: string, start: number, end: number): Segment => {
  const raw = text.slice(start, end);
  const lead = raw.length - raw.trimStart().length;
  const body = raw.trim();
  return { start: start + lead, end: start + lead + body.length, text: body };
};

export function segmentText(text: string, maxChars: number, final: boolean): Segment[] {
  const list = units(text, final);
  const out: Segment[] = [];
  let open: Unit | null = null;
  for (let i = 0; i < list.length; i += 1) {
    const unit = list[i];
    open = open ? { start: open.start, end: unit.end, paragraphEnd: unit.paragraphEnd } : { ...unit };
    const next = list[i + 1];
    const overflow = next ? text.slice(open.start, next.end).trim().length > maxChars : false;
    if (open.paragraphEnd || overflow || (!next && final)) {
      out.push(trimmed(text, open.start, open.end));
      open = null;
    }
  }
  return out.filter((segment) => segment.text.length > 0);
}

const STREAMING_PLACEHOLDER = "...";

export function visibleReply(text: string): string {
  const visible = stripReasoningBlocks(text).trim();
  return visible === STREAMING_PLACEHOLDER ? "" : visible;
}
