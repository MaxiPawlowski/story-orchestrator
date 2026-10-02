import { recordingModel } from "../../test/support/modelCall";
import * as recorded from "../../test/fixtures/t3-1-world-evidence.recorded.json";
import * as earlier from "../../test/fixtures/player-evidence.recorded.json";
import { StoryEngine, parseStoryV2OrThrow, type PrimitiveValue, type Quality, type StoryV2 } from "@engine/index";
import { PLAYER_ONLY_REASK } from "./contract";
import { NOT_CONFIRMED, PLAYER_ONLY_EVIDENCE, runSharedRead } from "./sharedRead";
import type { SharedReadWindow } from "./types";

jest.mock("@services/STAPI", () => ({
  settingsAreLoaded: () => true,
  settingsReady: async () => {},
  observeNextSave: async () => ({ requested: true, status: 200, ok: true, timedOut: false }),
  readServerBoundary: async () => null,
  getContext: () => ({ chat: [], extensionSettings: {} }),
}));

type Message = { messageId: number; speaker: string; isUser: boolean; text: string };
type Row = { journalLine: number; key: string; value: string; evidence: string; window: { from: number; to: number; messages: Message[] } };
type T3Row = Row & { reason: string; rawResponse: string; recordedAccepted: string[] };
type EarlierRow = Row & { quality: Quality };

const T3_QUALITIES = recorded.qualities as unknown as Quality[];
const t3 = recorded.rows as unknown as T3Row[];

const storyOf = (qualities: Quality[], gateKey: string, value: PrimitiveValue) => parseStoryV2OrThrow({
  format: 2, id: "t3-1-world", title: "World evidence", description: "recorded", roster: [],
  qualities,
  checkpoints: [{ id: "here", name: "Here", objective: "o", type: "anchor", start: true }, { id: "there", name: "There", objective: "o", type: "anchor" }],
  transitions: [{ from: "here", to: "there", priority: 0, gate: { q: gateKey, op: "==", v: value } }],
} as unknown as StoryV2);

const windowOf = (row: Row): SharedReadWindow => ({ from: row.window.from, to: row.window.to, messages: row.window.messages.map((message) => ({ ...message, index: message.messageId })) });

const replay = async (qualities: Quality[], row: Row, first: string, reask: (prompt: string) => string) => {
  const typed = row.value === "true" ? true : row.value === "false" ? false : row.value;
  const story = storyOf(qualities, row.key, typed);
  const engine = new StoryEngine();
  engine.loadStory(story);
  const model = recordingModel((prompt) => (model.calls.length === 1 ? first : reask(prompt)));
  const scope = qualities.map((quality) => ({ key: quality.key, quality: story.qualityByKey[quality.key], hints: [] }));
  const keys = new Set(qualities.map((quality) => quality.key));
  const { audit } = await runSharedRead({ story, state: engine.serialize(), priority: 0, reason: "replay", window: windowOf(row), scope, model, ask: { role: "read", pass: "read" } });
  return {
    calls: model.calls.length,
    reaskPrompt: model.calls[1]?.prompt ?? null,
    accepted: audit.acceptedDeltas.filter((entry) => keys.has(entry.delta.q)).map((entry) => `${entry.delta.q}=${String(entry.delta.v)}@${entry.messageId}`),
    rejected: audit.rejected.filter((entry) => entry.line.includes(`q=${row.key}`)).map((entry) => entry.reason),
    reask: audit.reask ?? null,
  };
};

const said = (row: Row) => Math.max(...row.window.messages.filter((message) => message.isUser && message.text.includes(row.evidence.replace(/^\*/, "").slice(0, 20))).map((message) => message.messageId));
const narrator = (row: Row, id: number) => row.window.messages.find((message) => message.messageId === id && !message.isUser);
const delta = (row: Row, evidence: string) => `DELTA q=${row.key} value=${row.value === "true" || row.value === "false" ? row.value : `"${row.value}"`} evidence="${evidence}"`;
const MARCH = "The road gradually ascends as they move farther from Aegis City";

describe("T3-1: deep_set_out stalled 6 turns on the player's own line (journal.jsonl:585, :607)", () => {
  it("the 10 recorded rejections replay as recorded: the first answer is still refused, the location reading beside it is unchanged", async () => {
    expect(t3.map((row) => row.journalLine)).toEqual([274, 319, 348, 360, 386, 481, 502, 543, 556, 577]);
    for (const row of t3) {
      const out = await replay(T3_QUALITIES, row, row.rawResponse, () => "NO_DELTA");
      expect({ line: row.journalLine, accepted: out.accepted, rejected: out.rejected })
        .toEqual({ line: row.journalLine, accepted: row.recordedAccepted, rejected: [PLAYER_ONLY_EVIDENCE] });
    }
  });

  it("every one of them is re-asked once, for that quality only, with its rejected line and the player's lines marked", async () => {
    for (const row of t3) {
      const out = await replay(T3_QUALITIES, row, row.rawResponse, () => "NO_DELTA");
      expect(out.calls).toBe(2);
      expect(out.reask?.keys).toEqual([row.key]);
      expect(out.reaskPrompt).toContain(PLAYER_ONLY_REASK);
      expect(out.reaskPrompt).toContain(row.evidence);
      expect(out.reaskPrompt).toContain(" (player): ");
      expect(out.reaskPrompt).not.toMatch(/^- location:/m);
      expect(out.reaskPrompt).not.toContain("FACT importance=");
    }
  });

  it("the three windows holding the narrator's four-day march (msg 18) confirm the set-out from the narrator's quote, attributed to msg 18", async () => {
    const marching = t3.filter((row) => narrator(row, 18)?.text.includes(MARCH));
    expect(marching.map((row) => row.journalLine)).toEqual([543, 556, 577]);
    for (const row of marching) {
      const out = await replay(T3_QUALITIES, row, row.rawResponse, () => delta(row, MARCH));
      expect(out.accepted).toContain("deep_set_out=true@18");
      expect(out.reask?.accepted).toEqual(["deep_set_out"]);
    }
  });

  it("DeepSeek's habit, re-quoting the player's line, still confirms nothing in any window", async () => {
    for (const row of t3) {
      const out = await replay(T3_QUALITIES, row, row.rawResponse, () => delta(row, row.evidence));
      expect(out.accepted.filter((entry) => entry.startsWith("deep_set_out"))).toEqual([]);
      expect(new Set(out.rejected)).toEqual(new Set([PLAYER_ONLY_EVIDENCE]));
    }
  });

  it("a world quote from before the player's line, or another value, is not a confirmation", async () => {
    const row = t3.find((candidate) => candidate.journalLine === 577)!;
    const before = narrator(row, 9)!.text.match(/He simply turned and walked toward the Guild's exit/)![0];
    expect(said(row)).toBe(14);
    expect((await replay(T3_QUALITIES, row, row.rawResponse, () => delta(row, before))).rejected).toEqual([PLAYER_ONLY_EVIDENCE, NOT_CONFIRMED]);
    const other = await replay(T3_QUALITIES, row, row.rawResponse, () => `DELTA q=deep_set_out value=false evidence="${MARCH}"`);
    expect(other.accepted.filter((entry) => entry.startsWith("deep_set_out"))).toEqual([]);
    expect(other.rejected).toEqual([PLAYER_ONLY_EVIDENCE, NOT_CONFIRMED]);
  });
});

describe("controls: the recorded true rejections of T1-5 and T2-1 gain no accept", () => {
  const rows = [...(earlier.t1_5 as unknown as EarlierRow[]).filter((row) => row.key !== "location" || row.value === "night_kelger_falls"),
    (earlier.t2_1 as unknown as EarlierRow[]).find((row) => row.value === "behind_the_seals")!];

  it("the fog, the castle, the misread falls and the seal stay rejected when the re-ask re-quotes the player or answers NO_DELTA", async () => {
    expect(rows).toHaveLength(9);
    for (const row of rows) {
      for (const answer of [delta(row, row.evidence), "NO_DELTA"]) {
        const out = await replay([row.quality], row, delta(row, row.evidence), () => answer);
        expect({ line: row.journalLine, accepted: out.accepted }).toEqual({ line: row.journalLine, accepted: [] });
        expect(out.rejected[0]).toBe(PLAYER_ONLY_EVIDENCE);
      }
    }
  });

  it("a player line with no reply after it in the window is never re-asked", async () => {
    const row = (earlier.t2_1 as unknown as EarlierRow[]).find((candidate) => candidate.value === "javon_study")!;
    const line = row.window.messages.find((message) => message.isUser && message.text.includes("Father's study"))!;
    const cut = { ...row, window: { ...row.window, to: line.messageId, messages: row.window.messages.filter((message) => message.messageId <= line.messageId) } };
    const out = await replay([row.quality], cut, delta(row, row.evidence), () => { throw new Error("re-asked"); });
    expect(out).toMatchObject({ calls: 1, accepted: [], rejected: [PLAYER_ONLY_EVIDENCE], reask: null });
  });
});
