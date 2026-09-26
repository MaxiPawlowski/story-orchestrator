import type { ModelAsk, ModelCall } from "@extraction/modelRoute";
import { sceneArmRunner } from "./sceneArmRunner";

const spec = {
  messages: Array.from({ length: 12 }, (_, index) => ({ messageId: 40 + index, speaker: index === 1 ? "Orin" : "Narrator", text: index === 1 ? "the envoy will be poisoned" : `beat ${index}` })),
  sceneStart: 40,
  detectFrom: 44,
  to: 51,
  participants: ["Orin", "Selene"],
  entities: [{ name: "Orin", type: "character" }],
};

const fakeModel = () => {
  const asks: Array<{ prompt: string; ask: ModelAsk }> = [];
  const model: ModelCall = async (prompt, ask) => {
    asks.push({ prompt, ask });
    if (ask.pass === "ledger") return { text: "[state:Orin:character] mood=uneasy", finish: "stop" };
    return { text: prompt.includes("poisoned") ? "[knows] Orin | the envoy will be poisoned\n[unaware] Selene | the poisoning" : "NONE", finish: "stop" };
  };
  return { model, asks };
};

describe("v2.5 plan 05 F3 spike: the live probe runs the pass prompts per arm and parses what comes back", () => {
  it("arm A never shows the model the early asymmetry, arm B does", async () => {
    const a = fakeModel();
    const resultA = await sceneArmRunner(a.model)(spec, "A");
    expect(resultA.epistemic).toEqual([]);
    expect(a.asks.map((entry) => entry.ask.pass)).toEqual(["epistemic", "ledger"]);
    const b = fakeModel();
    const resultB = await sceneArmRunner(b.model)(spec, "B");
    expect(resultB.epistemic.map((signal) => `${signal.tag}:${signal.subject}`)).toEqual(["knows:Orin", "unaware:Selene"]);
    expect(resultB.ledger.map((signal) => `${signal.entity}.${signal.field}=${signal.value}`)).toEqual(["Orin.mood=uneasy"]);
  });

  it("prompt cost is the sum of every prompt sent, per pass", async () => {
    const { model, asks } = fakeModel();
    const result = await sceneArmRunner(model)({ ...spec, messages: spec.messages.map((message) => ({ ...message, text: `${message.text} ${"x".repeat(300)}` })) }, "B", 300);
    expect(result.passes.length).toBeGreaterThan(1);
    expect(asks).toHaveLength(result.passes.length * 2);
    expect(result.promptChars).toBe(asks.reduce((total, entry) => total + entry.prompt.length, 0));
    expect(result.passes.reduce((total, pass) => total + pass.promptChars, 0)).toBe(result.promptChars);
  });

  it("every call rides the read role with a bounded answer", async () => {
    const { model, asks } = fakeModel();
    await sceneArmRunner(model)(spec, "A");
    asks.forEach(({ ask }) => {
      expect(ask.role).toBe("read");
      expect(ask.maxTokens).toBe(512);
    });
  });
});
