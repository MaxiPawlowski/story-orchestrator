jest.mock("@services/STAPI", () => ({
  getContext: () => globalThis.__aliasContext,
  saveOpenChat: async () => ({ ok: true as const, chatId: "" }),
}));

import { BLOB_VERSION, getMetadataBlob, hasPersistedRuntime, loadPersistedRuntime, savePersistedRuntime } from "./persistence";
import { currentRecord } from "../../test/findings/currentRecord";
import type { PersistedStoryRuntime } from "./types";

declare global {
  // eslint-disable-next-line no-var
  var __aliasContext: { chatId: string; chatMetadata: Record<string, unknown> };
}

const record = () => currentRecord("s1", { extras: { effects: { ledger: [{ id: "an", status: "applied" }] }, journal: [] } }) as unknown as PersistedStoryRuntime & {
  extras: { effects: { ledger: Array<{ id: string; status: string }> }; journal: string[] };
};
const stored = () => globalThis.__aliasContext.chatMetadata.story_orchestrator as { chatId: string; stories: Record<string, unknown> };

function openOwnChat() {
  globalThis.__aliasContext = { chatId: "chat-a", chatMetadata: { story_orchestrator: { version: BLOB_VERSION, chatId: "chat-a", selectedStoryId: null, stories: {} } } };
}

describe("T7 live-v5/v5b: the stored blob never aliases the live run", () => {
  it("a foreign-stamped blob stays byte-identical while the run that last saved it restores its effects", () => {
    openOwnChat();
    const live = record();
    savePersistedRuntime(live);
    stored().chatId = "so-v5-elsewhere";
    const before = JSON.stringify(stored());
    expect(getMetadataBlob().selectedStoryId).toBeNull();
    live.extras.effects.ledger = [{ id: "an", status: "reverted" }] as typeof live.extras.effects.ledger;
    live.extras.journal.push("restored 1 host change(s)");
    (live.engineState as { boundary: number }).boundary = 7;
    expect(JSON.stringify(stored())).toBe(before);
  });

  it("a record read back is the run's own copy, so hydrating from it cannot write into the blob", () => {
    openOwnChat();
    savePersistedRuntime(record());
    const before = JSON.stringify(stored());
    const read = loadPersistedRuntime("s1") as ReturnType<typeof record>;
    read.extras.effects.ledger[0]!.status = "reverted";
    (read.engineState as { boundary: number }).boundary = 3;
    expect(JSON.stringify(stored())).toBe(before);
  });

  it("control: the chat's own save still lands, and a later save replaces it", () => {
    openOwnChat();
    const live = record();
    savePersistedRuntime(live);
    live.extras.effects.ledger = [{ id: "an", status: "reverted" }] as typeof live.extras.effects.ledger;
    expect(loadPersistedRuntime("s1")?.extras).toEqual({ effects: { ledger: [{ id: "an", status: "applied" }] }, journal: [] });
    savePersistedRuntime(live);
    expect(loadPersistedRuntime("s1")?.extras).toEqual({ effects: { ledger: [{ id: "an", status: "reverted" }] }, journal: [] });
    expect(hasPersistedRuntime("s1")).toBe(true);
    expect(hasPersistedRuntime("s2")).toBe(false);
  });
});
