const host: { exposes: boolean; extensionPrompts: Record<string, { value: string; position: number; depth: number; scan: boolean; role: number } | undefined> } = { exposes: true, extensionPrompts: {} };
const setExtensionPrompt = jest.fn((key: string, value: string, position: number, depth: number, scan = false, role = 0) => {
  host.extensionPrompts[key] = { value: String(value), position, depth, scan, role };
});

jest.mock("./context", () => ({
  getContext: () => (host.exposes ? { setExtensionPrompt, extensionPrompts: host.extensionPrompts } : {}),
}));

import { clearStoryExtensionPrompt, setStoryExtensionPrompt } from "./extensionPrompts";

const clearChat = () => { host.extensionPrompts = {}; };

// V17: a build without setExtensionPrompt used to make both writes return in silence, so a block
// that never reached a prompt read exactly like one that did.
describe("V17: the extension-prompt seam answers what the host did", () => {
  beforeEach(() => { host.exposes = true; clearChat(); setExtensionPrompt.mockClear(); });
  afterEach(() => { host.exposes = true; });

  it("a write answers changed, and a repeat answers unchanged", () => {
    expect(setStoryExtensionPrompt("v17", "hello", 2)).toEqual({ ok: true, changed: true });
    expect(setStoryExtensionPrompt("v17", "hello", 2)).toEqual({ ok: true, changed: false });
  });

  it("a build that exposes no setExtensionPrompt is a refusal, not a silent return", () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    host.exposes = false;
    expect(setStoryExtensionPrompt("v17", "hello", 2)).toMatchObject({ ok: false });
    expect(setExtensionPrompt).not.toHaveBeenCalled();
  });
});

describe("setStoryExtensionPrompt write-on-change", () => {
  beforeEach(() => {
    clearChat();
    setExtensionPrompt.mockClear();
  });

  it("skips a repeat write with identical text and depth", () => {
    setStoryExtensionPrompt("k", "hello", 2);
    setStoryExtensionPrompt("k", "hello", 2);
    setStoryExtensionPrompt("k", "hello", 2);
    expect(setExtensionPrompt).toHaveBeenCalledTimes(1);
  });

  it("writes again when text or depth changes", () => {
    setStoryExtensionPrompt("k", "hello", 2);
    setStoryExtensionPrompt("k", "world", 2);
    setStoryExtensionPrompt("k", "world", 4);
    expect(setExtensionPrompt).toHaveBeenCalledTimes(3);
  });

  it("clear then set writes again; clearing an unset key is a no-op", () => {
    clearStoryExtensionPrompt("never-set");
    expect(setExtensionPrompt).not.toHaveBeenCalled();
    setStoryExtensionPrompt("k", "hello", 2);
    clearStoryExtensionPrompt("k");
    setStoryExtensionPrompt("k", "hello", 2);
    expect(setExtensionPrompt).toHaveBeenCalledTimes(3);
    expect(setExtensionPrompt).toHaveBeenNthCalledWith(2, "k", "", 1, 0, false, 0);
  });
});

// v2.4 acceptance A1: ST's clearChat reassigns `extension_prompts = {}` on every chat load
// (script.js:1590), including a same-chat reloadCurrentChat (script.js:1712). The seam's skip must
// read what the host holds, never a memo of what it once wrote.
describe("A1: the write skip reads the host's extension prompts", () => {
  beforeEach(() => { host.exposes = true; clearChat(); setExtensionPrompt.mockClear(); });

  it("rewrites an unchanged block after ST dropped it on a chat load", () => {
    setStoryExtensionPrompt("k", "hello", 2);
    clearChat();
    expect(setStoryExtensionPrompt("k", "hello", 2)).toEqual({ ok: true, changed: true });
    expect(setExtensionPrompt).toHaveBeenCalledTimes(2);
    expect(host.extensionPrompts.k).toMatchObject({ value: "hello", depth: 2, position: 1, role: 0 });
  });

  it("rewrites a block another writer replaced under our key", () => {
    setStoryExtensionPrompt("k", "hello", 2);
    host.extensionPrompts.k = { value: "hello", position: 1, depth: 2, scan: false, role: 2 };
    expect(setStoryExtensionPrompt("k", "hello", 2)).toEqual({ ok: true, changed: true });
    expect(host.extensionPrompts.k).toMatchObject({ role: 0 });
  });

  it("a clear after ST dropped the block writes nothing and answers unchanged", () => {
    setStoryExtensionPrompt("k", "hello", 2);
    clearChat();
    setExtensionPrompt.mockClear();
    expect(clearStoryExtensionPrompt("k")).toEqual({ ok: true, changed: false });
    expect(setExtensionPrompt).not.toHaveBeenCalled();
  });

  it("clears a block the host holds even when this page never wrote it", () => {
    host.extensionPrompts.k = { value: "left by an earlier page", position: 1, depth: 2, scan: false, role: 0 };
    expect(clearStoryExtensionPrompt("k")).toEqual({ ok: true, changed: true });
    expect(host.extensionPrompts.k?.value).toBe("");
  });

  it("control: without a chat load, an unchanged block is still written once", () => {
    setStoryExtensionPrompt("k", "hello", 2);
    expect(setStoryExtensionPrompt("k", "hello", 2)).toEqual({ ok: true, changed: false });
    expect(setExtensionPrompt).toHaveBeenCalledTimes(1);
  });
});
