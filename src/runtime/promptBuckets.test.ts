import { bucketView, PromptBuckets, promptBucketsText } from "./promptBuckets";

describe("v2.5 plan 07 A4: the Chat Completion bucket view", () => {
  const counts = { main: 100, nsfw: 0, jailbreak: 20, charDescription: 300, scenario: 50, dialogueExamples: 80, worldInfoBefore: 40, worldInfoAfter: 10, chatHistory: 2000, summary: 60, customer_notes: 30, start_chat: 0 };

  it("groups ST's identifiers without re-attributing chat history, and adds up exactly to ST's total", () => {
    const view = bucketView(counts, 2690, 150);
    expect(view.groups).toEqual([
      { id: "main", label: "main", tokens: 120 },
      { id: "character", label: "character", tokens: 430 },
      { id: "worldInfo", label: "world info", tokens: 50 },
      { id: "chatHistory", label: "chat history", tokens: 2000 },
      { id: "other", label: "other", tokens: 90 },
    ]);
    expect(view.sum).toBe(2690);
    expect(view.matches).toBe(true);
    expect(view.chatHistory).toBe(2000);
    expect(view.ours).toBe(150);
    expect(view.oursExceedsHistory).toBe(false);
  });

  it("an SO depth block is never its own bucket: our sub-count is shown inside chat history and not summed", () => {
    const view = bucketView({ chatHistory: 100, main: 10 }, 110, 400);
    expect(view.sum).toBe(110);
    expect(view.groups.map((group) => group.id)).toEqual(["main", "chatHistory"]);
    expect(view.oursExceedsHistory).toBe(true);
  });

  it("says so when the identifiers do not add up to ST's total", () => {
    const view = bucketView({ main: 10 }, 12, null);
    expect(view.matches).toBe(false);
    expect(promptBucketsText(view)).toContain("ST reports 12");
  });

  it("renders the header line with our sub-count inside chat history", () => {
    expect(promptBucketsText(bucketView(counts, 2690, 150))).toBe("Prompt: main 120 · character 430 · world info 50 · chat history 2000 (of which Story Orchestrator 150) · other 90 · of 2690");
    expect(promptBucketsText(bucketView({ chatHistory: 5 }, 5, null))).toBe("Prompt: chat history 5 · of 5");
  });

  it("refreshes only from the host read, keeps the last good view, and reports why it has none", () => {
    let result: ReturnType<Parameters<PromptBuckets["attach"]>[0]["read"]> = { ok: false, reason: "Text Completion" };
    let notified = 0;
    const store = new PromptBuckets();
    expect(store.view(null)).toBeNull();
    const detach = store.attach({ read: () => result, notify: () => { notified += 1; } });
    store.refresh();
    expect(store.view(null)).toEqual({ unavailable: "Text Completion", quiet: false });
    result = { ok: false, reason: "not CC", notChatCompletion: true };
    store.refresh();
    expect(store.view(null)).toEqual({ unavailable: "not CC", quiet: true });
    result = { ok: true, counts: { chatHistory: 9 }, total: 9 };
    store.refresh();
    expect(store.view(4)).toMatchObject({ sum: 9, ours: 4 });
    expect(notified).toBe(3);
    result = { ok: false, reason: "transient" };
    store.refresh();
    expect(store.view(4)).toMatchObject({ sum: 9 });
    result = { ok: false, reason: "switched to Text Completion", notChatCompletion: true };
    store.refresh();
    expect(store.view(4)).toEqual({ unavailable: "switched to Text Completion", quiet: true });
    detach();
    expect(store.view(4)).toBeNull();
  });
});
