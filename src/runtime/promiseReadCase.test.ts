import { createTokenMeter } from "@extraction/tokenMeter";
import { defaultContextLimit } from "@extraction/inputBudget";
import type { ModelCall } from "@extraction/modelRoute";
import { runPromiseReadCase } from "./promiseReadCase";

const STORY = {
  format: 2, id: "so-p47-unit", title: "P47 unit", description: "",
  qualities: [{ key: "town_mood", type: "enum", values: ["calm", "uneasy"], source: "extractor", rubric: "How does the town feel?" }],
  checkpoints: [{ id: "town", name: "Town", type: "anchor", start: true, objective: "Stay." }],
  transitions: [], roster: [{ id: "mira", name: "Mira" }, { id: "tobin", name: "Tobin" }],
};

const CHAT = [
  { name: "Mira", mes: "My lantern broke." },
  { name: "Rowan", mes: "Mira, I promise I'll bring you a new lantern.", is_user: true },
  { name: "Mira", mes: "You brought it. You kept your word." },
];

const budget = () => ({ contextLimit: defaultContextLimit("unit"), meter: createTokenMeter() });

const replying = (text: string, prompts: string[] = []): ModelCall => async (prompt, ask) => {
  prompts.push(prompt);
  return { text: ask.debugResponse ?? text, finish: "stop", model: "unit" };
};

describe("plan 47 harness: runPromiseRead runs the shipped shared read and the shipped acceptor", () => {
  it("renders the promise contract with the seeded open promise and applies the read's lines", async () => {
    const prompts: string[] = [];
    const seed = [{ key: "a", promisee: "mira", messageId: 1, quote: "I promise I'll bring you a new lantern" }];
    const result = await runPromiseReadCase({ story: STORY, chat: CHAT, from: 2, to: 2, playerName: "Rowan", seed }, {
      budget, model: replying("", prompts),
    }).then((first) => runPromiseReadCase({ story: STORY, chat: CHAT, from: 2, to: 2, playerName: "Rowan", seed, debugResponse: `[kept] ${first.seeded.a} | m=2 | "You kept your word"\nNO_DELTA` }, { budget, model: replying("", prompts) }));
    expect(prompts[0]).toContain("OPEN PROMISES");
    expect(prompts[0]).toContain(`${result.seeded.a} Mira: "I promise I'll bring you a new lantern"`);
    expect(result.promiseLines).toHaveLength(1);
    expect(result.events).toEqual([expect.objectContaining({ key: "a", kind: "kept", messageId: 2 })]);
    expect(result.inputTokens).toBeGreaterThan(0);
  });

  it("drops the promise section and ignores promise lines with promises off (the P8 off arm)", async () => {
    const prompts: string[] = [];
    const reply = '[promised] Mira | m=1 | "I promise I\'ll bring you a new lantern"\nNO_DELTA';
    const on = await runPromiseReadCase({ story: STORY, chat: CHAT, from: 0, to: 2, playerName: "Rowan", debugResponse: reply }, { budget, model: replying("", prompts) });
    const off = await runPromiseReadCase({ story: STORY, chat: CHAT, from: 0, to: 2, playerName: "Rowan", debugResponse: reply, promises: false }, { budget, model: replying("", prompts) });
    expect(on.rows).toEqual([expect.objectContaining({ promisee: "mira", messageId: 1, isUser: true })]);
    expect(on.prompt).toContain("Promises the player makes");
    expect(off.prompt).not.toContain("Promises the player makes");
    expect(off.rows).toEqual([]);
    expect(off.promiseLines).toEqual([]);
    expect(on.inputTokens).toBeGreaterThan(off.inputTokens);
  });
});
