import { publishSpriteLookIssues, spriteLookIssues } from "./spriteLookHealth";

test("changed-look readiness is chat-owned, changes only on a new finding, and clears on a recovered pack", () => {
  const issue = { name: "Arin", reason: "No installed default expression pack." };
  expect(publishSpriteLookIssues("chat-a", [issue])).toBe(true);
  expect(publishSpriteLookIssues("chat-a", [{ ...issue }])).toBe(false);
  expect(spriteLookIssues("chat-a")).toEqual([issue]);
  expect(spriteLookIssues("chat-b")).toEqual([]);
  expect(spriteLookIssues(null)).toEqual([]);
  expect(publishSpriteLookIssues("chat-a", [])).toBe(true);
  expect(spriteLookIssues("chat-a")).toEqual([]);
});
