import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import type { RuntimeManager } from "./runtimeManager";
import { startCheckOutcome } from "./checkOutcomeHost";

const prompts = new Map<string, string>();

jest.mock("@services/STAPI", () => ({
  setStoryExtensionPrompt: (key: string, text: string) => { prompts.set(key, text); },
  clearStoryExtensionPrompt: (key: string) => { prompts.delete(key); },
}));

describe("check outcome block (B10)", () => {
  it("is withheld while quiet or impersonate holds the turn blocks, and comes back on release", () => {
    let held = false;
    const listeners = new Set<() => void>();
    const manager = {
      getLoadedChatId: () => "chat-1",
      turnBlocksHeld: () => held,
      game: { outcomeBlock: () => "CHECK: climb succeeded" },
      subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); },
    } as unknown as RuntimeManager;
    const notify = () => listeners.forEach((listener) => listener());
    const stop = startCheckOutcome(manager);
    const key = INJECTION_REGISTRY.checkOutcome.key;
    expect(prompts.get(key)).toBe("CHECK: climb succeeded");
    held = true;
    notify();
    expect(prompts.has(key)).toBe(false);
    held = false;
    notify();
    expect(prompts.get(key)).toBe("CHECK: climb succeeded");
    stop();
    expect(prompts.has(key)).toBe(false);
  });
});
