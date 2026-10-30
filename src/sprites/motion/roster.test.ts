import { nextExpiry, spread, stagePhases, type Placed } from "./roster";

const key = (name: string) => name;

describe("stage roster phases", () => {
  it("the first cast stands without an entrance; a later arrival enters; layout matches the old spread", () => {
    const first = stagePhases<string>([], ["a", "b"], key, 0, 350);
    expect(first.map((entry) => [entry.key, entry.phase])).toEqual([["a", "stay"], ["b", "stay"]]);
    expect(first[0]).toMatchObject(spread(2, 0));
    const next = stagePhases(first, ["a", "b", "c"], key, 10, 350);
    expect(next.map((entry) => entry.phase)).toEqual(["stay", "stay", "enter"]);
    expect(next[1].left).toBeCloseTo(spread(3, 1).left);
    expect(stagePhases(next, ["a", "b", "c"], key, 20, 350)[2].phase).toBe("enter");
  });

  it("a leaver stays mounted at its last place until its exit ends, then drops; with no exit time it drops at once", () => {
    const first = stagePhases<string>([], ["a", "b"], key, 0, 350);
    const left = stagePhases(first, ["a"], key, 100, 350);
    expect(left.map((entry) => [entry.key, entry.phase])).toEqual([["a", "stay"], ["b", "exit"]]);
    expect(left[1]).toMatchObject({ left: first[1].left, width: first[1].width, until: 450 });
    expect(nextExpiry(left)).toBe(450);
    expect(stagePhases(left, ["a"], key, 300, 350).find((entry) => entry.key === "b")?.until).toBe(450);
    expect(stagePhases(left, ["a"], key, 450, 350).map((entry) => entry.key)).toEqual(["a"]);
    expect(stagePhases(first, ["a"], key, 100, 0).map((entry) => entry.key)).toEqual(["a"]);
  });

  it("a member who comes back while leaving enters again; an empty stage restarts the entrance rule", () => {
    const first = stagePhases<string>([], ["a", "b"], key, 0, 350);
    const leaving = stagePhases(first, ["a"], key, 100, 350);
    expect(stagePhases(leaving, ["a", "b"], key, 200, 350).find((entry) => entry.key === "b")?.phase).toBe("enter");
    const gone: Placed<string>[] = stagePhases(first, [], key, 0, 0);
    expect(gone).toEqual([]);
    expect(stagePhases(gone, ["c"], key, 0, 350)[0].phase).toBe("stay");
    expect(stagePhases(gone, ["c"], key, 0, 350, false)[0].phase).toBe("enter");
  });
});
