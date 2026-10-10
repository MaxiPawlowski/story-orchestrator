export type Inline =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "strong"; children: Inline[] }
  | { kind: "em"; children: Inline[] }
  | { kind: "link"; href: string; children: Inline[] }
  | { kind: "image"; src: string; alt: string };

export interface ListItem {
  children: Inline[];
  sub: ListBlock | null;
}

export interface ListBlock {
  kind: "list";
  ordered: boolean;
  items: ListItem[];
}

export type Block =
  | { kind: "heading"; level: number; children: Inline[]; text: string; anchor?: string }
  | { kind: "paragraph"; children: Inline[] }
  | { kind: "code"; text: string }
  | { kind: "quote"; children: Inline[] }
  | { kind: "rule" }
  | { kind: "table"; head: Inline[][]; rows: Inline[][][] }
  | ListBlock;

const ESCAPABLE = "\\`*_[]()#|!<>-.+{}";

const pushText = (out: Inline[], text: string) => {
  if (!text) return;
  const last = out[out.length - 1];
  if (last?.kind === "text") last.text += text;
  else out.push({ kind: "text", text });
};

const findClose = (source: string, from: number, marker: string): number => {
  for (let index = from; index <= source.length - marker.length; index += 1) {
    if (source[index] === "\\") { index += 1; continue; }
    if (source[index] === "`") {
      const end = source.indexOf("`", index + 1);
      if (end < 0) return -1;
      index = end;
      continue;
    }
    if (source.startsWith(marker, index) && index > from) return index;
  }
  return -1;
};

const wordChar = (char: string | undefined) => Boolean(char && /[\p{L}\p{N}]/u.test(char));

export const parseInline = (source: string): Inline[] => {
  const out: Inline[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (char === "\\" && ESCAPABLE.includes(source[index + 1] ?? "")) {
      pushText(out, source[index + 1]);
      index += 2;
      continue;
    }
    if (char === "`") {
      const end = source.indexOf("`", index + 1);
      if (end > index) {
        out.push({ kind: "code", text: source.slice(index + 1, end) });
        index = end + 1;
        continue;
      }
    }
    if (source.startsWith("**", index)) {
      const end = findClose(source, index + 2, "**");
      if (end > 0) {
        out.push({ kind: "strong", children: parseInline(source.slice(index + 2, end)) });
        index = end + 2;
        continue;
      }
    }
    if ((char === "*" || char === "_") && source[index + 1] !== char && source[index + 1] !== " ") {
      const opensInsideWord = char === "_" && wordChar(source[index - 1]);
      const end = opensInsideWord ? -1 : findClose(source, index + 1, char);
      if (end > 0 && source[end - 1] !== " " && !(char === "_" && wordChar(source[end + 1]))) {
        out.push({ kind: "em", children: parseInline(source.slice(index + 1, end)) });
        index = end + 1;
        continue;
      }
    }
    if (char === "!" && source[index + 1] === "[") {
      const close = findClose(source, index + 2, "]");
      if (close > 0 && source[close + 1] === "(") {
        const end = source.indexOf(")", close + 2);
        if (end > close) {
          out.push({ kind: "image", src: source.slice(close + 2, end).trim(), alt: inlineText(parseInline(source.slice(index + 2, close))) });
          index = end + 1;
          continue;
        }
      }
    }
    if (char === "[") {
      const close = findClose(source, index + 1, "]");
      if (close > 0 && source[close + 1] === "(") {
        const end = source.indexOf(")", close + 2);
        if (end > close) {
          out.push({ kind: "link", href: source.slice(close + 2, end), children: parseInline(source.slice(index + 1, close)) });
          index = end + 1;
          continue;
        }
      }
    }
    if (char === "<") {
      const end = source.indexOf(">", index + 1);
      const inner = end > index ? source.slice(index + 1, end) : "";
      if (/^https?:\/\/\S+$/.test(inner)) {
        out.push({ kind: "link", href: inner, children: [{ kind: "text", text: inner }] });
        index = end + 1;
        continue;
      }
    }
    pushText(out, char);
    index += 1;
  }
  return out;
};

export const inlineText = (nodes: Inline[]): string => nodes.map((node) => {
  if (node.kind === "text" || node.kind === "code") return node.text;
  if (node.kind === "image") return node.alt;
  return inlineText(node.children);
}).join("");

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
export const ANCHOR = /^<a id="([a-z0-9-]+)"><\/a>$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const indentOf = (line: string) => line.length - line.trimStart().length;

export const splitRow = (line: string): string[] => {
  const cells: string[] = [];
  let current = "";
  let code = false;
  const body = line.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "");
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char === "\\" && body[index + 1] === "|") { current += "\\|"; index += 1; continue; }
    if (char === "`") code = !code;
    if (char === "|" && !code) { cells.push(current.trim()); current = ""; continue; }
    current += char;
  }
  cells.push(current.trim());
  return cells;
};

const startsBlock = (line: string, next: string | undefined) => HEADING.test(line) || line.startsWith("```") || LIST_ITEM.test(line)
  || line.trimStart().startsWith(">") || RULE.test(line) || (line.trimStart().startsWith("|") && next !== undefined && TABLE_SEPARATOR.test(next));

const parseList = (lines: string[], start: number): { block: ListBlock; next: number } => {
  const first = LIST_ITEM.exec(lines[start]);
  const indent = first ? first[1].length : 0;
  const block: ListBlock = { kind: "list", ordered: Boolean(first && /\d/.test(first[2])), items: [] };
  let index = start;
  while (index < lines.length) {
    const line = lines[index];
    const match = LIST_ITEM.exec(line);
    if (!match || match[1].length !== indent) break;
    const text: string[] = [match[3]];
    let sub: ListBlock | null = null;
    index += 1;
    while (index < lines.length) {
      const next = lines[index];
      if (!next.trim()) {
        const after = lines[index + 1];
        if (after !== undefined && after.trim() && indentOf(after) > indent) { index += 1; continue; }
        break;
      }
      const nested = LIST_ITEM.exec(next);
      if (nested && nested[1].length > indent) {
        const parsed = parseList(lines, index);
        sub = parsed.block;
        index = parsed.next;
        continue;
      }
      if (nested || indentOf(next) <= indent) break;
      text.push(next.trim());
      index += 1;
    }
    block.items.push({ children: parseInline(text.join(" ")), sub });
    if (index < lines.length && !lines[index].trim()) {
      const after = lines[index + 1];
      const again = after !== undefined ? LIST_ITEM.exec(after) : null;
      if (again && again[1].length === indent) index += 1;
    }
  }
  return { block, next: index };
};

export const parseMarkdown = (source: string): Block[] => {
  const lines = source.replace(/\r\n/g, "\n").replace(/<!--[\s\S]*?-->/g, "").split("\n");
  const blocks: Block[] = [];
  let index = 0;
  let anchor: string | undefined;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    const named = ANCHOR.exec(line.trim());
    if (named) { anchor = named[1]; index += 1; continue; }
    const pending = anchor;
    anchor = undefined;
    if (line.startsWith("```")) {
      const end = lines.findIndex((candidate, at) => at > index && candidate.startsWith("```"));
      const stop = end < 0 ? lines.length : end;
      blocks.push({ kind: "code", text: lines.slice(index + 1, stop).join("\n") });
      index = stop + 1;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      const children = parseInline(heading[2]);
      blocks.push({ kind: "heading", level: heading[1].length, children, text: heading[2], ...(pending ? { anchor: pending } : {}) });
      index += 1;
      continue;
    }
    if (RULE.test(line)) { blocks.push({ kind: "rule" }); index += 1; continue; }
    if (line.trimStart().startsWith("|") && lines[index + 1] !== undefined && TABLE_SEPARATOR.test(lines[index + 1])) {
      const head = splitRow(line).map(parseInline);
      const rows: Inline[][][] = [];
      index += 2;
      while (index < lines.length && lines[index].trimStart().startsWith("|")) {
        rows.push(splitRow(lines[index]).map(parseInline));
        index += 1;
      }
      blocks.push({ kind: "table", head, rows });
      continue;
    }
    if (LIST_ITEM.test(line)) {
      const parsed = parseList(lines, index);
      blocks.push(parsed.block);
      index = parsed.next;
      continue;
    }
    if (line.trimStart().startsWith(">")) {
      const text: string[] = [];
      while (index < lines.length && lines[index].trimStart().startsWith(">")) {
        text.push(lines[index].trimStart().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ kind: "quote", children: parseInline(text.join(" ")) });
      continue;
    }
    const text: string[] = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !startsBlock(lines[index], lines[index + 1])) {
      text.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ kind: "paragraph", children: parseInline(text.join(" ")) });
  }
  return blocks;
};

export const plainText = (source: string): string => parseMarkdown(source).map((block) => {
  switch (block.kind) {
    case "code": return block.text;
    case "rule": return "";
    case "table": return [...block.head, ...block.rows.flat()].map(inlineText).join(" ");
    case "list": {
      const walk = (list: ListBlock): string => list.items.map((item) => `${inlineText(item.children)} ${item.sub ? walk(item.sub) : ""}`).join(" ");
      return walk(block);
    }
    default: return inlineText(block.children);
  }
}).join("\n");
