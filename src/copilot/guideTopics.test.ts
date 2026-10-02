import { readFileSync } from "fs";
import { join } from "path";
import type { StoryV2 } from "@engine/index";
import { DIAGNOSTIC_CODES } from "../studio/diagnostics";
import { STUDIO_TAB_GUIDE } from "../studio/guideTabs";
import { DIAGNOSTIC_GUIDE_TOPIC, GUIDE_TOPICS, GUIDE_TOPIC_IDS, STAGE_GUIDE_TOPICS, readGuide, renderGuideTopic } from "./guideTopics";
import { renderStagePrompt } from "./prompts";
import { COPILOT_STAGES } from "./types";
import { renderPlanPrompt } from "./agent/prompt";
import { runReadTool } from "./agent/readTools";
import { AGENT_TOOLS, checkToolCall } from "./agent/tools";
import { emptyLookup } from "./agent/types";

const GUIDE = readFileSync(join(process.cwd(), "docs/authoring/story-guide.md"), "utf8").replace(/\r\n/g, "\n");
const MARKER = /<!-- topic: ([a-z0-9-]+) -->/g;

const docTopics = (): string[] => [...GUIDE.matchAll(MARKER)].map((match) => match[1]);

const section = (id: string): string => {
  const start = GUIDE.indexOf(`<!-- topic: ${id} -->`);
  const rest = GUIDE.slice(start + 1);
  const ends = [rest.search(/\n### /), rest.search(/\n## /)].filter((index) => index >= 0);
  return ends.length ? rest.slice(0, Math.min(...ends)) : rest;
};

const draft = { format: 2, title: "T", description: "D", qualities: [], checkpoints: [{ id: "start", name: "Start", objective: "o", type: "anchor", start: true }], transitions: [], roster: [] } as unknown as StoryV2;

describe("author's guide: the doc and the compact topics agree", () => {
  it("lists the same topics, in the same order", () => {
    expect(docTopics()).toEqual(GUIDE_TOPIC_IDS);
  });

  it("documents every field a compact topic names, in that topic's section", () => {
    const missing = GUIDE_TOPIC_IDS.flatMap((id) => GUIDE_TOPICS[id].fields.split(", ").filter((field) => !section(id).includes(field)).map((field) => `${id}: ${field}`));
    expect(missing).toEqual([]);
  });

  it("gives every diagnostic code a topic, and that topic's section names the code", () => {
    expect(Object.keys(DIAGNOSTIC_GUIDE_TOPIC).sort()).toEqual([...DIAGNOSTIC_CODES].sort());
    const unexplained = DIAGNOSTIC_CODES.filter((code) => !section(DIAGNOSTIC_GUIDE_TOPIC[code]).includes(`\`${code}\``));
    expect(unexplained).toEqual([]);
  });

  it("shows every topic on some Studio editor", () => {
    const shown = new Set(Object.values(STUDIO_TAB_GUIDE).flat());
    expect(GUIDE_TOPIC_IDS.filter((id) => !shown.has(id))).toEqual([]);
  });

  it("keeps each compact topic short enough for a tool observation", () => {
    expect(GUIDE_TOPIC_IDS.filter((id) => renderGuideTopic(id).length > 800)).toEqual([]);
  });
});

describe("readGuide", () => {
  it("returns the compact section for a topic", () => {
    expect(readGuide("latching")).toBe(renderGuideTopic("latching"));
    expect(readGuide(" Latching ")).toContain("undecided");
  });

  it("refuses an unknown topic with a did-you-mean hint and the topic list", () => {
    expect(readGuide("talk-contol")).toContain('No guide topic "talk-contol" (did you mean "talk-control"?)');
    expect(readGuide("zzz")).toContain(`Topics: ${GUIDE_TOPIC_IDS.join(", ")}.`);
    expect(readGuide(undefined)).toMatch(/^Name a topic\./);
  });

  it("is a read tool the agent can call, with a closed schema", () => {
    expect(AGENT_TOOLS.readGuide.family).toBe("read");
    expect(checkToolCall({ tool: "readGuide", args: { topic: "gates" } })).toEqual({ ok: true, spec: AGENT_TOOLS.readGuide });
    expect(checkToolCall({ tool: "readGuide", args: { topc: "gates" } })).toEqual({ ok: false, message: expect.stringContaining('(did you mean "topic"?)') });
    expect(runReadTool("readGuide", { topic: "house-rules" }, draft, emptyLookup())).toBe(renderGuideTopic("house-rules"));
  });
});

describe("the wizards are told about the guide", () => {
  it("the agent rules name readGuide and every topic", () => {
    const prompt = renderPlanPrompt({ goal: "g", notes: [], steps: [], plan: [], budget: { maxSteps: 4 } } as never, draft, { characterNames: [], lorebookNames: [], ownedLorebooks: [], castNames: [], personaNames: [] } as never);
    expect(prompt).toContain("Consult readGuide(topic)");
    expect(GUIDE_TOPIC_IDS.filter((id) => !prompt.includes(id))).toEqual([]);
  });

  it("each staged prompt carries its stage's topics, after the stage's op line", () => {
    COPILOT_STAGES.forEach((stage) => {
      const prompt = renderStagePrompt(stage, draft, "", []);
      STAGE_GUIDE_TOPICS[stage].forEach((id) => expect(prompt).toContain(GUIDE_TOPICS[id].text));
      expect(prompt.indexOf("Only emit")).toBeLessThan(prompt.indexOf("Author's guide, for this stage"));
    });
    expect(GUIDE_TOPIC_IDS.filter((id) => GUIDE_TOPICS[id].text.includes("Only emit"))).toEqual([]);
  });
});
