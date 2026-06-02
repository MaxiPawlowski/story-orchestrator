import {
  type StoryDraft,
  draftToStoryInput,
  normalizedToDraft,
  removeCheckpointDraft,
  renameCheckpointDraftId,
  validateStudioDraft,
} from "@utils/checkpoint-studio";
import { parseAndNormalizeStory } from "@utils/story-validator";

const createDraft = (): StoryDraft => ({
  title: "Test Story",
  description: "",
  global_lorebook: "Lorebook",
  start: "cp-1",
  checkpoints: [
    {
      id: "cp-1",
      name: "Start",
      objective: "Begin",
      transitions: [
        {
          id: "edge-1",
          to: "cp-2",
          trigger: {
            type: "regex",
            patterns: ["/begin/i"],
            condition: "Move when the player begins.",
          },
          _stableId: "stable-edge-1",
        },
      ],
    },
    {
      id: "cp-2",
      name: "Next",
      objective: "Continue",
    },
  ],
});

describe("validateStudioDraft", () => {
  test("returns converted story and normalized story on success", () => {
    const result = validateStudioDraft(createDraft(), (input) => ({
      ok: true,
      story: parseAndNormalizeStory(input),
    }));

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected success");
    }
    expect(result.story.checkpoints).toHaveLength(2);
    expect(result.normalized.startId).toBe("cp-1");
    expect(result.diagnostics).toEqual([]);
  });

  test("reports conversion errors through shared diagnostics", () => {
    const draft = createDraft();
    draft.checkpoints[0].transitions = [
      {
        id: "edge-1",
        to: "cp-2",
        trigger: {
          type: "regex",
          patterns: [],
          condition: "",
        },
        _stableId: "stable-edge-1",
      },
    ];

    const validate = jest.fn((input: unknown) => ({ ok: true as const, story: parseAndNormalizeStory(input) }));
    const result = validateStudioDraft(draft, validate);

    expect(result).toEqual({
      ok: false,
      stage: "conversion",
      error: "Transition trigger is incomplete.",
      diagnostics: [{ ok: false, name: "Story data conversion", detail: "Transition trigger is incomplete." }],
    });
    expect(validate).not.toHaveBeenCalled();
  });

  test("reports validation errors through shared diagnostics", () => {
    const result = validateStudioDraft(createDraft(), () => ({
      ok: false,
      errors: ["title: bad", "checkpoints: bad"],
    }));

    expect(result).toEqual({
      ok: false,
      stage: "validation",
      error: "title: bad; checkpoints: bad",
      diagnostics: [{ ok: false, name: "Schema validation", detail: "title: bad; checkpoints: bad" }],
    });
  });
});

describe("checkpoint draft helpers", () => {
  test("round-trips pacing fields through normalized draft conversion", () => {
    const original = parseAndNormalizeStory({
      title: "Pacing Story",
      arc_template: "freytag",
      global_lorebook: "Lorebook",
      start: "cp-1",
      checkpoints: [
        {
          id: "cp-1",
          name: "Start",
          objective: "Begin",
          tension_target: 0.7,
          progress_override: 0.5,
          transitions: [
            {
              id: "edge-1",
              to: "cp-2",
              trigger: {
                type: "regex",
                patterns: ["/begin/i"],
                condition: "Move when the player begins.",
              },
            },
          ],
        },
        {
          id: "cp-2",
          name: "Next",
          objective: "Continue",
        },
      ],
    });

    const draft = normalizedToDraft(original);
    const reparsed = parseAndNormalizeStory(draftToStoryInput(draft));

    expect(draft.arc_template).toBe("freytag");
    expect(draft.checkpoints[0].tension_target).toBe(0.7);
    expect(draft.checkpoints[0].progress_override).toBe(0.5);
    expect(reparsed.arc_template).toBe("freytag");
    expect(reparsed.checkpoints[0]).toEqual(expect.objectContaining({
      tension_target: 0.7,
      progress_override: 0.5,
    }));
  });

  test("renameCheckpointDraftId updates start and transition targets", () => {
    const renamed = renameCheckpointDraftId(createDraft(), "cp-2", "cp-2b");

    expect(renamed.start).toBe("cp-1");
    expect(renamed.checkpoints[1].id).toBe("cp-2b");
    expect(renamed.checkpoints[0].transitions?.[0].to).toBe("cp-2b");
  });

  test("removeCheckpointDraft drops inbound transitions and updates selection", () => {
    const result = removeCheckpointDraft(createDraft(), "cp-2");

    expect(result.draft.start).toBe("cp-1");
    expect(result.nextSelection).toBe("cp-1");
    expect(result.draft.checkpoints).toHaveLength(1);
    expect(result.draft.checkpoints[0].transitions).toBeUndefined();
  });

  test("round-trips stories without pacing fields without adding them", () => {
    const original = parseAndNormalizeStory(draftToStoryInput(createDraft()));
    const reparsed = parseAndNormalizeStory(draftToStoryInput(normalizedToDraft(original)));

    expect(reparsed).toEqual(original);
    expect(reparsed.arc_template).toBeUndefined();
    expect(reparsed.checkpoints[0].tension_target).toBeUndefined();
    expect(reparsed.checkpoints[0].progress_override).toBeUndefined();
  });
});
