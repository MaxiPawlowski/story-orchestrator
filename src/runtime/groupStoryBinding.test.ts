import { bindGroupStory, boundStoryForEmptyChat, heldGroupBinding, readGroupStories } from "./groupStoryBinding";

describe("bound story for a new group chat", () => {
  const root = { groupStories: { "group-a": "adolion-saga" } };

  it("selects only a bound group with an empty transcript", () => {
    expect(boundStoryForEmptyChat(root, "group-a", [])).toBe("adolion-saga");
    expect(boundStoryForEmptyChat(root, "other", [])).toBeNull();
    expect(boundStoryForEmptyChat(root, "group-a", [{ mes: "already playing" }])).toBeNull();
    expect(boundStoryForEmptyChat(root, null, [])).toBeNull();
  });

  it("ignores malformed bindings", () => {
    expect(boundStoryForEmptyChat({ groupStories: ["adolion-saga"] }, "group-a", [])).toBeNull();
    expect(boundStoryForEmptyChat({ groupStories: { "group-a": false } }, "group-a", [])).toBeNull();
  });
});

describe("v2.6 plan 04 G: editing the group -> story binding", () => {
  it("binds, rebinds and clears one group without touching another group's binding", () => {
    const start = readGroupStories({ groupStories: { "group-a": "adolion-saga", "group-b": "adolion-night", junk: 3 } });
    expect(start).toEqual({ "group-a": "adolion-saga", "group-b": "adolion-night" });
    expect(bindGroupStory(start, "group-a", "adolion-war")).toEqual({ "group-a": "adolion-war", "group-b": "adolion-night" });
    expect(bindGroupStory(start, "group-a", null)).toEqual({ "group-b": "adolion-night" });
    expect(bindGroupStory(start, "group-c", "  ")).toEqual(start);
    expect(boundStoryForEmptyChat({ groupStories: bindGroupStory(start, "group-a", null) }, "group-a", [])).toBeNull();
  });

  it("confirms a write only when the server holds exactly that binding", () => {
    expect(heldGroupBinding({ groupStories: { g: "s1" } }, { groupId: "g", storyId: "s1" })).toBeNull();
    expect(heldGroupBinding({ groupStories: {} }, { groupId: "g", storyId: null })).toBeNull();
    expect(heldGroupBinding({ groupStories: { g: "s0" } }, { groupId: "g", storyId: "s1" })).toContain("s0");
    expect(heldGroupBinding({ groupStories: { g: "s1" } }, { groupId: "g", storyId: null })).toContain("s1");
    expect(heldGroupBinding(null, { groupId: "g", storyId: "s1" })).toContain("could not be read");
  });
});
