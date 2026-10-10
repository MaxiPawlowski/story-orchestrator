import { readFileSync } from "fs";
import { join } from "path";
import { DIAGNOSTIC_CODES } from "../../studio/diagnosticCodes";
import { DIAGNOSTIC_GUIDE_TOPIC, GUIDE_TOPICS } from "../guideTopics";
import { renderPlanPrompt } from "./prompt";
import { checkToolCall, AGENT_TOOLS, EDIT_TOOLS } from "./tools";
import { RECIPES, RECIPE_IDS, readRecipe, renderRecipe, type Recipe } from "./recipes";
import { AUTHOR_ASK_TOOLS, PLAYER_ASK_TOOLS } from "./ask";

const GUIDE = readFileSync(join(process.cwd(), "docs/authoring/story-guide.md"), "utf8").replace(/\r\n/g, "\n");

const section = (id: string): string => {
  const start = GUIDE.indexOf(`<!-- topic: ${id} -->`);
  const rest = GUIDE.slice(start + 1);
  const ends = [rest.search(/\n### /), rest.search(/\n## /)].filter((index) => index >= 0);
  return ends.length ? rest.slice(0, Math.min(...ends)) : rest;
};

const all = (): Array<[string, Recipe]> => RECIPE_IDS.map((id) => [id, RECIPES[id]]);

describe("v2.8 09 owner 2026-10-10: wizard recipes stay in step with the tools, the guide and the diagnostics", () => {
  it("names only tools that exist, so a renamed tool fails the build", () => {
    const missing = all().flatMap(([id, recipe]) => [...recipe.steps.map((step) => step.tool), ...recipe.verify].filter((tool) => !Object.hasOwn(AGENT_TOOLS, tool)).map((tool) => `${id}: ${tool}`));
    expect(missing).toEqual([]);
  });

  it("starts each recipe on its guide and writes with at least one edit tool", () => {
    all().forEach(([, recipe]) => {
      expect(recipe.steps[0].tool).toBe("readGuide");
      expect(recipe.steps.some((step) => Object.hasOwn(EDIT_TOOLS, step.tool))).toBe(true);
    });
  });

  it("names guide topics that exist, and every diagnostic it checks for is a real code explained by one of its topics", () => {
    const problems = all().flatMap(([id, recipe]) => [
      ...recipe.topics.filter((topic) => !Object.hasOwn(GUIDE_TOPICS, topic)).map((topic) => `${id}: topic ${topic}`),
      ...recipe.diagnostics.filter((code) => !(DIAGNOSTIC_CODES as readonly string[]).includes(code)).map((code) => `${id}: code ${code}`),
      ...recipe.diagnostics.filter((code) => !recipe.topics.includes(DIAGNOSTIC_GUIDE_TOPIC[code])).map((code) => `${id}: ${code} is explained by ${DIAGNOSTIC_GUIDE_TOPIC[code]}`),
    ]);
    expect(problems).toEqual([]);
  });

  it("takes every trap from the guide: its cue is in that topic's section", () => {
    const stale = all().flatMap(([id, recipe]) => recipe.traps.filter((trap) => !recipe.topics.includes(trap.topic) || !section(trap.topic).includes(trap.cue)).map((trap) => `${id}: ${trap.cue}`));
    expect(stale).toEqual([]);
  });

  it("is a read tool for the agent and for author Ask, never for player Ask", () => {
    expect(AGENT_TOOLS.readRecipe.family).toBe("read");
    expect(checkToolCall({ tool: "readRecipe", args: { recipe: "chapters" } })).toEqual({ ok: true, spec: AGENT_TOOLS.readRecipe });
    expect(AUTHOR_ASK_TOOLS).toContain("readRecipe");
    expect(PLAYER_ASK_TOOLS).not.toContain("readRecipe");
  });

  it("renders the steps in order with what to check, and refuses an unknown recipe with a did-you-mean", () => {
    const text = renderRecipe("quest-line");
    expect(text.indexOf("readGuide")).toBeLessThan(text.indexOf("setQuests"));
    expect(text).toContain("Then check: readValidation, readDiagnostics, simulateWalk");
    expect(readRecipe(" Chapters ")).toBe(renderRecipe("chapters"));
    expect(readRecipe("quest-lines")).toContain('(did you mean "quest-line"?)');
    expect(readRecipe(undefined)).toMatch(/^Name a recipe\./);
    expect(RECIPE_IDS.filter((id) => renderRecipe(id).length > 2000)).toEqual([]);
  });

  it("the measured recipe tasks name real recipes and require exactly their required edit steps", () => {
    const fixture = JSON.parse(readFileSync(join(process.cwd(), "test/measurements/v2.8/09/recipes.json"), "utf8")) as { tasks: Array<{ recipe: string; requires: string[] }> };
    expect(fixture.tasks.length).toBeGreaterThanOrEqual(2);
    fixture.tasks.forEach((task) => {
      expect(RECIPE_IDS).toContain(task.recipe);
      const recipe: Recipe = RECIPES[task.recipe as keyof typeof RECIPES];
      expect(task.requires).toEqual(recipe.steps.filter((step) => !step.optional && Object.hasOwn(EDIT_TOOLS, step.tool)).map((step) => step.tool));
    });
  });

  it("the agent's rules list every recipe", () => {
    const draft = { format: 2, title: "T", description: "D", qualities: [], checkpoints: [], transitions: [], roster: [] } as never;
    const prompt = renderPlanPrompt({ goal: "g", notes: [], steps: [], plan: [], budget: { maxSteps: 4 } } as never, draft, { characterNames: [], lorebookNames: [], ownedLorebooks: [], castNames: [], personaNames: [] } as never);
    expect(RECIPE_IDS.filter((id) => !prompt.includes(id))).toEqual([]);
  });
});
