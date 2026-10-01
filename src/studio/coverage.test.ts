import { AGENT_TOOLS } from "../copilot/agent/tools";
import { coverageGaps, renderCoverage, storyCoverage } from "./coverage";
import { newStoryDraft, type StoryDraft } from "./draft";

const covered = (): StoryDraft => ({
  ...newStoryDraft(),
  player_intro: "You carry a parcel.",
  illustrations: { checkpoints: true },
  arc_template: "rising",
  arc_bridges: [{ arcMatch: "debt", anchor: "start", amount: 1 }],
  requirements: { members: ["Mara"] },
  stagecraft: { lorebooks: ["Courier Lore"] },
  scene_read: { locations: ["harbour"] },
  lore_select: { lorebooks: ["Courier Lore"] },
  house_rules: ["No magic."],
  chapters: [{ id: "act1", title: "The Harbour" }],
  qualities: [{ key: "delivered", type: "bool", source: "extractor", rubric: "Handed over?" }],
  checkpoints: [{
    id: "start", name: "Start", objective: "Take it.", type: "anchor", start: true, tension_target: "calm", guidance: "slow", agency: { protect_player_choice: true },
    talk_control: { lead: "mara" }, effects: { background: { name: "harbour.jpg" }, author_note: { text: "x" }, world_info: { enable: ["a"] } }, motives: { mara: "see it delivered" },
  }],
  roster: [{ id: "mara", name: "Mara", role: "clerk", drive: "keep her post" }],
  transitions: [],
});

describe("coverage diagnostic (v2.6 plan 11 A3)", () => {
  it("names what an empty draft does not use yet, and what each would add", () => {
    const gaps = coverageGaps(storyCoverage(newStoryDraft()));
    expect(gaps.map((row) => row.id)).toEqual(expect.arrayContaining(["story.house_rules", "story.lore_select", "checkpoint.agency", "checkpoint.effects.background"]));
    expect(gaps.every((row) => row.adds.length > 0)).toBe(true);
    expect(renderCoverage(storyCoverage(newStoryDraft()))).toContain("- checkpoint.agency (0/1; missing: start)");
  });

  it("is quiet when every field is in use", () => {
    expect(coverageGaps(storyCoverage(covered()))).toEqual([]);
    expect(renderCoverage(storyCoverage(covered()))).toBe("Every field this story model offers is in use.");
  });

  it("points every gap it can act on at a tool the agent actually has", () => {
    const tools = storyCoverage(newStoryDraft()).map((row) => row.tool).filter((tool): tool is string => tool !== null);
    expect(tools.filter((tool) => !AGENT_TOOLS[tool])).toEqual([]);
  });
});
