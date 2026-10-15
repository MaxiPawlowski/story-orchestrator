import { INJECTION_REGISTRY } from "@constants/injectionRegistry";
import type { RuntimeManager } from "./runtimeManager";
import { startCheckOutcome } from "./checkOutcomeHost";
import { CHECK_OUTCOME_HEADER } from "./storyCheckDraws";
import { heldSecrets, withoutSecretLines, type EpistemicEntry } from "@memory/index";

const prompts = new Map<string, string>();

jest.mock("@services/STAPI", () => ({
  setStoryExtensionPrompt: (key: string, text: string) => { prompts.set(key, text); },
  clearStoryExtensionPrompt: (key: string) => { prompts.delete(key); },
}));

describe("Astra P0 risk: check outcomes pass the resting view", () => {
  it("a label naming a held secret never reaches the shared block, and other outcomes stay", () => {
    const secrets = heldSecrets([{ id: "h", subject: "Guard", tag: "hiding", hiddenFrom: "Max", content: "that the cellar key is hidden under the doormat", createdAt: 1, messageId: 1 } as unknown as EpistemicEntry], ["Guard", "Max"]);
    const block = (lines: string[]) => [CHECK_OUTCOME_HEADER, ...lines].join("\n");
    const manager = (text: string) => ({
      getLoadedChatId: () => "chat-1", turnBlocksHeld: () => false,
      game: { outcomeBlock: () => text },
      memoryActions: { restingText: (value: string) => withoutSecretLines(value, secrets, null) },
      subscribe: () => () => {},
    }) as unknown as RuntimeManager;
    const key = INJECTION_REGISTRY.checkOutcome.key;
    const stop = startCheckOutcome(manager(block(["- Search for the cellar key hidden under the doormat: succeeds.", "- Climb: fails."])));
    expect(prompts.get(key)).not.toContain("doormat");
    expect(prompts.get(key)).toContain("- Climb: fails.");
    stop();
    const only = startCheckOutcome(manager(block(["- Search for the cellar key hidden under the doormat: succeeds."])));
    expect(prompts.has(key)).toBe(false);
    only();
  });
});

describe("check outcome block (B10)", () => {
  it("is withheld while quiet or impersonate holds the turn blocks, and comes back on release", () => {
    let held = false;
    const listeners = new Set<() => void>();
    const manager = {
      getLoadedChatId: () => "chat-1",
      turnBlocksHeld: () => held,
      game: { outcomeBlock: () => "CHECK: climb succeeded" },
      memoryActions: { restingText: (value: string) => value },
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
