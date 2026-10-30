import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { READ_LAYOUT_TURNS, readLayoutRead } from "../../test/support/readLayoutFixture";
import { PROMISE_ADDRESSEE_LINE } from "@memory/promises/contract";
import { renderPlayerOnlyReask, renderSharedReadPrompt, hashContract, PLAYER_ONLY_REASK } from "./contract";
import { readContract } from "./sharedRead";
import { isReadLayout, readPromptOptions } from "./sharedReadEntry";
import { buildFixtureRun } from "./fixtureRun";
import { sanitizeGlobalSettings, defaultGlobalSettings } from "@runtime/settingsModel";
import { StoryEngine } from "@engine/index";
import { READ_LAYOUT_STORY } from "../../test/support/readLayoutFixture";

jest.mock("@services/STAPI", () => ({ settingsAreLoaded: () => true, settingsReady: async () => {}, getContext: () => ({ chat: [], extensionSettings: {} }) }));

const GOLDEN = resolve(__dirname, "../../test/goldens/read-prompt");
const golden = (name: string): Array<{ prompt: string; contractHash: string }> => JSON.parse(readFileSync(join(GOLDEN, name), "utf-8"));
const STABLE = { readPrompt: { readLayout: "stable-first" as const } };
const BOTH = { readPrompt: { readLayout: "stable-first" as const, promiseAddressee: true } };

const lines = (prompt: string) => prompt.split("\n").filter((line) => line.trim() !== "").sort();
const commonPrefix = (left: string, right: string) => {
  let at = 0;
  while (at < left.length && left[at] === right[at]) at += 1;
  return at;
};
const ARC_LINE_CLASSIC = "[arc] <a NEW unresolved thread introduced in this window, not already listed above>";
const ARC_LINE_STABLE = "[arc] <a NEW unresolved thread introduced in this window, not already listed under EXISTING OPEN ARCS>";

describe("v3.0 A1: story read line order (extraction.readLayout), off by default until the GPU live suite", () => {
  it("the setting off renders the master prompt and contract hash byte for byte (golden from a97af36c)", async () => {
    const expected = golden("classic.json");
    for (const [index, turn] of READ_LAYOUT_TURNS.entries()) {
      const { audit } = await readLayoutRead(turn);
      expect({ prompt: audit.prompt, contractHash: audit.contractHash }).toEqual(expected[index]);
      expect((await readLayoutRead(turn, { readPrompt: {} })).audit.prompt).toBe(expected[index].prompt);
    }
  });

  it("stable-first matches its golden (both read-prompt settings on)", async () => {
    const expected = golden("stable-first.json");
    for (const [index, turn] of READ_LAYOUT_TURNS.entries()) {
      const { audit } = await readLayoutRead(turn, BOTH);
      expect({ prompt: audit.prompt, contractHash: audit.contractHash }).toEqual(expected[index]);
    }
  });

  it("stable-first carries the same lines, reordered, with only the arc line's reference reworded", async () => {
    for (const turn of READ_LAYOUT_TURNS) {
      const classic = lines((await readLayoutRead(turn)).audit.prompt);
      const stable = lines((await readLayoutRead(turn, STABLE)).audit.prompt);
      expect(stable.map((line) => (line === ARC_LINE_STABLE ? ARC_LINE_CLASSIC : line)).sort()).toEqual(classic);
      expect(stable).not.toContain(ARC_LINE_CLASSIC);
    }
  });

  it("two consecutive reads share every rule line under stable-first and diverge early in today's order", async () => {
    const [first, second] = await Promise.all(READ_LAYOUT_TURNS.map((turn) => readLayoutRead(turn, STABLE)));
    const [oldFirst, oldSecond] = await Promise.all(READ_LAYOUT_TURNS.map((turn) => readLayoutRead(turn)));
    const shared = commonPrefix(first.audit.prompt, second.audit.prompt);
    const boundary = first.audit.prompt.indexOf("\nActive checkpoint:");
    expect(shared).toBeGreaterThanOrEqual(boundary);
    expect(commonPrefix(oldFirst.audit.prompt, oldSecond.audit.prompt)).toBeLessThan(oldFirst.audit.prompt.indexOf("Read only the transcript"));
    expect(shared / first.audit.prompt.length).toBeGreaterThan(0.6);
    expect(first.audit.prompt.endsWith("Output:")).toBe(true);
    expect(first.audit.prompt.lastIndexOf("Transcript:")).toBeGreaterThan(first.audit.prompt.lastIndexOf("Quality questions:"));
  });

  it("the layout is part of the contract hash only when it is set", async () => {
    const turn = READ_LAYOUT_TURNS[0];
    const classic = (await readLayoutRead(turn)).audit.contractHash;
    expect((await readLayoutRead(turn, STABLE)).audit.contractHash).not.toBe(classic);
    expect((await readLayoutRead(turn, { readPrompt: {} })).audit.contractHash).toBe(classic);
  });

  it("deltas-only and the player-only re-ask keep their shape under stable-first", () => {
    const story = READ_LAYOUT_STORY();
    const engine = new StoryEngine();
    engine.loadStory(story);
    const window = READ_LAYOUT_TURNS[0].window;
    const contract = readContract({ story, state: engine.serialize(), deltasOnly: true, ...STABLE }, window, []);
    const prompt = renderSharedReadPrompt(contract);
    expect(prompt).not.toContain("MEMORY type=");
    expect(prompt).not.toContain("FACT importance=");
    expect(prompt).not.toContain("Cast (roster id");
    const reask = renderPlayerOnlyReask(readContract({ story, state: engine.serialize(), ...STABLE }, window, []), ["DELTA q=gate_open value=true evidence=\"x\""]);
    expect(reask.indexOf(PLAYER_ONLY_REASK)).toBeGreaterThan(reask.indexOf("Transcript:"));
    expect(reask.endsWith("\nOutput:")).toBe(true);
    expect(hashContract(contract)).not.toBe(hashContract({ ...contract, layout: undefined }));
  });

  it("the live-suite fixture prompt follows the layout when the spec names it", () => {
    const spec = { story: JSON.parse(JSON.stringify({ id: "f", title: "F", description: "f", qualities: [{ key: "gate_open", type: "bool", source: "extractor", rubric: "Open?" }],
      checkpoints: [{ id: "a", name: "A", objective: "Go", type: "anchor", start: true }], transitions: [], roster: [{ id: "m", name: "Mara" }] })),
    transcript: [{ index: 0, speaker: "Mara", text: "The gate is open." }] };
    const classic = buildFixtureRun(spec).prompt;
    const stable = buildFixtureRun({ ...spec, readLayout: "stable-first" }).prompt;
    expect(stable).not.toBe(classic);
    expect(stable.indexOf("Active checkpoint:")).toBeGreaterThan(stable.indexOf("Read only the transcript"));
    expect(classic.indexOf("Active checkpoint:")).toBeLessThan(classic.indexOf("Read only the transcript"));
  });
});

describe("v3.0 D4: the promise addressee line (extraction.promiseAddressee), off by default until GS6.8 + live suite", () => {
  it("adds the v2.8 47 C3 candidate line once, inside the promise rules, only when promises are read", async () => {
    const turn = READ_LAYOUT_TURNS[0];
    const off = (await readLayoutRead(turn)).audit;
    const on = (await readLayoutRead(turn, { readPrompt: { promiseAddressee: true } })).audit;
    expect(off.prompt).not.toContain(PROMISE_ADDRESSEE_LINE);
    expect(on.prompt.split(PROMISE_ADDRESSEE_LINE)).toHaveLength(2);
    expect(on.prompt.indexOf(PROMISE_ADDRESSEE_LINE)).toBeGreaterThan(on.prompt.indexOf("Leave out \"| by ...\""));
    expect(on.prompt.indexOf(PROMISE_ADDRESSEE_LINE)).toBeLessThan(on.prompt.indexOf("OPEN PROMISES"));
    expect(on.prompt.replace(`${PROMISE_ADDRESSEE_LINE}\n`, "")).toBe(off.prompt);
    expect(on.contractHash).not.toBe(off.contractHash);
    const featureOff = (await readLayoutRead(turn, { openPromises: null, readPrompt: { promiseAddressee: true } })).audit;
    expect(featureOff.prompt).not.toContain(PROMISE_ADDRESSEE_LINE);
    expect(featureOff.prompt).not.toContain("[promised]");
  });
});

describe("read-prompt settings", () => {
  it("default to absent (today's read), keep only the values they name, and reach the read options", () => {
    const fresh = defaultGlobalSettings().extraction;
    expect(fresh).not.toHaveProperty("readLayout");
    expect(fresh).not.toHaveProperty("promiseAddressee");
    expect(sanitizeGlobalSettings(undefined).extraction).not.toHaveProperty("readLayout");
    const stored = sanitizeGlobalSettings({ extraction: { readLayout: "stable-first", promiseAddressee: true } }).extraction;
    expect([stored.readLayout, stored.promiseAddressee]).toEqual(["stable-first", true]);
    const junk = sanitizeGlobalSettings({ extraction: { readLayout: "classic", promiseAddressee: "yes" } }).extraction;
    expect(junk).not.toHaveProperty("readLayout");
    expect(junk).not.toHaveProperty("promiseAddressee");
    expect(readPromptOptions(fresh)).toEqual({});
    expect(readPromptOptions(stored)).toEqual({ readPrompt: { readLayout: "stable-first", promiseAddressee: true } });
    expect([isReadLayout("stable-first"), isReadLayout("classic"), isReadLayout(undefined)]).toEqual([true, false, false]);
  });
});
