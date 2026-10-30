export interface JsonRepair {
  value: unknown;
  fixes: string[];
}

const CLOSER: Record<string, string> = { "{": "}", "[": "]" };

const CONTROL: Record<string, string> = { "\n": "\\n", "\r": "\\r", "\t": "\\t" };

const escapeControl = (char: string): string => CONTROL[char] ?? `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;

const dropTrailingComma = (out: string): { out: string; dropped: boolean } => {
  const trimmed = out.trimEnd();
  return trimmed.endsWith(",") ? { out: trimmed.slice(0, -1), dropped: true } : { out, dropped: false };
};

export function repairJsonObject(raw: string): JsonRepair | null {
  const start = raw.indexOf("{");
  if (start < 0) return null;
  const fixes = new Set<string>();
  if (raw.slice(0, start).trim()) fixes.add("text before the object dropped");
  const stack: string[] = [];
  let out = "";
  let inString = false;
  let escaped = false;
  let end = -1;
  for (let index = start; index < raw.length; index += 1) {
    const char = raw[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
      else if (char.charCodeAt(0) < 0x20) {
        out += escapeControl(char);
        fixes.add("raw control character escaped");
        continue;
      }
      out += char;
      continue;
    }
    if (char === "\"") inString = true;
    else if (char === "{" || char === "[") stack.push(CLOSER[char]);
    else if (char === "}" || char === "]") {
      if (stack.pop() !== char) return null;
      const trimmed = dropTrailingComma(out);
      if (trimmed.dropped) fixes.add("trailing comma removed");
      out = trimmed.out;
      if (!stack.length) {
        out += char;
        end = index;
        break;
      }
    }
    out += char;
  }
  if (inString) return null;
  if (end >= 0 && raw.slice(end + 1).trim()) fixes.add("text after the object dropped");
  if (stack.length) {
    const trimmed = dropTrailingComma(out);
    if (trimmed.dropped) fixes.add("trailing comma removed");
    out = trimmed.out.trimEnd() + stack.reverse().join("");
    fixes.add("unclosed brackets closed");
  }
  try {
    return { value: JSON.parse(out), fixes: [...fixes] };
  } catch {
    return null;
  }
}
