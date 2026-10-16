const host = {
  groupId: "g1",
  groups: [{ id: "g1", members: ["arin.png", "two.png", "mara.png"] }],
  characters: [{ avatar: "mara.png", name: "Mara" }, { avatar: "x.png", name: "Other" }, { avatar: "arin.png", name: "Arin" }, { avatar: "two.png", name: "2" }],
};
jest.mock("./context", () => ({ getContext: () => host }));
jest.mock("./modules", () => ({ groupChatsModule: {} }));

import { groupMemberPosition } from "./groups";

describe("v2.8 69 K10: an NPC reply names its member by group position, resolved exactly, never by ST's fuzzy name search", () => {
  beforeEach(() => {
    host.groups[0].members = ["arin.png", "two.png", "mara.png"];
    host.characters = [{ avatar: "mara.png", name: "Mara" }, { avatar: "x.png", name: "Other" }, { avatar: "arin.png", name: "Arin" }, { avatar: "two.png", name: "2" }];
  });

  it("a member named \"2\" resolves to its own position, not to member index 2", () => {
    expect(groupMemberPosition("2")).toEqual({ ok: true, position: 1 });
    expect(groupMemberPosition("Mara")).toEqual({ ok: true, position: 2 });
    expect(groupMemberPosition(" arin ")).toEqual({ ok: true, position: 0 });
  });

  it("reordered members resolve to the right card", () => {
    host.groups[0].members = ["mara.png", "arin.png", "two.png"];
    expect(groupMemberPosition("Mara")).toEqual({ ok: true, position: 0 });
    expect(groupMemberPosition("2")).toEqual({ ok: true, position: 2 });
  });

  it("a missing member is refused, never guessed", () => {
    expect(groupMemberPosition("Mar")).toMatchObject({ ok: false, reason: expect.stringContaining("Mar") });
    expect(groupMemberPosition("Other")).toMatchObject({ ok: false });
  });

  it("two members with the same name are refused, never guessed", () => {
    host.characters.push({ avatar: "mara2.png", name: "Mara" });
    host.groups[0].members = ["arin.png", "mara.png", "mara2.png"];
    expect(groupMemberPosition("Mara")).toMatchObject({ ok: false, reason: expect.stringContaining("2 members") });
    expect(groupMemberPosition("mara2")).toEqual({ ok: true, position: 2 });
  });
});
