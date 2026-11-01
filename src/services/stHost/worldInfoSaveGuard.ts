import { couldNot, wrote, type WriteResult } from "@utils/writeResult";
import { log } from "@utils/log";
import { entriesImage, lorebookRevision } from "./lorebookImage";
import { mergeLorebookEntries, type LoreEntries } from "./lorebookMerge";
import { editBaseline, supersedeNextUpdate } from "./worldInfoPending";
import { commitLorebook, readServerLorebook, type LoreCommit, type Lorebook } from "./worldInfoServer";

export const WORLD_INFO_EDIT_ROUTE = "/api/worldinfo/edit";
export const SAVE_GUARD_ATTEMPTS = 3;

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface SaveGuardDeps {
  enabled(): boolean;
  baseFor(name: string): string | null;
  commit(name: string, expected: string, data: Lorebook): Promise<LoreCommit>;
  read(name: string): Promise<Lorebook | null>;
  supersede(name: string, data: Lorebook | null): void;
  warn(message: string, detail: Record<string, unknown>): void;
}

export interface EditRequest {
  name: string;
  data: Lorebook;
}

const urlOf = (input: RequestInfo | URL): string => (typeof input === "string" ? input : input instanceof URL ? input.href : input.url);

export function editRequest(input: RequestInfo | URL, init?: RequestInit): EditRequest | null {
  if (String(init?.method ?? "GET").toUpperCase() !== "POST" || typeof init?.body !== "string") return null;
  let path: string;
  try {
    path = new URL(urlOf(input), "http://host.invalid").pathname;
  } catch {
    return null;
  }
  if (path !== WORLD_INFO_EDIT_ROUTE) return null;
  try {
    const body = JSON.parse(init.body) as { name?: unknown; data?: unknown };
    const data = body.data as Lorebook | null | undefined;
    return typeof body.name === "string" && body.name && data && typeof data === "object" && data.entries && typeof data.entries === "object" ? { name: body.name, data } : null;
  } catch {
    return null;
  }
}

const answer = (status: number, body: Record<string, unknown>): Response => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const entriesOf = (book: Lorebook): LoreEntries => book.entries as unknown as LoreEntries;

function merged(request: EditRequest, base: LoreEntries, mine: Lorebook, server: Lorebook, deps: SaveGuardDeps): Lorebook {
  const result = mergeLorebookEntries(base, entriesOf(mine), entriesOf(server));
  if (result.conflicts.length || result.moved.length) {
    deps.warn("world info: a lorebook save met another change to the same entries; the editor's version was kept", {
      name: request.name, conflicts: result.conflicts, moved: result.moved,
    });
  }
  return { ...mine, entries: result.entries as unknown as Lorebook["entries"] };
}

// ST's own editor saves a whole book from the copy it drew (world-info.js:4151), so a story write that
// landed after the editor loaded the book would be overwritten. The save is made conditional on the copy
// the edit started from; when the server moved, the two changes are merged entry by entry.
export async function guardedEdit(request: EditRequest, base: string, deps: SaveGuardDeps, post: (body: string) => Promise<Response>): Promise<Response> {
  let mine = request.data;
  let from = JSON.parse(base) as LoreEntries;
  let expected = lorebookRevision(base);
  for (let attempt = 0; attempt < SAVE_GUARD_ATTEMPTS; attempt += 1) {
    const committed = await deps.commit(request.name, expected, mine);
    if (committed.kind === "committed") {
      if (mine !== request.data) deps.supersede(request.name, mine);
      return answer(200, { ok: true });
    }
    const server = await deps.read(request.name);
    if (committed.kind === "conflict") {
      if (!server) break;
      mine = merged(request, from, mine, server, deps);
      from = entriesOf(server);
      expected = lorebookRevision(entriesImage(server));
      continue;
    }
    if (server && entriesImage(server) !== entriesImage({ entries: from })) mine = merged(request, from, mine, server, deps);
    const response = await post(JSON.stringify({ name: request.name, data: mine }));
    if (mine !== request.data) deps.supersede(request.name, response.ok ? mine : null);
    return response;
  }
  deps.supersede(request.name, null);
  deps.warn("world info: a lorebook save was not written, because the server copy kept changing or could not be read", { name: request.name });
  return answer(409, { ok: false, conflict: true });
}

export function guardFetch(original: FetchLike, deps: SaveGuardDeps): FetchLike {
  return async function guardedFetch(this: unknown, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const request = deps.enabled() ? editRequest(input, init) : null;
    const base = request ? deps.baseFor(request.name) : null;
    if (!request || base === null) return original.call(this, input, init);
    return guardedEdit(request, base, deps, (body) => original.call(this, input, { ...init, body }));
  };
}

export const hostSaveGuardDeps = (enabled: () => boolean): SaveGuardDeps => ({
  enabled,
  baseFor: editBaseline,
  commit: commitLorebook,
  read: readServerLorebook,
  supersede: (name, data) => supersedeNextUpdate(name, data),
  warn: (message, detail) => log.warn(message, detail),
});

let installed: { original: FetchLike; guarded: FetchLike } | null = null;

export function installWorldInfoSaveGuard(enabled: () => boolean, target: { fetch: FetchLike } = globalThis as unknown as { fetch: FetchLike }): WriteResult<{ uninstall: () => void }> {
  if (installed) return couldNot("the lorebook save guard is already installed");
  if (typeof target.fetch !== "function") return couldNot("this page has no fetch to guard");
  const original = target.fetch;
  const guarded = guardFetch(original, hostSaveGuardDeps(enabled));
  target.fetch = guarded;
  installed = { original, guarded };
  return wrote({
    uninstall: () => {
      if (target.fetch === guarded) target.fetch = original;
      installed = null;
    },
  });
}
