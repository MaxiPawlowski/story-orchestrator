import { LORE_CONTENT_RULE, LORE_RULE_OFF_GLOBAL, loreContentRule, renderStagePrompt } from "./prompts";
import { renderPlanPrompt } from "./agent/prompt";

const DRAFT = { format: 2, title: "T", description: "D", qualities: [], checkpoints: [], transitions: [], roster: [] } as never;
const SESSION = { goal: "g", notes: [], steps: [], plan: [], budget: { maxSteps: 4 } } as never;
const ENV = { characterNames: [], lorebookNames: [], ownedLorebooks: [], castNames: [], personaNames: [] } as never;
const prompts = () => [renderStagePrompt("provisioning", DRAFT, "", []), renderPlanPrompt(SESSION, DRAFT, ENV), renderPlanPrompt(SESSION, DRAFT, ENV, true)];

describe("v2.8 09 A7 measurement switch: the lore-writing rule leaves only for the off arm", () => {
  afterEach(() => { Reflect.deleteProperty(globalThis, LORE_RULE_OFF_GLOBAL); });

  it("by default the staged grammar and both agent prompts carry the rule", () => {
    expect(loreContentRule()).toBe(LORE_CONTENT_RULE);
    expect(prompts().filter((prompt) => !prompt.includes(LORE_CONTENT_RULE))).toEqual([]);
  });

  it("the off arm removes the rule from every prompt and nothing else", () => {
    const on = prompts();
    Reflect.set(globalThis, LORE_RULE_OFF_GLOBAL, true);
    const off = prompts();
    expect(off.filter((prompt) => prompt.includes(LORE_CONTENT_RULE) || prompt.includes("lore entry for its kind"))).toEqual([]);
    expect(off.map((prompt, at) => prompt === on[at].replace(` ${LORE_CONTENT_RULE}`, "").replace(`\n${LORE_CONTENT_RULE}`, ""))).toEqual([true, true, true]);
  });

  it("only a literal true switches it off", () => {
    Reflect.set(globalThis, LORE_RULE_OFF_GLOBAL, "true");
    expect(loreContentRule()).toBe(LORE_CONTENT_RULE);
  });
});
