import type { StoryV2 } from "@engine/index";
import type { ModelAsk, ModelCall } from "@extraction/modelRoute";
import { emptyEnvironment, type ProvisioningEnvironment } from "@wizard/index";
import { runAuthoringStage, STAGE_MAX_TOKENS, STAGE_TRUNCATED_ISSUE, STAGE_UNREADABLE_ISSUE } from "./authoring";
import type { CopilotStage } from "./types";

const ASK: ModelAsk = { role: "authoring", pass: "copilot" };

const draft = (): StoryV2 => ({
  format: 2,
  title: "The Redrawing Map",
  description: "An apprentice whose ink redraws the kingdom.",
  qualities: [{ key: "map_truth", type: "bool", source: "extractor", rubric: "Has the map changed the land?" }],
  checkpoints: [{ id: "start", name: "The Workshop", objective: "Finish the last district.", type: "anchor", start: true }],
  transitions: [],
  roster: [{ id: "orrin", name: "Master Orrin Vale" }],
});

interface Reply { text: string; finish?: "stop" | "length" }

const scripted = (replies: Reply[]) => {
  const prompts: string[] = [];
  const caps: Array<number | undefined> = [];
  const call: ModelCall = async (prompt, ask) => {
    prompts.push(prompt);
    caps.push(ask.maxTokens);
    const next = replies.shift() ?? { text: "" };
    return { text: next.text, finish: next.finish ?? "stop" };
  };
  return { call, prompts, caps };
};

const qualities = JSON.stringify({
  summary: "Two qualities.",
  ops: [
    { kind: "addQuality", quality: { key: "ink_debt", type: "int", source: "extractor", rubric: "How much has the pen cost?" } },
    { kind: "addQuality", quality: { key: "houses_angered", type: "int", source: "extractor", rubric: "How many houses has the apprentice angered?" } },
  ],
});

const cut = (text: string, at: number) => text.slice(0, at);

const run = (stage: CopilotStage, model: ModelCall, environment?: ProvisioningEnvironment) =>
  runAuthoringStage({ draft: draft(), stage, message: "", history: [], ...(environment ? { environment } : {}) }, model, ASK);

describe("T5-1-4 HIGH: a staged proposal is not cut short, and a cut one never shows a parser error", () => {
  it("gives every stage room for a rubric-bearing proposal", () => {
    expect(Math.min(...Object.values(STAGE_MAX_TOKENS))).toBeGreaterThanOrEqual(4096);
    expect(STAGE_MAX_TOKENS.qualities).toBeGreaterThan(2048);
    expect(Math.max(...Object.values(STAGE_MAX_TOKENS))).toBeLessThanOrEqual(8192);
  });

  it("asks for the stage's own cap", async () => {
    const model = scripted([{ text: qualities }]);
    expect((await run("qualities", model.call)).status).toBe("ok");
    expect(model.caps).toEqual([STAGE_MAX_TOKENS.qualities]);
  });

  it("retries a reply cut at the length limit with a request for a tighter proposal", async () => {
    const model = scripted([{ text: cut(qualities, 120), finish: "length" }, { text: qualities }]);
    const result = await run("qualities", model.call);
    expect(result.status).toBe("ok");
    expect(model.prompts[1]).toContain("was cut off");
    expect(model.prompts[1]).toContain("tighter");
    expect(model.prompts[1]).not.toMatch(/Unexpected end of JSON input|Unterminated string/);
  });

  it("reads an unterminated JSON reply as cut off even when the finish reason is unknown", async () => {
    const model = scripted([{ text: cut(qualities, 200) }, { text: qualities }]);
    expect((await run("qualities", model.call)).status).toBe("ok");
    expect(model.prompts[1]).toContain("was cut off");
  });

  it("shows one clear author message when the retry is cut too, never the parser's", async () => {
    const model = scripted([{ text: cut(qualities, 120), finish: "length" }, { text: cut(qualities, 150), finish: "length" }]);
    const result = await run("qualities", model.call);
    expect(result.status).toBe("failed");
    expect(result.issues).toEqual([STAGE_TRUNCATED_ISSUE]);
  });

  it("replaces a raw JSON syntax error with one author message", async () => {
    const model = scripted([{ text: "Here you go: {oops" }, { text: "still {not json" }]);
    const result = await run("qualities", model.call);
    expect(result.issues).toEqual([STAGE_TRUNCATED_ISSUE]);
    const prose = scripted([{ text: "no json here" }, { text: "none here either" }]);
    expect((await run("qualities", prose.call)).issues).toEqual([STAGE_UNREADABLE_ISSUE]);
  });
});

describe("T5-1-4 HIGH: the staged wizard never requires a persona the install does not have", () => {
  const effects = (personas: string[]) => JSON.stringify({
    summary: "Requirements.",
    ops: [{ kind: "setRequirements", requirements: { personas, members: ["Master Orrin Vale"] } }],
  });
  const install = { ...emptyEnvironment(), characterNames: ["Master Orrin Vale"], castNames: ["Master Orrin Vale"], personaNames: ["Max Nightriver"] };

  it("tells the effects stage which personas exist", async () => {
    const model = scripted([{ text: effects([]) }]);
    await run("effects", model.call, install);
    expect(model.prompts[0]).toContain("Personas on this install: Max Nightriver");
  });

  it("repairs a proposal that requires a missing persona, and fails it if the repair keeps it", async () => {
    const model = scripted([{ text: effects(["The Apprentice"]) }, { text: effects(["The Apprentice"]) }]);
    const result = await run("effects", model.call, install);
    expect(model.prompts[1]).toContain('"The Apprentice"');
    expect(result.status).toBe("failed");
    expect(result.issues.join(" ")).toContain("never created by the wizard");
  });

  it("accepts an existing persona, and no persona at all", async () => {
    expect((await run("effects", scripted([{ text: effects(["Max Nightriver"]) }]).call, install)).status).toBe("ok");
    expect((await run("effects", scripted([{ text: effects([]) }]).call, install)).status).toBe("ok");
  });
});
