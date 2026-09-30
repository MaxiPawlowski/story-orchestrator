import { isRecord } from "@utils/guards";
import { normalizeJsonText } from "@utils/json";
import { nearestKey } from "@utils/levenshtein";
import type { AgentReply } from "./types";

const REPLY_KEYS = ["plan", "thought", "tool", "args", "done"] as const;

export type ParsedAgentReply = { ok: true; reply: AgentReply } | { ok: false; issues: string[] };

const fail = (...issues: string[]): ParsedAgentReply => ({ ok: false, issues });

export const parseAgentReply = (raw: string, expect: "plan" | "step"): ParsedAgentReply => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(normalizeJsonText(raw));
  } catch (error) {
    return fail(`not JSON: ${error instanceof Error ? error.message : "parse error"}. Reply with exactly one JSON object.`);
  }
  if (Array.isArray(parsed)) return fail("one reply is one JSON object with one tool call, never a list of calls.");
  if (!isRecord(parsed)) return fail("the reply must be a JSON object.");
  const unknown = Object.keys(parsed).filter((key) => !(REPLY_KEYS as readonly string[]).includes(key));
  if (unknown.length) {
    return fail(...unknown.map((key) => {
      const near = nearestKey(key, REPLY_KEYS);
      return `unknown reply key "${key}"${near ? ` (did you mean "${near}"?)` : ""}. One reply carries one tool call.`;
    }));
  }
  if (expect === "plan") {
    if (!Array.isArray(parsed.plan)) return fail("the first reply is the plan: {\"plan\": [\"step\", …]}.");
    const plan = parsed.plan.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim()).filter(Boolean);
    return plan.length ? { ok: true, reply: { kind: "plan", plan } } : fail("plan: at least one step.");
  }
  if (parsed.plan !== undefined) return fail("the plan is already agreed; reply with one tool call or done.");
  if (parsed.done !== undefined) {
    if (parsed.tool !== undefined) return fail("a reply is either one tool call or done, not both.");
    return { ok: true, reply: { kind: "done", summary: typeof parsed.done === "string" ? parsed.done.trim() : "" } };
  }
  if (typeof parsed.tool !== "string" || !parsed.tool.trim()) return fail("tool: required string naming one tool, or {\"done\": \"summary\"} when the plan is finished.");
  if (parsed.args !== undefined && !isRecord(parsed.args)) return fail("args: must be an object.");
  const thought = typeof parsed.thought === "string" && parsed.thought.trim() ? parsed.thought.trim() : undefined;
  return { ok: true, reply: { kind: "call", ...(thought ? { thought } : {}), call: { tool: parsed.tool.trim(), args: isRecord(parsed.args) ? parsed.args : {} } } };
};
