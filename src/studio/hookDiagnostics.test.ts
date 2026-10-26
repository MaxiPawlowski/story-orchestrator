import type { Story } from "@engine/index";
import { runDiagnostics } from "./diagnostics";
import { directsPlayer } from "./hookDiagnostics";

const OPENER = { trigger: "onEnter", member: "Narrator", kind: "scripted", new_chat_only: true, text: "The road opens." } as const;

const story = (replies: unknown[]): Story => ({
  title: "t", description: "", qualities: [{ key: "trust", type: "int", source: "extractor", rubric: "r" }],
  checkpoints: [
    { id: "start", name: "Start", objective: "", type: "intermediate", start: true, effects: { npc_replies: replies } },
    { id: "cache", name: "Cache", objective: "", type: "anchor" },
  ],
  transitions: [{ from: "start", to: "cache", priority: 0, gate: { all: [{ q: "trust", op: ">=", v: 1 }] } }],
  roster: [],
} as unknown as Story);

const codes = (draft: Story) => runDiagnostics(draft).map((entry) => entry.code).filter((code) => code === "opening-narrator-only" || code === "npc-reply-directs-player");

describe("v3.0 19 hook diagnostics", () => {
  it("an opener with no hook is pointed at the opening hook; a hook or an ask_player entering line clears it", () => {
    expect(codes(story([OPENER]))).toEqual(["opening-narrator-only"]);
    expect(codes(story([OPENER, { trigger: "onEnter", member: "Mara", kind: "llm", new_chat_only: true }]))).toEqual([]);
    expect(codes(story([OPENER, { trigger: "onEnter", member: "Mara", kind: "llm", ask_player: true }]))).toEqual([]);
    expect(codes(story([]))).toEqual([]);
  });

  it.each([
    "Ask what the player will do next.",
    "Ask {{user}} what they want to do.",
    "Ask: what will you do?",
    "The player feels afraid; Mara notices.",
  ])("flags an instruction that directs the player: %s", (text) => {
    expect(directsPlayer(text)).toBe(true);
  });

  it.each([
    "Ask {{user}} whether they saw the riders.",
    "Mara wants to know where the newcomer slept.",
    "Ask what happened at the ford.",
  ])("leaves an in-character question alone: %s", (text) => {
    expect(directsPlayer(text)).toBe(false);
  });
});
