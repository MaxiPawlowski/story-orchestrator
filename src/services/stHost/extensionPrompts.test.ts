const setExtensionPrompt = jest.fn();
const host = { exposes: true };

jest.mock("./context", () => ({
  getContext: () => (host.exposes ? { setExtensionPrompt } : {}),
}));

import { clearStoryExtensionPrompt, setStoryExtensionPrompt } from "./extensionPrompts";

// V17: a build without setExtensionPrompt used to make both writes return in silence, so a block
// that never reached a prompt read exactly like one that did.
describe("V17: the extension-prompt seam answers what the host did", () => {
  beforeEach(() => { host.exposes = true; clearStoryExtensionPrompt("v17"); setExtensionPrompt.mockClear(); });
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
    clearStoryExtensionPrompt("k");
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
