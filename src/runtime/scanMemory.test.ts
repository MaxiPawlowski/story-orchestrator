import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import { scanningPromptHost } from "./scanMemory";

const seam = () => {
  const calls: Array<[string, string, number, boolean | undefined]> = [];
  return {
    calls,
    setStoryExtensionPrompt: (key: string, text: string, depth: number, scan?: boolean) => { calls.push([key, text, depth, scan]); return { ok: true as const, changed: true }; },
    clearStoryExtensionPrompt: () => ({ ok: true as const, changed: false }),
  };
};

describe("L4: the install-wide memory-scan switch reaches every prompt write", () => {
  it("off (the default): every block is written without scan", () => {
    const host = seam();
    scanningPromptHost(host, () => false).setStoryExtensionPrompt(INJECTION_REGISTRY.memoryFacts.key, "facts", 4);
    expect(host.calls).toEqual([[INJECTION_REGISTRY.memoryFacts.key, "facts", 4, false]]);
  });

  it("on: the write asks for scan, and the seam decides per key (a private block is refused there)", () => {
    const host = seam();
    let on = true;
    const prompt = scanningPromptHost(host, () => on);
    prompt.setStoryExtensionPrompt(INJECTION_REGISTRY.memoryFacts.key, "facts", 4);
    on = false;
    prompt.setStoryExtensionPrompt(INJECTION_REGISTRY.memoryFacts.key, "facts", 4);
    expect(host.calls.map((call) => call[3])).toEqual([true, false]);
  });
});
