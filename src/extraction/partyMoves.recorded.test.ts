import { readWith } from "../../test/support/modelCall";
import * as recorded from "../../test/fixtures/player-evidence.recorded.json";
import { StoryEngine, parseStoryV2OrThrow, type PrimitiveValue, type Quality, type StoryV2 } from "@engine/index";
import { PLAYER_ONLY_EVIDENCE, runSharedRead } from "./sharedRead";
import type { SharedReadWindow } from "./types";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: [], extensionSettings: {} }),
}));

type Row = { journalLine: number; key: string; value: string; evidence: string; quality: Quality; window: { from: number; to: number; messages: Array<{ messageId: number; speaker: string; isUser: boolean; text: string }> } };

const typed = (row: Row): PrimitiveValue => (row.quality.type === "bool" ? row.value === "true" : row.value);

const read = async (row: Row, evidenceFrom = row.quality.evidence_from) => {
  const quality = { ...row.quality, evidence_from: evidenceFrom } as Quality;
  const story = parseStoryV2OrThrow({
    format: 2, id: "t2-1-moves", title: "Moves", description: "recorded", roster: [],
    qualities: [quality],
    checkpoints: [{ id: "here", name: "Here", objective: "o", type: "anchor", start: true }, { id: "there", name: "There", objective: "o", type: "anchor" }],
    transitions: [{ from: "here", to: "there", priority: 0, gate: { q: row.key, op: "==", v: typed(row) } }],
  } as unknown as StoryV2);
  const engine = new StoryEngine();
  engine.loadStory(story);
  const window: SharedReadWindow = { from: row.window.from, to: row.window.to, messages: row.window.messages.map((message) => ({ ...message, index: message.messageId })) };
  const line = `DELTA q=${row.key} value=${row.quality.type === "bool" ? row.value : `"${row.value}"`} evidence="${row.evidence}"`;
  const { audit } = await runSharedRead({ story, state: engine.serialize(), priority: 0, reason: "t2-1", window, ...readWith("p1", { debugResponse: line }) });
  return { accepted: audit.acceptedDeltas.map((entry) => `${entry.delta.q}=${String(entry.delta.v)}@${entry.messageId}`), rejected: [...new Set(audit.rejected.map((entry) => entry.reason))] };
};

const t21 = recorded.t2_1 as unknown as Row[];
const t15 = recorded.t1_5 as unknown as Row[];

describe("T2-1: a player's own move is theirs to decide (14 recorded rejections, findings.md extraction-rejected)", () => {
  it("every recorded party-location move is accepted once a later reply answers it, attributed to that reply", async () => {
    const moves = t21.filter((row) => row.key === "location" && row.value !== "behind_the_seals");
    expect(moves).toHaveLength(10);
    for (const row of moves) {
      const out = await read(row);
      const answer = row.window.messages.find((message) => !message.isUser && message.messageId > Math.max(...row.window.messages.filter((m) => m.isUser && m.text.includes(row.evidence.slice(0, 20))).map((m) => m.messageId)));
      expect({ line: row.journalLine, ...out }).toEqual({ line: row.journalLine, accepted: [`location=${row.value}@${answer?.messageId}`], rejected: [] });
    }
  });

  it("entered_mines and saga_called_home move the party too, but only an author who marks them party may take the player's line", async () => {
    const marked = t21.filter((row) => row.key === "entered_mines" || row.key === "saga_called_home");
    expect(marked).toHaveLength(3);
    for (const row of marked) {
      expect((await read(row)).rejected).toEqual([PLAYER_ONLY_EVIDENCE]);
      expect((await read(row, "party")).accepted).toHaveLength(1);
    }
  });

  it("a line that claims the world, not a move ('Beyond the seal ... I face the thing that breathes'), stays rejected", async () => {
    const seal = t21.find((row) => row.value === "behind_the_seals")!;
    expect((await read(seal)).rejected).toEqual([PLAYER_ONLY_EVIDENCE]);
  });
});

describe("T1-5 controls: the player's line never proves a world event, and a misread is not a move", () => {
  it("the fog and the castle (world events, marked world) stay rejected", async () => {
    const world = t15.filter((row) => row.key !== "location");
    expect(world.length).toBeGreaterThan(0);
    for (const row of world) {
      expect((await read(row)).rejected).toEqual([PLAYER_ONLY_EVIDENCE]);
    }
  });

  it("'The fog is pulling into that crowned thing.' read as a location stays rejected (no move in it)", async () => {
    const misread = t15.find((row) => row.value === "night_kelger_falls")!;
    expect((await read(misread)).rejected).toEqual([PLAYER_ONLY_EVIDENCE]);
  });

  it("a move with no later reply in the window stays rejected", async () => {
    const row = t21.find((candidate) => candidate.value === "javon_study")!;
    const said = row.window.messages.find((message) => message.isUser && message.text.includes("Father's study"))!;
    const cut = { ...row, window: { ...row.window, to: said.messageId, messages: row.window.messages.filter((message) => message.messageId <= said.messageId) } };
    expect((await read(cut)).rejected).toEqual([PLAYER_ONLY_EVIDENCE]);
  });
});
