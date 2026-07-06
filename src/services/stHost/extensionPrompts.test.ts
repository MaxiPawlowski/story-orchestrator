const setExtensionPrompt = jest.fn();

jest.mock("./context", () => ({
  getContext: () => ({ setExtensionPrompt }),
}));

import { clearStoryExtensionPrompt, setStoryExtensionPrompt } from "./extensionPrompts";

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
