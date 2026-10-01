import { ApplyQueue, type ApplyQueueEntry } from "./applyQueue";
import { Blackboard } from "./blackboard";
import { parseStoryV2OrThrow } from "./validate";

const story = parseStoryV2OrThrow({
  format: 2,
  title: "T1-6 location",
  description: "",
  qualities: [
    { key: "location", type: "enum", values: ["esha_border", "esha_road_in", "esha_castle_hall"], source: "extractor", rubric: "Where is the party?" },
    { key: "tension_current", type: "float", source: "extractor", rubric: "Tension" },
  ],
  checkpoints: [{ id: "a", name: "A", objective: "", type: "anchor", start: true }],
  transitions: [],
  roster: [],
});

const read = (origin: string, from: number, to: number, location: string, tension: number): ApplyQueueEntry => ({
  source: "extractor", origin, blackboardVersionSum: 0, turnRange: { from, to },
  deltas: [{ q: "location", v: location }, { q: "tension_current", v: tension }],
});

const RECORDED_ORDER = [
  read("6e148455", 31, 38, "esha_road_in", 0.6077648852978336),
  read("2f441e8b", 33, 40, "esha_road_in", 0.5754354197084834),
  read("6138ab5e", 33, 40, "esha_castle_hall", 0.5528047937959384),
  read("228c60a6", 31, 39, "esha_road_in", 0.5369633556571568),
];

describe("T1-6: boundary 29 applied the msg-40 read, then the late msg-39 read over it (journal.jsonl boundary 29)", () => {
  it("keeps the reading of the newest window when a read of an older window is queued after it", () => {
    const queue = new ApplyQueue();
    RECORDED_ORDER.forEach((entry) => queue.enqueue(entry));
    const blackboard = new Blackboard(story);
    const result = queue.drainAtBoundary(blackboard);
    expect(blackboard.get("location")).toBe("esha_castle_hall");
    expect(blackboard.get("tension_current")).toBe(0.5528047937959384);
    expect(result.applied.map((entry) => entry.origin)).toEqual(["6138ab5e"]);
    expect(result.discarded.map((entry) => entry.origin)).toEqual(["6e148455", "2f441e8b", "228c60a6"]);
  });

  it("control: reads queued in window order still apply in order, the last one winning", () => {
    const queue = new ApplyQueue();
    [read("x", 31, 39, "esha_road_in", 0.5), read("y", 32, 40, "esha_castle_hall", 0.4)].forEach((entry) => queue.enqueue(entry));
    const blackboard = new Blackboard(story);
    const result = queue.drainAtBoundary(blackboard);
    expect(blackboard.get("location")).toBe("esha_castle_hall");
    expect(result.applied.map((entry) => entry.origin)).toEqual(["x", "y"]);
  });
});
