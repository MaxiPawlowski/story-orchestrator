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
