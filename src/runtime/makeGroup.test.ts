import { freeGroupName, makeGroupForStory, narratorOf, planMakeGroup, type MakeGroupDeps, type MakeGroupStory } from "./makeGroup";

const story = (overrides: Partial<MakeGroupStory> = {}): MakeGroupStory => ({
  title: "The Ruins",
  roster: [{ id: "narrator", name: "Ruins Narrator", view: "omniscient" }, { id: "mara", name: "Mara" }],
  ...overrides,
});

const install = { characterNames: ["Ruins Narrator", "Mara", "Ann"], groupNames: ["Tavern"] };

describe("v2.7 plan 03: make a group for a story (D4)", () => {
  it("a group of the story's own cast, named for the story", () => {
    expect(planMakeGroup({ story: story(), environment: install, character: "Ann" })).toMatchObject({ ok: true, name: "The Ruins", members: ["Ruins Narrator", "Mara"] });
  });

  it("required members join the cast; the solo character is not added to another story's cast", () => {
    const plan = planMakeGroup({ story: story({ requirements: { members: ["Ann"] } }), environment: install, character: "Bob" });
    expect(plan).toMatchObject({ ok: true, members: ["Ruins Narrator", "Mara", "Ann"] });
  });

  it("a story with no cast is a group of this character", () => {
    expect(planMakeGroup({ story: story({ roster: [] }), environment: install, character: "Ann" })).toMatchObject({ ok: true, members: ["Ann"] });
    expect(planMakeGroup({ story: story({ roster: [] }), environment: install, character: null })).toMatchObject({ ok: false, missing: [] });
  });

  it("a missing narrator card is named, and no partial group is planned", () => {
    const plan = planMakeGroup({ story: story(), environment: { ...install, characterNames: ["Mara"] }, character: "Ann" });
    expect(plan).toMatchObject({ ok: false, missing: ["Ruins Narrator"], narrator: "Ruins Narrator" });
    expect(plan.ok ? "" : plan.message).toContain("narrator card \"Ruins Narrator\"");
    expect(plan.ok ? "" : plan.message).toContain("Fix with wizard");
  });

  it("other missing cards are named too", () => {
    const plan = planMakeGroup({ story: story(), environment: { ...install, characterNames: ["Ruins Narrator"] }, character: "Ann" });
    expect(plan).toMatchObject({ ok: false, missing: ["Mara"], narrator: null });
  });

  it("never names a group over an existing one", () => {
    expect(freeGroupName("Tavern", ["Tavern", "Tavern (2)"])).toBe("Tavern (3)");
    expect(planMakeGroup({ story: story({ title: "Tavern" }), environment: install, character: null })).toMatchObject({ ok: true, name: "Tavern (2)" });
  });

  it("finds the narrator by view, role or id", () => {
    expect(narratorOf(story())).toBe("Ruins Narrator");
    expect(narratorOf({ title: "x", roster: [{ id: "dm", name: "DM", role: "the narrator" }] })).toBe("DM");
    expect(narratorOf({ title: "x", roster: [{ id: "mara", name: "Mara" }] })).toBeNull();
  });
});

describe("v2.7 plan 03: the player-confirmed, create-only flow", () => {
  const deps = (overrides: Partial<MakeGroupDeps> = {}) => {
    const calls: string[] = [];
    const base: MakeGroupDeps = {
      story: () => story(),
      environment: () => install,
      character: () => "Ann",
      confirm: jest.fn(async () => true),
      beginRun: () => ({ stillOwns: () => true }),
      createGroup: jest.fn(async (name: string) => { calls.push(`create ${name}`); return { id: "g9", name }; }),
      bind: jest.fn((groupId: string, storyId: string) => { calls.push(`bind ${groupId} ${storyId}`); }),
      open: jest.fn(async (groupId: string) => { calls.push(`open ${groupId}`); return { ok: true as const }; }),
      select: jest.fn(async (storyId: string) => { calls.push(`select ${storyId}`); return true; }),
      ...overrides,
    };
    return { deps: base, calls };
  };

  it("asks, creates, binds, opens, then plays the story in the new group", async () => {
    const h = deps();
    expect(await makeGroupForStory(h.deps, "ruins")).toMatchObject({ ok: true, group: "The Ruins" });
    expect(h.deps.confirm).toHaveBeenCalledWith(expect.stringContaining("\"Ruins Narrator\", \"Mara\""));
    expect(h.calls).toEqual(["create The Ruins", "bind g9 ruins", "open g9", "select ruins"]);
  });

  it("creates nothing when the player says no, or the chat changed while they decided", async () => {
    const no = deps({ confirm: jest.fn(async () => false) });
    expect(await makeGroupForStory(no.deps, "ruins")).toMatchObject({ ok: false, reason: "cancelled" });
    const moved = deps({ beginRun: () => ({ stillOwns: () => false }) });
    expect(await makeGroupForStory(moved.deps, "ruins")).toMatchObject({ ok: false, reason: "lapsed" });
    expect([...no.calls, ...moved.calls]).toEqual([]);
  });

  it("a missing narrator stops before the question", async () => {
    const h = deps({ environment: () => ({ ...install, characterNames: ["Mara"] }) });
    expect(await makeGroupForStory(h.deps, "ruins")).toMatchObject({ ok: false, reason: "missing", missing: ["Ruins Narrator"], narrator: "Ruins Narrator" });
    expect(h.deps.confirm).not.toHaveBeenCalled();
    expect(h.calls).toEqual([]);
  });

  it("an unknown story or a refused create reports and stops", async () => {
    expect(await makeGroupForStory(deps({ story: () => null }).deps, "gone")).toMatchObject({ ok: false, reason: "unknown-story" });
    const refused = deps({ createGroup: jest.fn(async () => { throw new Error("Creating the group failed: 500"); }) });
    expect(await makeGroupForStory(refused.deps, "ruins")).toMatchObject({ ok: false, reason: "failed", message: expect.stringContaining("could not be created") });
    expect(refused.deps.bind).not.toHaveBeenCalled();
    expect(refused.calls).toEqual([]);
  });

  it("a group that cannot be opened is reported, already bound", async () => {
    const h = deps({ open: jest.fn(async () => ({ ok: false as const, reason: "a chat is saving" })) });
    const outcome = await makeGroupForStory(h.deps, "ruins");
    expect(outcome).toMatchObject({ ok: false, reason: "failed" });
    expect(outcome.message).toContain("could not be opened");
    expect(h.deps.select).not.toHaveBeenCalled();
  });
});
