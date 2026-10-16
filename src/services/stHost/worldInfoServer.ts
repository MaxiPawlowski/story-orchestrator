import { getContext } from "./context";

export interface Lorebook {
  entries: Record<number, LoreEntry>;
}

export interface LoreEntry {
  uid: number;
  comment: string;
  [key: string]: unknown;
}

// ST's `_save` posts `/api/worldinfo/edit` and never reads the answer (world-info.js:4151), so a
// refused save resolves exactly like a kept one. The server's own copy is the evidence; `null` means
// the read itself could not answer, which is not evidence of a lost write.
export async function readServerLorebook(name: string): Promise<Lorebook | null> {
  try {
    const headers = getContext().getRequestHeaders?.() ?? {};
    const response = await fetch("/api/worldinfo/get", { method: "POST", headers, body: JSON.stringify({ name }), cache: "no-cache" });
    if (!response.ok) return null;
    const data = await response.json() as Lorebook | null;
    return data?.entries ? data : null;
  } catch {
    return null;
  }
}

export const LORE_COMMIT_ROUTE = "/api/plugins/story-orchestrator-lore/commit";

export type LoreCommit = { kind: "committed" } | { kind: "conflict" } | { kind: "absent" } | { kind: "failed"; reason: string };

export async function commitLorebook(name: string, expected: string, data: Lorebook): Promise<LoreCommit> {
  const headers = getContext().getRequestHeaders?.() ?? {};
  const response = await fetch(LORE_COMMIT_ROUTE, { method: "POST", headers, body: JSON.stringify({ name, expected, data }) }).catch(() => null);
  if (!response) return { kind: "failed", reason: "the lorebook commit could not reach the server" };
  if (response.status === 404) return { kind: "absent" };
  if (response.status === 409) return { kind: "conflict" };
  return response.ok ? { kind: "committed" } : { kind: "failed", reason: `the lorebook commit answered ${response.status}` };
}
