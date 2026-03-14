import { parseAndNormalizeStory, validateStoryShape } from "@utils/story-validator";

describe("story-validator phases", () => {
  it("normalizes supported checkpoint-local transitions and talk control", () => {
    const story = parseAndNormalizeStory({
      title: "Story",
      global_lorebook: "Lorebook",
      start: "intro",
      checkpoints: [
        {
          id: "intro",
          name: "Intro",
          objective: "Start here",
          world_info: ["Entry A"],
          transitions: [
            {
              id: "go-next",
              to: "next",
              trigger: {
                type: "regex",
                patterns: ["door", "/window/m"],
                condition: "door or window",
              },
            },
          ],
          talk_control: [
            {
              memberId: " Companion ",
              speakerId: " Guide ",
              trigger: "onEnter",
              probability: 50,
              content: { kind: "static", text: "  Welcome aboard  " },
            },
          ],
        },
        {
          id: "next",
          name: "Next",
          objective: "Continue",
        },
      ],
    });

    expect(story.startId).toBe("intro");
    expect(story.transitions).toHaveLength(1);
    expect(story.transitions[0].trigger.regexes).toHaveLength(2);
    expect(story.transitions[0].trigger.condition).toBe("door or window");
    expect(story.talkControl?.checkpoints.get("intro")?.replies[0]).toEqual(expect.objectContaining({
      memberId: "Companion",
      normalizedId: "companion",
      speakerId: "Guide",
      normalizedSpeakerId: "guide",
    }));
    expect(story.checkpoints[0].talkControl?.repliesByTrigger.get("onEnter")).toHaveLength(1);
  });

  it("rejects unsupported legacy story fields", () => {
    expect(() => validateStoryShape({
      title: "Legacy Story",
      global_lorebook: "Lorebook",
      start: "intro",
      checkpoints: [
        {
          id: "intro",
          name: "Intro",
          objective: "Start here",
          on_activate: {
            world_info: {
              activate: ["Entry A"],
              deactivate: [],
            },
          },
        },
      ],
      transitions: [
        {
          id: "go-next",
          from: "intro",
          to: "next",
          trigger: {
            type: "regex",
            patterns: ["door"],
            condition: "door",
          },
        },
      ],
      talkControl: {
        checkpoints: {
          intro: {
            replies: [],
          },
        },
      },
    })).toThrow();
  });

  it("preserves stub and expansion metadata on the normalized runtime contract", () => {
    const story = parseAndNormalizeStory({
      title: "Stub Story",
      global_lorebook: "Lorebook",
      _premise: "Premise",
      _roadmap: "Roadmap",
      checkpoints: [
        {
          id: "intro",
          name: "Intro",
          objective: "Start here",
          transitions: [
            {
              to: "future",
              trigger: {
                type: "regex",
                patterns: ["go"],
                condition: "go",
              },
            },
          ],
        },
        {
          id: "future",
          name: "Future",
          objective: "To be revealed...",
          _isStub: true,
          _stubName: "Future Beat",
        },
      ],
    });

    expect(story.expansion).toEqual({ premise: "Premise", roadmap: "Roadmap" });
    expect(story.checkpoints[1].stub).toEqual({ isStub: true, stubName: "Future Beat" });
  });
});
