import { BRIEFING_INTRO_HEADING, briefingParagraphs, composeBriefing, composeChapterBriefing, storyKind } from "./briefing";
import { parseStoryV2, parseStoryV2OrThrow } from "./validate";
import { BRIEFING_MAX_SECTIONS, BRIEFING_SECTION_MAX_CHARS, isValidationErrorList } from "./index";

const base = (extra: Record<string, unknown> = {}) => ({
  format: 2, id: "brief", title: "The Road", description: "AUTHOR ONLY: the twist is the mayor.",
  qualities: [], roster: [], transitions: [],
  checkpoints: [{ id: "start", name: "Start", objective: "o", type: "anchor", start: true }],
  ...extra,
});

const sections = (count: number) => Array.from({ length: count }, (_, index) => ({ heading: `H${index}`, text: `Text ${index}.` }));

const errorsOf = (json: unknown) => {
  const parsed = parseStoryV2(json);
  return isValidationErrorList(parsed) ? parsed.map((error) => `${error.path}: ${error.message}`) : [];
};

describe("v2.7 05 briefing format", () => {
  it("parses an authored briefing and keeps only what was written", () => {
    const story = parseStoryV2OrThrow(base({ briefing: { title: " The Road ", image: "road.jpg", tone: "Dark.", start_label: "Go", sections: [{ heading: "The world", text: "A road.\n\nA town." }] } }));
    expect(story.briefing).toEqual({ title: "The Road", image: "road.jpg", tone: "Dark.", start_label: "Go", sections: [{ heading: "The world", text: "A road.\n\nA town." }] });
  });

  it("refuses an empty, oversized, unknown-keyed or macro-carrying briefing", () => {
    expect(errorsOf(base({ briefing: { sections: [] } }))).toEqual(["briefing.sections: a briefing needs at least one section"]);
    expect(errorsOf(base({ briefing: { sections: sections(BRIEFING_MAX_SECTIONS + 1) } }))).toEqual([`briefing.sections: a briefing holds at most ${BRIEFING_MAX_SECTIONS} sections`]);
    expect(errorsOf(base({ briefing: { sections: [{ heading: "H", text: "x".repeat(BRIEFING_SECTION_MAX_CHARS + 1) }] } }))[0]).toMatch(/^briefing\.sections\.0\.text: is at most 1200 characters/);
    expect(errorsOf(base({ briefing: { sections: [{ heading: "H", text: "Hi {{user}}." }] } }))[0]).toMatch(/cannot hold a macro/);
    expect(errorsOf(base({ briefing: { sections: sections(1), subtitle: "x" } }))[0]).toMatch(/^briefing\.subtitle: unknown key/);
    expect(errorsOf(base({ briefing: { sections: [{ heading: "", text: "t" }] } }))).toEqual(["briefing.sections.0.heading: must not be empty"]);
    expect(errorsOf(base({ briefing: "Welcome" }))).toEqual(["briefing: briefing must be an object"]);
  });

  it("parses a chapter briefing with the same rules", () => {
    const chaptered = (briefing: unknown) => base({
      chapters: [{ id: "one", title: "One", briefing }, { id: "two", title: "Two" }],
      checkpoints: [{ id: "start", name: "Start", objective: "o", type: "anchor", start: true, chapter: "one" }, { id: "b", name: "B", objective: "o", type: "anchor", chapter: "two" }],
    });
    expect(parseStoryV2OrThrow(chaptered({ sections: sections(1) })).chapters?.[0].briefing).toEqual({ sections: [{ heading: "H0", text: "Text 0." }] });
    expect(errorsOf(chaptered({ sections: [] }))).toEqual(["chapters.0.briefing.sections: a briefing needs at least one section"]);
  });
});

describe("v2.7 05 briefing view", () => {
  it("shows the authored briefing with the title, the tone and the default start label", () => {
    const view = composeBriefing(parseStoryV2OrThrow(base({ player_intro: "Intro.", briefing: { sections: sections(2) } })));
    expect(view).toMatchObject({ title: "The Road", startLabel: "Begin", tone: null, image: null, source: "authored" });
    expect(view?.sections).toHaveLength(2);
  });

  it("falls back to player_intro directly, and never to the author's description", () => {
    expect(composeBriefing(parseStoryV2OrThrow(base({ player_intro: "You are a courier." })))).toMatchObject({
      source: "intro", sections: [{ heading: BRIEFING_INTRO_HEADING, text: "You are a courier." }],
    });
    const none = composeBriefing(parseStoryV2OrThrow(base()));
    expect(none).toBeNull();
    expect(JSON.stringify(composeBriefing(parseStoryV2OrThrow(base({ player_intro: "P." }))))).not.toContain("AUTHOR ONLY");
  });

  it("composes a chapter's own briefing under the chapter's player title", () => {
    const story = parseStoryV2OrThrow(base({
      chapters: [{ id: "one", title: "Act one", player_title: "The Gate", briefing: { sections: sections(1) } }, { id: "two", title: "Act two" }],
      checkpoints: [{ id: "start", name: "Start", objective: "o", type: "anchor", start: true, chapter: "one" }, { id: "b", name: "B", objective: "o", type: "anchor", chapter: "two" }],
    }));
    expect(composeChapterBriefing(story, "one")).toMatchObject({ title: "The Gate", chapterId: "one" });
    expect(composeChapterBriefing(story, "two")).toBeNull();
    expect(composeChapterBriefing(story, null)).toBeNull();
  });

  it("splits text into paragraphs on blank lines", () => {
    expect(briefingParagraphs("One.\nstill one.\n\n  Two.\n\n\n")).toEqual(["One.\nstill one.", "Two."]);
  });
});

describe("v2.7 05 saga vs act rule", () => {
  const chapters = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `act-${index}`, title: `Act ${index}` }));
  it("reads the authored kind, defaulting to story; the chapter count never decides it (2026-10-03)", () => {
    expect(storyKind({ kind: "saga", chapters: chapters(12) })).toBe("saga");
    expect(storyKind({ kind: "saga" })).toBe("saga");
    expect(storyKind({ chapters: chapters(3) } as { kind?: unknown })).toBe("story");
    expect(storyKind({ kind: "story", chapters: chapters(2) })).toBe("story");
    expect(storyKind({ kind: "epic" })).toBe("story");
    expect(storyKind({})).toBe("story");
    expect(storyKind(null)).toBe("story");
  });

  it("validates kind: saga or story, anything else refused", () => {
    const base = { format: 2, title: "T", description: "D", qualities: [], checkpoints: [{ id: "a", name: "A", objective: "o", type: "anchor", start: true }], transitions: [], roster: [] };
    expect(parseStoryV2OrThrow({ ...base, kind: "saga" }).kind).toBe("saga");
    expect(parseStoryV2OrThrow(base).kind).toBeUndefined();
    expect(parseStoryV2({ ...base, kind: "epic" })).toEqual([{ path: "kind", message: 'kind must be "saga" or "story"' }]);
  });
});
