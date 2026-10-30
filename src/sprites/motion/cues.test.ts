import { budgetedCue, readTransitionSpec, stageCues, tensionShade, transitionPlay, type StageSignals } from "./cues";
import { MotionFeed } from "./feed";
import { stageMotion } from "./budget";

const base: StageSignals = {
  session: "chat-a", boundary: 4, checkpoint: "cp1", background: "inn.jpg", transition: null, tension: "calm",
  chapters: 0, chapterLabel: "Chapter 1", chapterTitle: "Arrival", chapterCards: true,
};
const at = (patch: Partial<StageSignals>): StageSignals => ({ ...base, ...patch });
const full = stageMotion({ effects: "full", hostReduced: false, osReduced: false, storyMotion: true });

describe("stage cues from engine state", () => {
  it("a forward checkpoint change with a new background crossfades it (dissolve by default); same background, nothing", () => {
    expect(stageCues(base, at({ boundary: 5, checkpoint: "cp2", background: "road.jpg" }))).toEqual([{ kind: "background", ms: 600 }]);
    expect(stageCues(base, at({ boundary: 5, checkpoint: "cp2" }))).toEqual([]);
  });

  it("authored kinds: fade, wipe and iris cover the stage and crossfade underneath; cut does neither", () => {
    expect(stageCues(base, at({ boundary: 5, checkpoint: "cp2", background: "road.jpg", transition: { kind: "fade", ms: 1200, color: "#fff" } }))).toEqual([
      { kind: "transition", play: { kind: "fade", ms: 1200, color: "#fff" } }, { kind: "background", ms: 600 }]);
    expect(stageCues(base, at({ boundary: 5, checkpoint: "cp2", transition: { kind: "iris" } }))).toEqual([{ kind: "transition", play: { kind: "iris", ms: 1000, color: "#000000" } }]);
    expect(stageCues(base, at({ boundary: 5, checkpoint: "cp2", background: "road.jpg", transition: { kind: "cut" } }))).toEqual([]);
  });

  it("presentation only: hydrate, a chat or story switch, the same boundary and a rollback produce no cue", () => {
    const moved = at({ boundary: 5, checkpoint: "cp2", background: "road.jpg", tension: "critical", chapters: 1 });
    expect(stageCues(null, moved)).toEqual([]);
    expect(stageCues(base, { ...moved, session: "chat-b" })).toEqual([]);
    expect(stageCues(base, { ...moved, boundary: 4 })).toEqual([]);
    expect(stageCues({ ...moved, boundary: 9 }, { ...base, boundary: 6 })).toEqual([]);
  });

  it("tension punches once when it crosses into critical or peak, not while it stays there", () => {
    expect(stageCues(at({ tension: "tense" }), at({ boundary: 5, tension: "critical" }))).toEqual([{ kind: "punch" }]);
    expect(stageCues(at({ tension: "calm" }), at({ boundary: 5, tension: "peak" }))).toEqual([{ kind: "punch" }]);
    expect(stageCues(at({ tension: "critical" }), at({ boundary: 5, tension: "peak" }))).toEqual([]);
    expect(stageCues(at({ tension: null }), at({ boundary: 5, tension: "critical" }))).toEqual([{ kind: "punch" }]);
  });

  it("a chapter seal shows the public chapter title, unless the story switches its chapter card off", () => {
    expect(stageCues(base, at({ boundary: 5, chapters: 1, chapterLabel: "Chapter 2", chapterTitle: "The Road" }))).toEqual([{ kind: "chapter", label: "Chapter 2", title: "The Road" }]);
    expect(stageCues(base, at({ boundary: 5, chapters: 1, chapterCards: false }))).toEqual([]);
  });

  it("the budget trims cues: reduced keeps a short crossfade and the card, drops covers; off drops everything", () => {
    const reduced = stageMotion({ effects: "full", hostReduced: true, osReduced: false, storyMotion: true });
    const off = stageMotion({ effects: "off", hostReduced: false, osReduced: false, storyMotion: true });
    const calm = stageMotion({ effects: "calm", hostReduced: false, osReduced: false, storyMotion: true });
    const cover = { kind: "transition", play: transitionPlay({ kind: "wipe" }) } as const;
    expect(budgetedCue(cover, full)).toEqual(cover);
    expect(budgetedCue(cover, reduced)).toBeNull();
    expect(budgetedCue({ kind: "background", ms: 600 }, reduced)).toEqual({ kind: "background", ms: 150 });
    expect(budgetedCue({ kind: "chapter", label: "", title: "x" }, reduced)).not.toBeNull();
    expect(budgetedCue({ kind: "punch" }, calm)).toEqual({ kind: "punch" });
    for (const cue of [cover, { kind: "background", ms: 600 } as const, { kind: "punch" } as const, { kind: "chapter", label: "", title: "x" } as const]) expect(budgetedCue(cue, off)).toBeNull();
  });

  it("the transition reader takes a kind or {kind, ms, color} and refuses anything else; colors are hex only", () => {
    expect(readTransitionSpec("wipe")).toEqual({ kind: "wipe" });
    expect(readTransitionSpec({ kind: "fade", ms: 800, color: "#123" })).toEqual({ kind: "fade", ms: 800, color: "#123" });
    expect(readTransitionSpec({ kind: "fade", color: "red;background:url(x)" })).toEqual({ kind: "fade" });
    expect(readTransitionSpec({ kind: "spin" })).toBeNull();
    expect(readTransitionSpec(undefined)).toBeNull();
  });

  it("the vignette darkens with tension", () => {
    expect(tensionShade("calm")).toBe(0);
    expect(tensionShade("tense")).toBeLessThan(tensionShade("critical"));
    expect(tensionShade(null)).toBe(0);
  });
});

describe("motion feed", () => {
  it("publishes a batch only when cues fire or the tension changes, and counts batches", () => {
    const feed = new MotionFeed();
    const heard: number[] = [];
    feed.subscribe(() => heard.push(feed.view().seq));
    feed.update(base);
    expect(feed.view()).toMatchObject({ seq: 0, tension: "calm" });
    feed.update(at({ boundary: 5 }));
    expect(heard).toEqual([0]);
    feed.update(at({ boundary: 6, checkpoint: "cp2", background: "road.jpg" }));
    expect(feed.view()).toMatchObject({ seq: 1, cues: [{ kind: "background", ms: 600 }] });
    feed.update(at({ boundary: 3, checkpoint: "cp1" }));
    expect(feed.view().seq).toBe(1);
  });
});
