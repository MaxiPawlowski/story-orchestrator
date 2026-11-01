jest.mock("./worldInfoPending", () => ({ editBaseline: () => null, supersedeNextUpdate: () => undefined }));
jest.mock("./worldInfoServer", () => ({ commitLorebook: async () => ({ kind: "absent" }), readServerLorebook: async () => null }));

import { entriesImage, lorebookRevision } from "./lorebookImage";
import { editRequest, guardFetch, type FetchLike, type SaveGuardDeps } from "./worldInfoSaveGuard";
import type { LoreCommit, Lorebook } from "./worldInfoServer";

const book = (entries: Record<number, string>): Lorebook =>
  ({ entries: Object.fromEntries(Object.entries(entries).map(([uid, content]) => [uid, { uid: Number(uid), comment: `e${uid}`, content }])) } as unknown as Lorebook);

interface Harness {
  deps: SaveGuardDeps;
  server: { book: Lorebook };
  commits: Array<{ expected: string; data: Lorebook }>;
  superseded: Array<{ name: string; data: Lorebook | null }>;
  posted: string[];
  original: jest.Mock;
  fetch: FetchLike;
}

const harness = (opts: { base: Lorebook | null; server: Lorebook; plugin?: boolean; enabled?: boolean; serverMovesEveryCommit?: boolean }): Harness => {
  const server = { book: opts.server };
  const commits: Harness["commits"] = [];
  const superseded: Harness["superseded"] = [];
  const posted: string[] = [];
  const original = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof init?.body === "string") posted.push(init.body);
    return new Response("{}", { status: 200 });
  });
  const deps: SaveGuardDeps = {
    enabled: () => opts.enabled !== false,
    baseFor: () => (opts.base ? entriesImage(opts.base) : null),
    commit: async (_name, expected, data): Promise<LoreCommit> => {
      commits.push({ expected, data });
      if (opts.plugin === false) return { kind: "absent" };
      if (opts.serverMovesEveryCommit) server.book = book({ ...Object.fromEntries(Object.entries(server.book.entries).map(([k, v]) => [k, (v as unknown as { content: string }).content])), 9: `moved ${commits.length}` });
      if (expected !== lorebookRevision(entriesImage(server.book))) return { kind: "conflict" };
      server.book = data;
      return { kind: "committed" };
    },
    read: async () => structuredClone(server.book),
    supersede: (name, data) => superseded.push({ name, data }),
    warn: () => undefined,
  };
  return { deps, server, commits, superseded, posted, original, fetch: guardFetch(original as unknown as FetchLike, deps) };
};

const editPost = (data: Lorebook, name = "World"): RequestInit => ({ method: "POST", body: JSON.stringify({ name, data }) });

describe("ST's lorebook editor save goes through the conditional commit (v3.0 43 T, owner 2026-11-01)", () => {
  it("reads only POST /api/worldinfo/edit with a book body", () => {
    expect(editRequest("/api/worldinfo/edit", editPost(book({ 0: "a" })))?.name).toBe("World");
    expect(editRequest("http://127.0.0.1:8000/api/worldinfo/edit?x=1", editPost(book({ 0: "a" })))?.name).toBe("World");
    expect(editRequest("/api/worldinfo/get", editPost(book({ 0: "a" })))).toBeNull();
    expect(editRequest("/api/worldinfo/edit", { method: "GET" })).toBeNull();
    expect(editRequest("/api/worldinfo/edit", { method: "POST", body: "{\"name\":\"x\"}" })).toBeNull();
  });

  it("regression: an editor showing the book from before a story write no longer overwrites that write", async () => {
    const before = book({ 0: "place", 1: "person" });
    const storyWrote = book({ 0: "place", 1: "person met by the story" });
    const editorSaves = book({ 0: "place edited by hand", 1: "person" });
    const h = harness({ base: before, server: storyWrote });
    const response = await h.fetch("/api/worldinfo/edit", editPost(editorSaves));
    expect(response.status).toBe(200);
    expect(h.original).not.toHaveBeenCalled();
    expect(h.server.book).toEqual(book({ 0: "place edited by hand", 1: "person met by the story" }));
    expect(h.commits.map((commit) => commit.expected)).toEqual([lorebookRevision(entriesImage(before)), lorebookRevision(entriesImage(storyWrote))]);
    expect(h.superseded).toEqual([{ name: "World", data: h.server.book }]);
  });

  it("a save from an up-to-date editor commits as is, and the cache keeps ST's own copy", async () => {
    const before = book({ 0: "a" });
    const h = harness({ base: before, server: before });
    await h.fetch("/api/worldinfo/edit", editPost(book({ 0: "b" })));
    expect(h.server.book).toEqual(book({ 0: "b" }));
    expect(h.commits).toHaveLength(1);
    expect(h.superseded).toEqual([]);
  });

  it("without the lore plugin it merges against the server's copy and posts through ST's own route", async () => {
    const before = book({ 0: "a", 1: "b" });
    const h = harness({ base: before, server: book({ 0: "a", 1: "story" }), plugin: false });
    const response = await h.fetch("/api/worldinfo/edit", editPost(book({ 0: "hand", 1: "b" })));
    expect(response.status).toBe(200);
    expect(JSON.parse(h.posted[0] ?? "{}")).toEqual({ name: "World", data: book({ 0: "hand", 1: "story" }) });
    expect(h.superseded).toHaveLength(1);
  });

  it("a server that keeps moving refuses after the attempt limit and drops ST's cached copy", async () => {
    const h = harness({ base: book({ 0: "a" }), server: book({ 0: "a" }), serverMovesEveryCommit: true });
    const response = await h.fetch("/api/worldinfo/edit", editPost(book({ 0: "b" })));
    expect(response.status).toBe(409);
    expect(h.commits).toHaveLength(3);
    expect(h.superseded).toEqual([{ name: "World", data: null }]);
  });

  it("passes through: switched off, no recorded base (a new book), and every other request", async () => {
    const off = harness({ base: book({ 0: "a" }), server: book({ 0: "x" }), enabled: false });
    await off.fetch("/api/worldinfo/edit", editPost(book({ 0: "b" })));
    expect(off.original).toHaveBeenCalledTimes(1);
    expect(off.commits).toHaveLength(0);
    const fresh = harness({ base: null, server: book({}) });
    await fresh.fetch("/api/worldinfo/edit", editPost(book({ 0: "b" })));
    await fresh.fetch("/api/chats/save", { method: "POST", body: "{}" });
    expect(fresh.original).toHaveBeenCalledTimes(2);
    expect(fresh.commits).toHaveLength(0);
  });
});
