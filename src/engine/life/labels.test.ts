import { readFileSync } from "fs";
import { join } from "path";
import { StoryEngine, type BoundaryLogEntry } from "../engine";
import type { BlackboardDelta } from "../blackboard";
import { parseStoryV2, parseStoryV2OrThrow } from "../validate";
import { labelShownKey, relationshipKey, revealKey, type NormalizedStoryV2, type PrimitiveValue } from "../schema";
import { privateLifeLines, relationshipFeelings } from "./lines";
import { holderLabelRows, labelDiscoveryUnits, labelLatches, shownLabel } from "./labels";
import { SAME_BEAT_BOUNDARIES, axisHistory, holdSameBeat, sameBeat } from "./beats";

const RAW = JSON.parse(readFileSync(join(process.cwd(), "test/fixtures/relationship-labels.story.json"), "utf8")) as Record<string, unknown>;
const STORY = parseStoryV2OrThrow(RAW);
type Roster = Array<Record<string, unknown>>;

const run = (story: NormalizedStoryV2, turns: Array<Record<string, PrimitiveValue>>) => {
  const engine = new StoryEngine({ now: () => 0 });
  engine.loadStory(story);
  turns.forEach((deltas, at) => {
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: Object.entries(deltas).map(([q, v]) => ({ q, v, source: "extractor" as const })), turnRange: { from: at * 2, to: at * 2 + 1 } });
    engine.commitBoundary({ lastMessageId: at * 2 + 1, chatLength: at * 2 + 2 });
  });
  return engine;
};

const withRelationship = (member: string, patch: Record<string, unknown>, index = 0) => ({
  ...RAW,
  roster: (RAW.roster as Roster).map((entry) => (entry.id === member
    ? { ...entry, relationships: (entry.relationships as Roster).map((relationship, at) => (at === index ? { ...relationship, ...patch } : relationship)) } : entry)),
});

const errorsOf = (raw: Record<string, unknown>) => {
  const parsed = parseStoryV2(raw);
  return Array.isArray(parsed) ? parsed.map((error) => `${error.path}: ${error.message}`) : [];
};

const is = (q: string) => ({ q, op: "==", v: true });

describe("v2.8 plan 51: label validation", () => {
  it("compiles one latching reveal key per secret and hold keys only for a held relationship", () => {
    const key = STORY.qualityByKey[revealKey("mara", "player", "loyal")];
    expect(key).toMatchObject({ type: "int", source: "code", latching: true, monotonic: true });
    expect(Object.keys(STORY.qualityByKey).filter((entry) => entry.startsWith("life_reveal_"))).toHaveLength(7);
    expect(STORY.qualityByKey[labelShownKey("tom", "player")]).toBeDefined();
    expect(STORY.qualityByKey[labelShownKey("mara", "player")]).toBeUndefined();
  });

  it.each([
    ["a public gate on a feeling without follows_feeling", withRelationship("mara", { public: [{ label: "warm", when: { q: "rel_mara_player_trust", op: ">=", v: 2 } }] }), "follows the hidden feeling"],
    ["hold without follows_feeling", withRelationship("mara", { public: [{ label: "warm", when: is("shared_meal"), hold: 2 }] }), "hold is for a label"],
    ["a secret known at the start", withRelationship("mara", { secret: [{ id: "x", label: "hidden", revealed_when: { q: "rel_mara_player_trust", op: "==", v: 0 } }] }), "before anything happens"],
    ["a secret equal to a public label", withRelationship("mara", { secret: [{ id: "x", label: "Wary", revealed_when: is("saw_letter") }] }), "must differ"],
    ["an unknown key", withRelationship("mara", { public: [{ label: "warm", colour: "red" }] }), "colour"],
    ["a long label", withRelationship("mara", { public: [{ label: "x".repeat(41) }] }), "at most 40"],
    ["a macro in a label", withRelationship("mara", { public: [{ label: "{{user}}'s friend" }] }), "plain text"],
    ["five secrets", withRelationship("mara", { secret: [1, 2, 3, 4, 5].map((at) => ({ id: `s${at}`, label: `s${at}`, revealed_when: is("saw_letter") })) }), "at most 4"],
    ["an undeclared gate quality", withRelationship("mara", { secret: [{ id: "x", label: "hidden", revealed_when: is("nope") }] }), "nope"],
    ["a secret without a gate", withRelationship("mara", { secret: [{ id: "x", label: "hidden" }] }), "needs revealed_when"],
    ["a duplicate secret id", withRelationship("mara", { secret: [{ id: "x", label: "a", revealed_when: is("saw_letter") }, { id: "x", label: "b", revealed_when: is("paid_debt") }] }), "duplicate"],
  ])("refuses %s", (_name, raw, message) => {
    expect(errorsOf(raw).join("\n")).toContain(message);
  });

  it("accepts the lab story", () => {
    expect(errorsOf(RAW)).toEqual([]);
  });
});

describe("v2.8 plan 51: public labels and reveal latches", () => {
  const mara = STORY.life?.members.find((member) => member.id === "mara")?.relationships[0];
  if (!mara) throw new Error("fixture");

  it("shows the last public row whose gate holds", () => {
    expect(shownLabel("mara", mara, {})).toBe("wary");
    expect(shownLabel("mara", mara, { shared_meal: true })).toBe("warming to you");
  });

  it("latches a reveal at the boundary its gate first holds and never un-reveals it", () => {
    const engine = run(STORY, [{}, { saw_letter: true }, { saw_letter: false }]);
    expect(engine.serialize().blackboard.values[revealKey("mara", "player", "loyal")]).toBe(2);
    expect(engine.stateLog.at(-1)?.after.blackboard.values[revealKey("mara", "player", "loyal")]).toBe(2);
  });

  it("holds a feeling-band label until its gate has held for hold boundaries", () => {
    const key = relationshipKey("tom", "player", "trust");
    const engine = run(STORY, [{ [key]: 3 }, { [key]: 2 }, { [key]: 3 }, { [key]: 3 }, { [key]: 3 }]);
    const shown = engine.stateLog.map((entry: BoundaryLogEntry) => entry.after.blackboard.values[labelShownKey("tom", "player")]);
    expect(shown).toEqual([0, 0, 0, 1, 1]);
  });

  it("writes nothing new on a second latch pass in the same boundary", () => {
    const values = { ...run(STORY, [{ saw_letter: true, [relationshipKey("tom", "player", "trust")]: 3 }]).serialize().blackboard.values };
    const view = { boundary: 1, values };
    labelLatches(STORY, view).forEach((write) => { values[write.q] = write.v; });
    expect(labelLatches(STORY, { boundary: 1, values })).toEqual([]);
  });

  it("offers unrevealed reveal and public gate keys to discovery, never feeling keys, and drops a revealed one", () => {
    const before = labelDiscoveryUnits(STORY, {}).facts.flat();
    expect(before).toEqual(expect.arrayContaining(["saw_letter", "paid_debt", "overheard", "found_ring", "heard_rumor", "met_sera", "shared_meal"]));
    expect(before.some((key) => key.startsWith("rel_"))).toBe(false);
    const after = labelDiscoveryUnits(STORY, { [revealKey("mara", "player", "debt")]: 3 }).facts;
    expect(after.some((unit) => unit.length === 1 && unit[0] === "paid_debt")).toBe(false);
  });
});

describe("v2.8 plan 51: the holder's private line", () => {
  it("names the holder's labels and whether the player learned each secret; other members and the warden get nothing new", () => {
    const hidden = privateLifeLines(STORY, {}, "mara");
    expect(hidden).toContain("(shown as: wary; secretly: secretly loyal to you, which others have not learned; owes you a debt, which others have not learned)");
    const learned = privateLifeLines(STORY, { [revealKey("mara", "player", "loyal")]: 2 }, "mara");
    expect(learned).toContain("secretly loyal to you, which the player now knows");
    expect(privateLifeLines(STORY, {}, "narrator")).not.toMatch(/loyal|debt|envies/);
    expect(relationshipFeelings(STORY, {}, "mara").join("\n")).not.toMatch(/shown as|secretly/);
  });

  it("R5: a story without labels sends the same private block as before labels existed", () => {
    const stripped = parseStoryV2OrThrow({ ...RAW, codex: undefined, roster: (RAW.roster as Roster).map((member) => ({
      ...member, ...(member.relationships ? { relationships: (member.relationships as Roster).map(({ public: _p, secret: _s, ...relationship }) => relationship) } : {}),
    })) });
    const labelled = privateLifeLines(STORY, {}, "mara").replace(/ \(shown as: [^)]*\)| \(secretly: [^)]*\)/g, "");
    expect(privateLifeLines(stripped, {}, "mara")).toBe(labelled.replace(/ \(shown as: rivals; secretly: envies his post, which others have not learned\)/, ""));
    expect(privateLifeLines(stripped, {}, "mara")).not.toMatch(/shown as|secretly/);
  });
});

describe("v2.8 plan 51 R6: directed, never mirrored", () => {
  it("changing A toward B labels never changes B toward A rows (200 random configurations)", () => {
    const known = new Set(["mara", "tom", "sera"]);
    let seed = 11;
    const next = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; };
    const baseline = holderLabelRows(STORY, {}, "tom", known, {});
    for (let at = 0; at < 200; at += 1) {
      const words = ["kind", "cold", "fond", "bitter", "close"].filter(() => next() < 0.5).map((label) => ({ label }));
      const changed = parseStoryV2OrThrow(withRelationship("mara", { public: words.length ? words : undefined, secret: next() < 0.5 ? undefined : [{ id: "z", label: "hides a key", revealed_when: is("found_ring") }] }, 1));
      expect(holderLabelRows(changed, { found_ring: true }, "tom", known, {}).map((row) => row.text)).toEqual(holderLabelRows(STORY, { found_ring: true }, "tom", known, {}).map((row) => row.text));
    }
    expect(baseline.map((row) => row.text)).toEqual(["Toward you: guarded"]);
  });
});

describe("v2.8 plan 51 H11a: a lingering mood moves a feeling once", () => {
  const key = relationshipKey("mara", "player", "trust");
  const reading = (evidence: string, v: PrimitiveValue = "up"): { delta: BlackboardDelta; evidence: string } => ({ delta: { q: key, v, source: "extractor" as const }, evidence });

  it("holds a step that repeats the last step's beat within the window, and lets a new event through", () => {
    const engine = new StoryEngine({ now: () => 0 });
    engine.loadStory(STORY);
    const lingering = "Mara is still smiling about the bread you shared";
    let moved = 0;
    const readings = [lingering, lingering, `${lingering}.`, lingering, lingering, lingering];
    readings.forEach((evidence, at) => {
      const kept = holdSameBeat(STORY, engine.stateLog, engine.pendingWrites, engine.serialize().boundary, [reading(evidence, at + 1)]);
      if (kept.accepted.length) {
        moved += 1;
        engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: kept.accepted.map((entry) => entry.delta), turnRange: { from: at * 2, to: at * 2 + 1 } });
      }
      engine.commitBoundary({ lastMessageId: at * 2 + 1, chatLength: at * 2 + 2 });
    });
    expect(moved).toBe(1);
    const fresh = holdSameBeat(STORY, engine.stateLog, engine.pendingWrites, engine.serialize().boundary, [reading("Mara thanks you for paying her debt")]);
    expect(fresh.accepted).toHaveLength(1);
    expect(fresh.accepted[0].delta.beat).toBe("Mara thanks you for paying her debt");
  });

  it("lets the same beat through again once the window has passed, and never touches a key without a step rule", () => {
    const engine = run(STORY, []);
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: key, v: 1, source: "extractor", beat: "the same smile" }], turnRange: { from: 0, to: 1 } });
    engine.commitBoundary({ lastMessageId: 1, chatLength: 2 });
    Array.from({ length: SAME_BEAT_BOUNDARIES + 1 }, (_, at) => engine.commitBoundary({ lastMessageId: 3 + at * 2, chatLength: 4 + at * 2 }));
    expect(holdSameBeat(STORY, engine.stateLog, [], engine.serialize().boundary, [reading("the same smile")]).accepted).toHaveLength(1);
    const plain = { delta: { q: "saw_letter", v: true, source: "extractor" as const }, evidence: "the same smile" };
    expect(holdSameBeat(STORY, engine.stateLog, [], 1, [plain]).accepted[0]).toBe(plain);
    expect(sameBeat("A short one", "a SHORT one!")).toBe(true);
    expect(sameBeat("short", "a longer line with short in it")).toBe(false);
  });

  it("H11b: lists each accepted step with its boundary, message and evidence", () => {
    const engine = run(STORY, []);
    engine.enqueue({ source: "extractor", blackboardVersionSum: 0, deltas: [{ q: key, v: 1, source: "extractor", beat: "she laughs", evidenceAt: 3 }], turnRange: { from: 0, to: 3 } });
    engine.commitBoundary({ lastMessageId: 3, chatLength: 4 });
    expect(axisHistory(STORY, engine.stateLog)[key]).toEqual([{ boundary: 1, messageId: 3, from: 0, to: 1, evidence: "she laughs" }]);
  });
});
