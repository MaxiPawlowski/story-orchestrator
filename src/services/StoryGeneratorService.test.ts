import { StoryGeneratorService } from "@services/StoryGeneratorService";
import { getCharacters, getContext } from "@services/STAPI";

jest.mock("@services/STAPI", () => ({
  getContext: jest.fn(),
  getCharacters: jest.fn(),
}));

const getContextMock = getContext as jest.MockedFunction<typeof getContext>;
const getCharactersMock = getCharacters as jest.MockedFunction<typeof getCharacters>;
const expectedPhaseOrder = [
  "roadmap:start",
  "roadmap:done",
  "checkpoint:start",
  "checkpoint:done",
  "transitions:start",
  "transitions:done",
  "actions:start",
  "actions:done",
];

describe("StoryGeneratorService", () => {
  beforeEach(() => {
    getCharactersMock.mockReset();
    getContextMock.mockReset();
  });

  it("parses seed generation outputs into the opening checkpoint shape", async () => {
    const generateRaw = jest.fn()
      .mockResolvedValueOnce("  A tense mystery unfolds around the harbor.  ")
      .mockResolvedValueOnce('{"name":"  Harbor Arrival  ","objective":"  Meet the contact.  ","roles":{}}')
      .mockResolvedValueOnce('{"transitions":[{"trigger":{"patterns":[],"condition":""}},{"to_id":"cp-clue","label":" Follow clue ","trigger":{"patterns":[" /clue/i "],"condition":" Investigate the clue "}}]}')
      .mockResolvedValueOnce('{"authors_note":{"guide":{"text":" Stay wary. ","position":"sideways","interval":0,"depth":-2,"role":"gm"}},"talk_control":{"replies":[{"memberId":"guide","trigger":"invalid","probability":150,"maxTriggers":0,"content":{"kind":"static","text":"  "}}]}}');
    getContextMock.mockReturnValue({ generateRaw, chat: [] } as any);

    const updates: string[] = [];
    const service = new StoryGeneratorService();
    service.setPhaseCallback((update) => {
      updates.push(`${update.phase}:${update.done ? "done" : "start"}`);
    });

    const result = await service.generateSeed({
      premise: "A smuggler mystery.",
      storyTitle: "Harbor Story",
      globalLorebook: "Story World",
      characters: [
        { name: "Captain Vale" },
        { name: "Mira Dawn" },
      ],
      worldInfo: [],
    });

    expect(result).toEqual({
      roadmap: "A tense mystery unfolds around the harbor.",
      roles: {
        captain_vale: "Captain Vale",
        mira_dawn: "Mira Dawn",
      },
      initialCheckpoint: {
        id: "cp-seed",
        name: "Harbor Arrival",
        objective: "Meet the contact.",
        authors_note: {
          guide: {
            text: "Stay wary.",
            position: "chat",
            interval: 3,
            depth: 4,
            role: "system",
          },
        },
        transitions: [
          {
            id: "t-cp-seed-to-cp-gen-1",
            to: "cp-gen-1",
            trigger: {
              type: "regex",
              patterns: ["/\\bcontinue\\b/i"],
              condition: "Continue the story.",
            },
          },
          {
            id: "t-cp-seed-to-cp-clue",
            to: "cp-clue",
            label: "Follow clue",
            trigger: {
              type: "regex",
              patterns: ["/clue/i"],
              condition: "Investigate the clue",
            },
          },
        ],
        talk_control: [
          {
            memberId: "guide",
            speakerId: "",
            enabled: true,
            trigger: "onEnter",
            probability: 100,
            content: {
              kind: "static",
              text: "...",
            },
          },
        ],
      },
    });
    expect(updates).toEqual(expectedPhaseOrder);
    expect(Object.keys(result.initialCheckpoint)).toEqual(["id", "name", "objective", "authors_note", "transitions", "talk_control"]);
    expect(generateRaw).toHaveBeenCalledTimes(4);
  });

  it("parses expansion outputs with roadmap fallback and checkpoint defaults", async () => {
    const generateRaw = jest.fn()
      .mockResolvedValueOnce("   ")
      .mockResolvedValueOnce('{"name":"   ","objective":"   "}')
      .mockResolvedValueOnce('{"transitions":[{"to_id":"cp-branch","label":" Branch out ","trigger":{"patterns":[],"condition":""}}]}')
      .mockResolvedValueOnce('{"authors_note":{"scout":{"text":"  Watch the ridge.  ","position":"before","interval":2,"depth":1,"role":"assistant"}},"talkControl":{"replies":[{"memberId":"scout","trigger":"afterSpeak","probability":-5,"maxTriggers":2,"content":{"kind":"llm","instruction":"  Signal the next move.  "}}]}}');
    getContextMock.mockReturnValue({
      generateRaw,
      chat: [
        { name: "Player", mes: "We follow the lantern.", is_user: true },
        { name: "Scout", mes: "The ridge is clear.", is_user: false },
      ],
    } as any);

    const phases: string[] = [];
    const service = new StoryGeneratorService();
    const result = await service.expandCheckpoint({
      premise: "A mountain pursuit.",
      roadmap: "Existing roadmap",
      transitionLabel: "Climb",
      transitionCondition: "Scale the ridge",
      targetCheckpointId: "cp-ridge",
      targetCheckpointName: "Ridge",
      pastCheckpoints: [{ name: "Camp", objective: "Prepare", status: "complete" }],
      characters: [{ name: "Scout", description: "A patient guide" }],
      worldInfo: ["Cold winds"],
      existingCheckpointIds: ["cp-seed", "cp-ridge"],
      existingTransitionIds: ["t-old"],
    }, (update) => {
      phases.push(`${update.phase}:${update.done ? "done" : "start"}`);
    });

    expect(result).toEqual({
      roadmap: "Existing roadmap",
      checkpoint: {
        id: "cp-ridge",
        name: "Unnamed Beat",
        objective: "Continue the story.",
        authors_note: {
          scout: {
            text: "Watch the ridge.",
            position: "before",
            interval: 2,
            depth: 1,
            role: "assistant",
          },
        },
        transitions: [
          {
            id: "t-cp-ridge-to-cp-branch",
            to: "cp-branch",
            label: "Branch out",
            trigger: {
              type: "regex",
              patterns: ["/\\bcontinue\\b/i"],
              condition: "Continue the story.",
            },
          },
        ],
        talk_control: [
          {
            memberId: "scout",
            speakerId: "",
            enabled: true,
            trigger: "afterSpeak",
            probability: 0,
            maxTriggers: 2,
            content: {
              kind: "llm",
              instruction: "Signal the next move.",
            },
          },
        ],
      },
    });
    expect(generateRaw.mock.calls[1][0].prompt).toContain('Checkpoint ID must be exactly: "cp-ridge"');
    expect(phases).toEqual(expectedPhaseOrder);
    expect(Object.keys(result.checkpoint)).toEqual(["id", "name", "objective", "authors_note", "transitions", "talk_control"]);
  });

  it("builds character and world info summaries from host data", () => {
    getCharactersMock.mockReturnValue([
      { name: "  Arin  ", description: "  A sharp scout with a long history that should still trim cleanly.  " },
      { name: "Mira" },
      { name: "" },
    ] as any);
    getContextMock.mockReturnValue({
      worldInfo: {
        first: { comment: "  Harbor rules  ", disable: false },
        second: { comment: "Ignore me", disable: true },
        third: { comment: "   ", disable: false },
      },
    } as any);

    expect(StoryGeneratorService.buildCharacterSummaries()).toEqual([
      { name: "Arin", description: "A sharp scout with a long history that should still trim cleanly." },
      { name: "Mira", description: undefined },
    ]);
    expect(StoryGeneratorService.buildWorldInfoSummaries()).toEqual(["Harbor rules"]);
  });
});
