const state = {
  groupId: "open",
  groups: [
    { id: "open", members: ["a.png"], disabled_members: [] as string[] },
    { id: "recorded", members: ["luke.png"], disabled_members: ["luke.png"] },
  ],
};
const edited: Array<{ id: string; immediately: boolean }> = [];
const server: { answer: "page" | "stale" | "unreadable"; stale: typeof state.groups } = { answer: "page", stale: [] };

jest.mock("./context", () => ({ getContext: () => ({ groupId: state.groupId, groups: state.groups, characters: [], getRequestHeaders: () => ({}) }) }));
jest.mock("./modules", () => ({ groupChatsModule: { editGroup: async (id: string, immediately: boolean) => { edited.push({ id, immediately }); } } }));

import { readGroupMemberDisabled, setGroupMemberDisabled, setGroupMembersDisabled } from "./groups";

beforeEach(() => {
  edited.length = 0;
  server.answer = "page";
  server.stale = JSON.parse(JSON.stringify(state.groups));
  globalThis.fetch = jest.fn(async () => {
    if (server.answer === "unreadable") return { ok: false, json: async () => null };
    return { ok: true, json: async () => JSON.parse(JSON.stringify(server.answer === "page" ? state.groups : server.stale)) };
  }) as unknown as typeof fetch;
});

describe("V15: a cast restore acts on the group the ledger recorded, not whichever group is open", () => {
  it("reads and writes the recorded group while another group is open", async () => {
    expect(readGroupMemberDisabled("luke.png", "recorded")).toBe(true);
    const result = await setGroupMemberDisabled("luke.png", false, "recorded");
    expect(result.ok).toBe(true);
    expect(state.groups[1].disabled_members).toEqual([]);
    expect(state.groups[0].disabled_members).toEqual([]);
    expect(edited.map((call) => call.id)).toEqual(["recorded"]);
  });

  it("refuses a group the install no longer has, rather than writing the open one", async () => {
    const result = await setGroupMemberDisabled("luke.png", true, "gone");
    expect(result.ok).toBe(false);
    expect(state.groups[0].disabled_members).toEqual([]);
  });

  it("control: with no group named it still reads the open group", () => {
    expect(readGroupMemberDisabled("a.png")).toBe(false);
  });
});

describe("V15c: a cast write is saved now and read back, never left to ST's debounce", () => {
  it("saves immediately instead of scheduling ST's debounced save", async () => {
    await setGroupMemberDisabled("luke.png", true, "recorded");
    await setGroupMembersDisabled(["a.png"], []);
    expect(edited.map((call) => call.immediately)).toEqual([true, true]);
  });

  it("a server still holding the old flags is a lost write, not a success", async () => {
    server.answer = "stale";
    const result = await setGroupMemberDisabled("luke.png", !readGroupMemberDisabled("luke.png", "recorded"), "recorded");
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.reason).toMatch(/so the change was lost/);
  });

  it("a read-back that cannot answer is unconfirmed, not a refusal", async () => {
    server.answer = "unreadable";
    const result = await setGroupMembersDisabled([], ["a.png"]);
    expect(result).toMatchObject({ ok: true, confirmed: false });
    server.answer = "page";
    expect(await setGroupMembersDisabled(["a.png"], [])).toMatchObject({ ok: true, confirmed: true });
  });
});
