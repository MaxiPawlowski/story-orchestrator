import { readWith } from "../../test/support/modelCall";
import { StoryEngine, parseStoryV2OrThrow, type NormalizedStoryV2 } from "@engine/index";
import { labelMemoryBlock, MEMORY_BLOCK_LABELS } from "@memory/index";
import { parseDirectorResponse, renderDirectorPrompt } from "@talk/index";
import { READ_TASK_HEADER, renderSharedReadPrompt } from "./contract";
import { rosterCharacterId, runSharedRead } from "./sharedRead";
import type { SharedReadWindow } from "./types";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: [], extensionSettings: {} }),
}));

const story = (): NormalizedStoryV2 => parseStoryV2OrThrow({
  format: 2,
  id: "audit",
  title: "Audit",
  description: "v2.6 plan 15 prompt audit",
  qualities: [{ key: "gate_open", type: "bool", source: "extractor", rubric: "Is the gate open?" }],
  checkpoints: [
    { id: "cp1", name: "The Gate", objective: "Get past the gate warden", type: "anchor", start: true },
    { id: "cp2", name: "The Yard", objective: "Cross the yard", type: "anchor" },
  ],
  transitions: [{ from: "cp1", to: "cp2", priority: 0, gate: { q: "gate_open", op: "==", v: true } }],
  roster: [{ id: "warden", name: "Arin", role: "the gate warden" }, { id: "nell" }],
});

const window: SharedReadWindow = {
  from: 0,
  to: 1,
  messages: [
    { index: 0, messageId: 0, speaker: "Max", text: "I show Arin the pass.", isUser: true },
    { index: 1, messageId: 1, speaker: "Arin", text: "Arin studies the seal and frowns.", isUser: false },
  ],
};

const read = (reply: string, deltasOnly = false) => {
  const s = story();
  const engine = new StoryEngine();
  engine.loadStory(s);
  return runSharedRead({ story: s, state: engine.serialize(), priority: 0, reason: "audit", window, ...(deltasOnly ? { deltasOnly } : {}), ...readWith("p1", { debugResponse: reply }) });
};

describe("v2.6 plan 15 prompt audit: shared read", () => {
  it("names the task, the checkpoint, the cast with roster ids and the player, and ends on Output:", async () => {
    const { audit } = await read("NO_DELTA\nSCENE_NONE");
    const lines = audit.prompt.split("\n");
    expect(lines[0]).toBe(READ_TASK_HEADER);
    expect(audit.prompt).toContain("Active checkpoint: The Gate — Get past the gate warden");
    expect(audit.prompt).toContain("Cast (roster id = name): warden = Arin (the gate warden); nell = nell");
    expect(audit.prompt).toContain("Player character: Max.");
    expect(lines[lines.length - 1]).toBe("Output:");
  });

  it("maps a MEMORY character tag written as a name to its roster id, and drops one naming nobody", async () => {
    const result = await read([
      "MEMORY type=detail importance=2 expiration=session character=\"Arin\" text=\"Arin doubts the seal\" evidence=\"studies the seal and frowns\"",
      "MEMORY type=detail importance=2 expiration=session character=\"warden\" text=\"The pass is suspect\" evidence=\"studies the seal\"",
      "MEMORY type=detail importance=1 expiration=session character=\"Stranger\" text=\"A pass was shown\" evidence=\"I show Arin the pass\"",
      "SCENE_NONE",
    ].join("\n"));
    expect(result.memory.map((line) => line.characterId)).toEqual(["warden", "warden", undefined]);
  });

  it("keeps a deltas-only read to the DELTA grammar", async () => {
    const { audit } = await read("NO_DELTA", true);
    expect(audit.prompt).toContain("DELTA q=");
    expect(audit.prompt).not.toContain("MEMORY type=");
    expect(audit.prompt).not.toContain("FACT importance=");
    expect(audit.prompt).not.toContain("[arc]");
    expect(audit.prompt).not.toContain("Cast (roster id");
  });

  it("falls back to the checkpoint id when the contract carries no checkpoint", () => {
    const prompt = renderSharedReadPrompt({ storyTitle: "S", activeCheckpointId: "cp9", qualities: [], window: { from: 0, to: -1, messages: [] }, canon: "" });
    expect(prompt).toContain("Active checkpoint: cp9");
    expect(prompt).not.toContain("Player character:");
  });

  it("resolves roster ids case-insensitively by id, then by name", () => {
    const { roster } = story();
    expect(rosterCharacterId(roster, "WARDEN")).toBe("warden");
    expect(rosterCharacterId(roster, " arin ")).toBe("warden");
    expect(rosterCharacterId(roster, "nobody")).toBeUndefined();
    expect(rosterCharacterId(roster, undefined)).toBeUndefined();
  });
});

describe("v2.6 plan 15 prompt audit: director", () => {
  const candidates = [{ rosterId: "warden", name: "Arin", weight: 1, role: "the gate warden" }, { rosterId: "nell", name: "Nell", weight: 1 }];
  const input = { storyTitle: "Audit", checkpointName: "The Gate", objective: "Get past", candidates, allowSilence: true, playerName: "Max", window: [{ speaker: "Max", text: "Hello?" }] };

  it("lists roles, names the player and stays a one-line task", () => {
    const prompt = renderDirectorPrompt(input);
    expect(prompt).toContain("- Arin: the gate warden");
    expect(prompt).toContain("- Nell");
    expect(prompt).toContain("Max is the player, not a candidate.");
    expect(prompt).toContain("Do NOT continue the roleplay");
    expect(prompt.split("\n").pop()).toBe("Answer with exactly one line, the name only, spelled as listed: SPEAKER: <Arin | Nell | NONE>");
  });

  it("keeps the names-only form when no candidate has a role", () => {
    expect(renderDirectorPrompt({ ...input, candidates: candidates.map(({ role: _role, ...rest }) => rest) })).toContain("Candidates: Arin, Nell");
  });

  it("accepts a name the model decorated with its role", () => {
    expect(parseDirectorResponse("SPEAKER: Arin (the gate warden)", candidates, false)).toEqual({ rosterId: "warden" });
    expect(parseDirectorResponse("SPEAKER: Arin: the gate warden", candidates, false)).toEqual({ rosterId: "warden" });
    expect(parseDirectorResponse("SPEAKER: Arinsson", candidates, false)).toBeNull();
  });
});

describe("v2.6 plan 15 prompt audit: memory blocks", () => {
  it("labels a non-empty tier block and leaves an empty one empty", () => {
    expect(labelMemoryBlock("facts", "A\nB")).toBe(`${MEMORY_BLOCK_LABELS.facts}\nA\nB`);
    expect(labelMemoryBlock("short_term", "")).toBe("");
  });
});
