import { parseMemoryLine, parseSceneBreakLine } from "./parse";

describe("parseMemoryLine", () => {
  it("parses a well-formed facts-tier line", () => {
    const result = parseMemoryLine('MEMORY type=fact importance=2 expiration=permanent text="Elara is a blacksmith." evidence="I forge steel for the guard."');
    expect(result.entry).toMatchObject({ tier: "facts", type: "fact", importance: 2, expiration: "permanent", text: "Elara is a blacksmith.", evidence: "I forge steel for the guard.", entities: [] });
  });

  it("parses a well-formed session-tier line", () => {
    const result = parseMemoryLine('MEMORY type=scene importance=1 expiration=scene text="Candlelit tavern, late evening." evidence="rain outside the tavern"');
    expect(result.entry).toMatchObject({ tier: "session_details", type: "scene", importance: 1, expiration: "scene" });
  });

  it("tolerates reordered fields", () => {
    const result = parseMemoryLine('MEMORY evidence="I trust you completely." expiration=permanent text="Mara trusts the player." importance=3 type=relationship');
    expect(result.entry).toMatchObject({ tier: "facts", type: "relationship", importance: 3, expiration: "permanent" });
  });

  it("parses optional entity and character fields", () => {
    const result = parseMemoryLine('MEMORY type=event importance=2 expiration=session entity="Kael,Elara" character="kael" text="Kael and Elara fought at the bridge." evidence="we fought side by side"');
    expect(result.entry).toMatchObject({ entities: ["Kael", "Elara"], characterId: "kael" });
  });

  it("rejects an unknown type", () => {
    const result = parseMemoryLine('MEMORY type=rumor importance=2 expiration=permanent text="something" evidence="quote"');
    expect(result.entry).toBeUndefined();
    expect(result.reason).toBe("unknown memory type");
  });

  it("rejects an invalid importance", () => {
    const result = parseMemoryLine('MEMORY type=fact importance=5 expiration=permanent text="a fact worth keeping" evidence="quote"');
    expect(result.reason).toBe("invalid importance");
  });

  it("rejects an invalid expiration", () => {
    const result = parseMemoryLine('MEMORY type=fact importance=2 expiration=forever text="a fact worth keeping" evidence="quote"');
    expect(result.reason).toBe("invalid expiration");
  });

  it("rejects missing evidence", () => {
    const result = parseMemoryLine('MEMORY type=fact importance=2 expiration=permanent text="a fact worth keeping"');
    expect(result.reason).toBe("missing evidence");
  });

  it("rejects content at/under the facts-tier minimum length", () => {
    const result = parseMemoryLine('MEMORY type=fact importance=2 expiration=permanent text="abc" evidence="quote"');
    expect(result.reason).toBe("content too short");
  });

  it("allows shorter content for session-tier types", () => {
    const result = parseMemoryLine('MEMORY type=detail importance=1 expiration=session text="abcd" evidence="quote"');
    expect(result.entry).toBeDefined();
  });

  it("returns not-a-memory-line for non-MEMORY input", () => {
    const result = parseMemoryLine("DELTA q=player_has_key value=true evidence=\"took it\"");
    expect(result.reason).toBe("not a memory line");
  });
});

describe("parseSceneBreakLine", () => {
  it("parses a confirmed scene break", () => {
    expect(parseSceneBreakLine("SCENE_BREAK at=12 reason=location")).toEqual({ at: 12, reason: "location" });
  });

  it("returns null for an explicit no-break", () => {
    expect(parseSceneBreakLine("SCENE_NONE")).toBeNull();
  });

  it("returns undefined for an unrecognized reason", () => {
    expect(parseSceneBreakLine("SCENE_BREAK at=3 reason=vibes")).toBeUndefined();
  });

  it("returns undefined for unrelated input", () => {
    expect(parseSceneBreakLine("NO_DELTA")).toBeUndefined();
  });
});
