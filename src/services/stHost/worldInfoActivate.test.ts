const host: { chat: Array<{ mes: string; name: string; is_system?: boolean }>; extensionPrompts: Record<string, { value: string; scan: boolean } | undefined> | undefined } = { chat: [], extensionPrompts: {} };

jest.mock("./context", () => ({ getContext: () => ({ chat: host.chat, extensionPrompts: host.extensionPrompts }) }));
jest.mock("./modules", () => ({ worldInfoModule: { getWorldInfoSettings: () => ({ world_info_depth: 3, world_info_include_names: true }) } }));

import { readScanBuffer } from "./worldInfoActivate";

describe("readScanBuffer", () => {
  beforeEach(() => {
    host.chat = [{ mes: "hello", name: "Mara" }, { mes: "note", name: "System", is_system: true }, { mes: "the harbour", name: "Arin" }];
    host.extensionPrompts = {};
  });

  it("reads the chat newest first with names, and maps the generation type the way Generate does (script.js:4633)", () => {
    expect(readScanBuffer("normal")).toMatchObject({ messages: ["Arin: the harbour", "Mara: hello"], depth: 3, trigger: "normal" });
    expect(readScanBuffer("swipe")).toMatchObject({ messages: ["Mara: hello"], trigger: "swipe" });
    expect(readScanBuffer("appendFinal").trigger).toBe("normal");
    expect(readScanBuffer().trigger).toBeNull();
  });

  it("says whether a scanned extension prompt adds text the buffer does not hold (world-info.js:4718-4726)", () => {
    expect(readScanBuffer("normal").injected).toBe(false);
    host.extensionPrompts = { quiet: { value: "x", scan: false }, empty: { value: "  ", scan: true } };
    expect(readScanBuffer("normal").injected).toBe(false);
    host.extensionPrompts = { story_facts: { value: "the dragon sleeps", scan: true } };
    expect(readScanBuffer("normal").injected).toBe(true);
    host.extensionPrompts = undefined;
    expect(readScanBuffer("normal").injected).toBe(true);
  });
});
