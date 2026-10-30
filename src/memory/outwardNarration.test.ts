import { NARRATOR_HEADER, NARRATOR_OUTWARD_CLAUSE, memberAimsBlock, renderNarratorBlock } from "./innerRender";
import type { CastVoice, EpistemicEntry } from "./index";
import { sanitizeGlobalSettings } from "@runtime/settingsModel";

const voices: CastVoice[] = [
  { id: "dm", name: "DM", omniscient: true },
  { id: "kael", name: "Kael", motive: "hide the stolen ring", selfVoiced: true },
];

const hiding = { id: "h", subject: "Kael", tag: "hiding", hiddenFrom: "Lyria", content: "the theft", status: "active", source: "extractor", createdAt: 0 } as unknown as EpistemicEntry;

describe("v3.0 31 S1 outward narration clause", () => {
  test("the switch is off by default (prompt layout waits for its blind rating)", () => {
    expect(sanitizeGlobalSettings(undefined).memory.outwardNarration).toBe(false);
    expect(sanitizeGlobalSettings({ memory: { outwardNarration: true } }).memory.outwardNarration).toBe(true);
  });

  test("the clause text is pinned and static, so the prompt head does not move", () => {
    expect(NARRATOR_OUTWARD_CLAUSE).toBe("Narrate only what the player could see or hear: other characters' inner lives reach the prose through what they say, do and choose, never as "
      + "reported thoughts, explained motives or emotions named as fact, and no feeling owes a visible tell.");
    expect(NARRATOR_HEADER).toBe("What the cast privately holds (use this to foreshadow; reveal nothing a character conceals unless the scene reveals it):");
  });

  test("off: the narrator block is byte-identical to before", () => {
    expect(renderNarratorBlock([hiding], voices, "dm")).toBe(renderNarratorBlock([hiding], voices, "dm", undefined, false));
    expect(renderNarratorBlock([hiding], voices, "dm")).not.toContain(NARRATOR_OUTWARD_CLAUSE);
  });

  test("on: the narrator keeps every holding row and gets the clause once, last", () => {
    const off = renderNarratorBlock([hiding], voices, "dm");
    const on = renderNarratorBlock([hiding], voices, "dm", undefined, true);
    expect(on).toBe(`${off}\n\n${NARRATOR_OUTWARD_CLAUSE}`);
    expect(on.split(NARRATOR_OUTWARD_CLAUSE).length).toBe(2);
    expect(renderNarratorBlock([], [{ id: "dm", name: "DM", omniscient: true }], "dm", undefined, true)).toBe(NARRATOR_OUTWARD_CLAUSE);
  });

  test("a drafted member's own aims and private block are untouched: the inner voice does not change", () => {
    const member = memberAimsBlock(voices, "kael", "slip away", [hiding], "PRIVATE", undefined, true);
    expect(member).toBe(memberAimsBlock(voices, "kael", "slip away", [hiding], "PRIVATE", undefined, false));
    expect(member).not.toContain(NARRATOR_OUTWARD_CLAUSE);
    expect(memberAimsBlock(voices, "dm", "", [hiding], "", undefined, true).endsWith(NARRATOR_OUTWARD_CLAUSE)).toBe(true);
  });
});
