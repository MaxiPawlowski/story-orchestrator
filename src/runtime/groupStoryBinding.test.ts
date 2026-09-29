import { boundStoryForEmptyChat } from "./groupStoryBinding";

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
