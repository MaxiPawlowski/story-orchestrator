import { secret, secretsOf } from "../../../test/support/recallKit";
import { heldSecretsKeyOf, recallCacheKey, type RecallCacheInput } from "./cacheKey";

const BASE: RecallCacheInput = {
  chatId: "chat-a", storyHash: "story-abc", member: "tamsin", query: "What exactly did Corvin say?", witnessRevision: "w-1",
  heldSecretsKey: "[]", candidates: [{ messageId: 3, revision: { swipeId: null, hash: "aaaa0001" } }, { messageId: 7, revision: { swipeId: 0, hash: "bbbb0002" } }],
};

describe("plan 43 VR4c: the recall cache key changes with every input it depends on", () => {
  const key = recallCacheKey(BASE);

  it.each<[string, Partial<RecallCacheInput>]>([
    ["chat", { chatId: "chat-b" }],
    ["story content hash", { storyHash: "story-abd" }],
    ["member", { member: "hollis" }],
    ["query text", { query: "What exactly did Corvin say? " }],
    ["witness record revision", { witnessRevision: "w-2" }],
    ["held-secrets key", { heldSecretsKey: '[[["corvin"],null,[["map"]]]]' }],
    ["a candidate's swipe", { candidates: [{ messageId: 3, revision: { swipeId: 1, hash: "aaaa0001" } }, BASE.candidates[1]] }],
    ["a candidate's text hash", { candidates: [BASE.candidates[0], { messageId: 7, revision: { swipeId: 0, hash: "bbbb0003" } }] }],
    ["a candidate's message id", { candidates: [{ messageId: 4, revision: BASE.candidates[0].revision }, BASE.candidates[1]] }],
    ["the candidate set", { candidates: [BASE.candidates[0]] }],
  ])("planted change of %s", (_, change) => {
    expect(recallCacheKey({ ...BASE, ...change })).not.toBe(key);
  });

  it("is stable for identical inputs, and a chat id cannot collide by delimiter", () => {
    expect(recallCacheKey({ ...BASE })).toBe(key);
    expect(recallCacheKey({ ...BASE, chatId: "a|b", storyHash: "c" })).not.toBe(recallCacheKey({ ...BASE, chatId: "a", storyHash: "b|c" }));
  });

  it("the held-secrets key moves when a secret is added or its knowers change", () => {
    const one = secretsOf([secret("s1", "Corvin", "hiding", "Corvin is hiding that he sold the family map", "Tamsin")]);
    const two = secretsOf([secret("s1", "Corvin", "hiding", "Corvin is hiding that he sold the family map", "Tamsin"), secret("s2", "Hollis", "unaware", "Hollis is unaware the bridge toll doubled")]);
    expect(heldSecretsKeyOf([])).toBe("[]");
    expect(new Set([heldSecretsKeyOf([]), heldSecretsKeyOf(one), heldSecretsKeyOf(two)]).size).toBe(3);
  });
});
