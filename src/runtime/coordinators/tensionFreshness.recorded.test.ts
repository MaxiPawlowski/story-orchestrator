import { TENSION_CURRENT_KEY, type EngineState, type TensionLevel } from "@engine/index";
import type { ParsedDelta } from "@extraction/index";
import { levelToNumeric, numericToLevel, updateEma } from "@pacing/index";
import { renderSharedReadPrompt } from "@extraction/contract";
import { PacingCoordinator } from "./pacingCoordinator";
import type { TensionRuntimeState } from "../types";

const BEFORE = 0.38485012127499996;

const READINGS: Array<{ line: number; to: number; level: TensionLevel; source: number; recorded: number }> = [
  { line: 568, to: 29, level: "critical", source: 29, recorded: 0.49439508489249995 },
  { line: 615, to: 30, level: "critical", source: 29, recorded: 0.57107655942475 },
  { line: 627, to: 30, level: "critical", source: 29, recorded: 0.624753591597325 },
  { line: 692, to: 32, level: "critical", source: 29, recorded: 0.6623275141181275 },
  { line: 705, to: 32, level: "critical", source: 29, recorded: 0.6886292598826892 },
  { line: 742, to: 34, level: "critical", source: 29, recorded: 0.7070404819178824 },
  { line: 770, to: 35, level: "critical", source: 29, recorded: 0.7199283373425176 },
  { line: 820, to: 37, level: "tense", source: 35, recorded: 0.6539498361397623 },
  { line: 860, to: 38, level: "tense", source: 38, recorded: 0.6077648852978336 },
];

const delta = (reading: (typeof READINGS)[number]): ParsedDelta => ({
  delta: { q: TENSION_CURRENT_KEY, v: levelToNumeric(reading.level) },
  evidence: "recorded",
  rawLevel: reading.level,
  messageId: reading.source,
});

function harness() {
  let tension: TensionRuntimeState = { levels: [], smoothed: BEFORE, history: [] };
  const pacing = new PacingCoordinator({
    getStory: () => null,
    getState: () => ({ activeCheckpointId: "a" } as EngineState),
    getStateLog: () => [],
    getTensionTarget: () => undefined,
    getTension: () => tension,
    setTension: (next) => { tension = next; },
    getPacing: () => ({ alpha: 0.3, shapeOverride: null, hintEnabled: false }),
    hosts: { prompt: { setStoryExtensionPrompt: () => undefined, clearStoryExtensionPrompt: () => undefined } as never },
  });
  return pacing;
}

describe("T1-6: tension climbed to critical on one ultimatum at the shrine stones (journal.jsonl:568-860, flag at msg 35)", () => {
  it("control: one EMA step per read reproduces the recorded series, seven critical steps from the msg-29 line", () => {
    let smoothed = BEFORE;
    const series = READINGS.map((reading) => (smoothed = updateEma(smoothed, levelToNumeric(reading.level), 0.3)));
    series.forEach((value, index) => expect(value).toBeCloseTo(READINGS[index].recorded, 9));
    expect(numericToLevel(Math.max(...series))).toBe("critical");
  });

  it("samples a line only while it is among the newest messages, and once per window end", () => {
    const pacing = harness();
    const kept = READINGS.map((reading) => {
      const { accepted } = pacing.applyExtractorTension([delta(reading)], reading.to);
      return accepted.length ? accepted[0].delta.v as number : null;
    });
    expect(kept.map((value) => (value === null ? null : Number(value.toFixed(6))))).toEqual([0.494395, 0.571077, 0.571077, null, null, null, null, 0.549754, 0.534828]);
    const peak = Math.max(...kept.filter((value): value is number => value !== null));
    expect(numericToLevel(peak)).toBe("tense");
  });

  it("keeps the other deltas of a read whose tension line is stale", () => {
    const pacing = harness();
    const other: ParsedDelta = { delta: { q: "location", v: "esha_border" }, evidence: "x" };
    const { accepted, levels } = pacing.applyExtractorTension([delta(READINGS[3]), other], 32);
    expect(accepted).toEqual([other]);
    expect(levels).toEqual([]);
  });

  it("drops a read that answers for an older window end than one already sampled", () => {
    const pacing = harness();
    pacing.applyExtractorTension([delta({ ...READINGS[0], to: 40, source: 40 })], 40);
    expect(pacing.applyExtractorTension([delta({ ...READINGS[0], to: 39, source: 39 })], 39).accepted).toEqual([]);
  });

  it("asks the reader for the newest messages", () => {
    const prompt = renderSharedReadPrompt({
      storyTitle: "t", activeCheckpointId: "a", canonLite: "", window: { from: 0, to: 0, messages: [] },
      qualities: [{ key: TENSION_CURRENT_KEY, quality: { key: TENSION_CURRENT_KEY, type: "float", source: "extractor" } as never, hints: [] }],
    } as never);
    expect(prompt).toContain("Rate the tension as it stands in the newest 3 messages");
  });
});
