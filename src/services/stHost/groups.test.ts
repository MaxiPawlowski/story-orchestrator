const state = {
  groupId: "open",
  groups: [
    { id: "open", members: ["a.png"], disabled_members: [] as string[] },
    { id: "recorded", members: ["luke.png"], disabled_members: ["luke.png"] },
  ],
};
const edited: string[] = [];

jest.mock("./context", () => ({ getContext: () => ({ groupId: state.groupId, groups: state.groups, characters: [] }) }));
jest.mock("./modules", () => ({ groupChatsModule: { editGroup: async (id: string) => { edited.push(id); } } }));

import { readGroupMemberDisabled, setGroupMemberDisabled } from "./groups";

describe("V15: a cast restore acts on the group the ledger recorded, not whichever group is open", () => {
  it("reads and writes the recorded group while another group is open", async () => {
    expect(readGroupMemberDisabled("luke.png", "recorded")).toBe(true);
    const result = await setGroupMemberDisabled("luke.png", false, "recorded");
    expect(result.ok).toBe(true);
    expect(state.groups[1].disabled_members).toEqual([]);
    expect(state.groups[0].disabled_members).toEqual([]);
    expect(edited).toEqual(["recorded"]);
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
