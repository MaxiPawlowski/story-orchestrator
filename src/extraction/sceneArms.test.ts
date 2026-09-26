import * as fs from "node:fs";
import * as path from "node:path";
import { estimateTokens } from "./callBudget";
import { sceneArmPasses, type SceneArmSpec } from "./sceneArms";

const message = (messageId: number, text = `line ${messageId}`) => ({ messageId, speaker: messageId % 2 ? "Orin" : "Selene", text });
const spec = (overrides: Partial<SceneArmSpec> = {}): SceneArmSpec => ({
  messages: Array.from({ length: 12 }, (_, index) => message(40 + index)),
  sceneStart: 40,
  detectFrom: 44,
  to: 51,
  participants: ["Orin", "Selene"],
  ...overrides,
});
const covered = (passes: ReturnType<typeof sceneArmPasses>) => passes.flatMap((pass) => pass.messageIds);

describe("v2.5 plan 05 F3 spike: the two arms of the epistemic/ledger pass", () => {
  it("arm A reads only the detecting window, as the pass does today", () => {
    const passes = sceneArmPasses(spec(), "A");
    expect(passes).toHaveLength(1);
    expect(covered(passes)).toEqual([44, 45, 46, 47, 48, 49, 50, 51]);
    expect(passes[0].epistemicPrompt).toContain("Orin: line 45");
    expect(passes[0].epistemicPrompt).not.toContain("line 41");
  });

  it("arm B reads the whole scene, from its start to the detecting read's end", () => {
    const passes = sceneArmPasses(spec(), "B");
    expect(passes).toHaveLength(1);
    expect(covered(passes)).toEqual([40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51]);
    expect(passes[0].epistemicPrompt).toContain("Orin: line 41");
    expect(passes[0].ledgerPrompt).toContain("Orin: line 41");
  });

  it("arm B is packed by the existing chunker when a budget is given, and every message is read exactly once", () => {
    const long = spec({ messages: Array.from({ length: 12 }, (_, index) => message(40 + index, "x".repeat(400))) });
    const passes = sceneArmPasses(long, "B", { budget: 400, promptOverhead: 0, count: estimateTokens });
    expect(passes.length).toBeGreaterThan(1);
    expect(covered(passes)).toEqual([40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51]);
    passes.forEach((pass) => expect(pass.to).toBeGreaterThanOrEqual(pass.from));
  });

  it("control: when the scene starts inside the detecting window the arms read the same messages", () => {
    const inside = spec({ sceneStart: 46, detectFrom: 44 });
    expect(covered(sceneArmPasses(inside, "B"))).toEqual([46, 47, 48, 49, 50, 51]);
    const same = spec({ sceneStart: 44 });
    expect(sceneArmPasses(same, "B").map((pass) => pass.epistemicPrompt)).toEqual(sceneArmPasses(same, "A").map((pass) => pass.epistemicPrompt));
  });

  it("control: messages outside the scene are never read by either arm", () => {
    const withTail = spec({ messages: [message(38), message(39), ...spec().messages, message(52)] });
    expect(covered(sceneArmPasses(withTail, "B"))).toEqual([40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51]);
    expect(covered(sceneArmPasses(withTail, "A"))).toEqual([44, 45, 46, 47, 48, 49, 50, 51]);
  });

  it("the prompts are the pass's own prompt builders, not the shared read", () => {
    const [pass] = sceneArmPasses(spec({ entities: [{ name: "Orin", type: "character" }] }), "A");
    expect(pass.epistemicPrompt).toContain("Characters present in this scene: Orin, Selene.");
    expect(pass.ledgerPrompt).toContain("- Orin (character)");
    expect(pass.epistemicPrompt).not.toContain("DELTA q=");
  });
});

describe("v2.5 plan 05 F3 measurement set (test/fixtures/f3-scene)", () => {
  const dir = path.join(process.cwd(), "test/fixtures/f3-scene");
  const scenes = fs.readdirSync(dir).filter((file) => file.endsWith(".scene.json")).map((file) => ({ file, scene: JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) }));

  it("holds at least four long scenes and a short slice", () => {
    expect(scenes.filter(({ scene }) => scene.slice === "long").length).toBeGreaterThanOrEqual(4);
    expect(scenes.filter(({ scene }) => scene.slice === "short").length).toBeGreaterThanOrEqual(2);
  });

  it.each(scenes.map(({ file, scene }) => [file, scene] as const))("%s: a long scene sets its asymmetry more than 8 messages before the break, a short one inside the detecting window", (_file, scene) => {
    expect(scene.to - scene.detectFrom + 1).toBe(8);
    const setAt: number[] = scene.expected.epistemic.concat(scene.expected.ledger ?? []).map((item: { setAt: number }) => item.setAt);
    if (scene.slice === "long") setAt.forEach((index) => expect(scene.to - index).toBeGreaterThan(8));
    else setAt.forEach((index) => expect(index).toBeGreaterThanOrEqual(scene.detectFrom));
    const ids = scene.transcript.map((entry: { index: number }) => entry.index);
    expect(ids[0]).toBe(scene.sceneStart);
    expect(ids[ids.length - 1]).toBe(scene.to);
  });
});
