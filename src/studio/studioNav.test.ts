import type { Story } from "@engine/index";
import { navLinks, pageForLabel, sectionLabel, STUDIO_TAB_IDS, studioNav } from "./studioNav";
import { diagnosticTarget } from "./diagnosticTarget";
import { qualityLabelOf, readableGateText } from "./gateLabels";

const roster = [{ id: "guide", name: "Arin" }, { id: "clerk" }];

describe("Studio sidebar (v3.0 29 WP-S1)", () => {
  it("groups every page once, single-page groups as one link, one link per cast member after Roster", () => {
    const groups = studioNav(STUDIO_TAB_IDS, roster, 3);
    expect(groups.map((group) => group.label)).toEqual(["Story", "Flow", "State", "Characters", "World", "Presentation", "Features", "Assistant", "Validation"]);
    expect(groups.find((group) => group.label === "Characters")?.links.map((link) => link.label)).toEqual(["Roster", "Arin", "clerk", "Sprites"]);
    expect(groups.find((group) => group.label === "Validation")?.links).toEqual([expect.objectContaining({ elementId: "so-studio-tab-diagnostics", badge: 3 })]);
    const tabs = navLinks(groups).filter((link) => !link.page.member).map((link) => link.page.tab);
    expect([...tabs].sort()).toEqual([...STUDIO_TAB_IDS].sort());
    expect(studioNav(STUDIO_TAB_IDS.filter((tab) => tab !== "copilot"), []).some((group) => group.label === "Assistant")).toBe(false);
  });

  it("names the page for the mobile select", () => {
    const groups = studioNav(STUDIO_TAB_IDS, roster);
    expect(sectionLabel(groups, { tab: "graph" })).toBe("Flow · Graph");
    expect(sectionLabel(groups, { tab: "story" })).toBe("Story");
    expect(sectionLabel(groups, { tab: "roster", member: "guide" })).toBe("Characters · Arin");
  });

  it("keeps the old tab labels as aliases for the harness", () => {
    expect(pageForLabel("Roster")).toEqual({ tab: "roster" });
    expect(pageForLabel("Characters")).toEqual({ tab: "roster" });
    expect(pageForLabel("Diagnostics")).toEqual({ tab: "diagnostics" });
    expect(pageForLabel("Validation")).toEqual({ tab: "diagnostics" });
    expect(pageForLabel("Wizard")).toEqual({ tab: "copilot" });
    expect(pageForLabel("Story features")).toEqual({ tab: "features" });
    expect(pageForLabel("Arin", roster)).toEqual({ tab: "roster", member: "guide" });
    expect(pageForLabel("Nowhere", roster)).toBeNull();
  });
});

describe("validation Go to (v3.0 29 WP-S6)", () => {
  const draft: Pick<Story, "checkpoints" | "transitions" | "roster" | "qualities"> = {
    checkpoints: [{ id: "start", name: "Start", objective: "", type: "anchor", start: true }, { id: "cache", name: "Cache", objective: "", type: "anchor" }],
    transitions: [{ from: "start", to: "cache", priority: 0, gate: { all: [] } }],
    roster,
    qualities: [{ key: "trust", type: "int", source: "extractor", rubric: "" }],
  };

  it("maps a diagnostic path to the editor and section that holds it", () => {
    expect(diagnosticTarget(draft, "checkpoints.1.talk_control.lead")).toEqual({ tab: "checkpoints", checkpointId: "cache", section: "cast" });
    expect(diagnosticTarget(draft, "checkpoints.cache.effects.npc_replies.0")).toEqual({ tab: "checkpoints", checkpointId: "cache", section: "effects" });
    expect(diagnosticTarget(draft, "checkpoints.0")).toEqual({ tab: "checkpoints", checkpointId: "start", section: "basics" });
    expect(diagnosticTarget(draft, "checkpoints.9.offers")).toEqual({ tab: "checkpoints" });
    expect(diagnosticTarget(draft, "transitions.0.gate")).toEqual({ tab: "transitions", transitionIndex: 0 });
    expect(diagnosticTarget(draft, "roster.0.cues.1")).toEqual({ tab: "roster", member: "guide" });
    expect(diagnosticTarget(draft, "qualities.0")).toEqual({ tab: "qualities" });
    expect(diagnosticTarget(draft, "widgets.2.where")).toEqual({ tab: "game" });
    expect(diagnosticTarget(draft, "house_rules")).toEqual({ tab: "rules" });
    expect(diagnosticTarget(draft, "unknown_root")).toBeNull();
  });
});

describe("readable gate labels (v3.0 29 WP-S2)", () => {
  it("names qualities by their display label and reads operators as words", () => {
    const label = qualityLabelOf([{ key: "trust", display: { label: "Guide's trust" } }, { key: "mood" }]);
    expect(readableGateText({ all: [{ q: "trust", op: ">=", v: 2 }, { q: "rel_arin_player_fear", op: "<", v: 1 }] }, label)).toBe("Guide's trust ≥ 2 and rel arin player fear < 1");
    expect(readableGateText({ any: [{ q: "mood", op: "==", v: "calm" }, { not: { q: "mood", op: "in", v: ["angry", "sad"] } }] }, label))
      .toBe("mood is calm or (not (mood is one of angry, sad))");
  });
});
