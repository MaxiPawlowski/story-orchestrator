import { CheckpointStatus } from "@utils/story-state";
import type { StoryContextValue } from "@components/context/StoryContext";
import type { StoryDraft } from "@utils/checkpoint-studio";
import type { StoryLibraryEntry, SaveLibraryStoryResult, DeleteLibraryStoryResult } from "@utils/story-library";

export const mockDraft: StoryDraft = {
  title: "Sun Ruins",
  description: "Explore the ruins and recover the relic.",
  global_lorebook: "Lorebook Alpha",
  roles: {
    dm: "Narrator",
    companion: "Arin",
    scout: "Guide",
  },
  defaults: {
    author_note: {
      position: "chat",
      interval: 3,
      depth: 4,
      role: "system",
    },
    presets: {
      dm: { temp: 0.7 },
    },
  },
  start: "cp1",
  checkpoints: [
    {
      id: "cp1",
      name: "Arrival",
      objective: "Reach the gate.",
      automations: ["/bg ruins day", "/checkpoint list"],
      world_info: ["Ancient Gate"],
      authors_note: {
        dm: { text: "Set tone.", interval: 2, depth: 3, role: "system" },
      },
      preset_overrides: {
        dm: { temp: 0.8 },
      },
      transitions: [
        {
          id: "edge1",
          to: "cp2",
          label: "Open gate",
          description: "Advance when the gate opens.",
          trigger: {
            type: "regex",
            patterns: ["/open\\s+gate/i"],
            condition: "Player opens the gate",
          },
          _stableId: "stable-edge1",
        },
      ],
      talk_control: [
        {
          memberId: "companion",
          speakerId: "dm",
          enabled: true,
          trigger: "afterSpeak",
          probability: 100,
          maxTriggers: 2,
          content: { kind: "static", text: "I can read these runes." },
        },
      ],
    },
    {
      id: "cp2",
      name: "Chamber",
      objective: "Solve the seal.",
      world_info: ["Ruins Cache"],
      world_info_deactivate: ["Ancient Gate"],
    },
  ],
};

export const mockStoryContextValue: StoryContextValue = {
  validate: () => ({ ok: false, errors: ["Validation unavailable in story"] }),
  loading: false,
  story: null,
  title: mockDraft.title,
  libraryEntries: [
    { key: "story-1", label: "Sun Ruins", ok: true, kind: "saved", meta: { name: "Sun Ruins" } },
    { key: "story-2", label: "Lost Key", ok: true, kind: "saved", meta: { name: "Lost Key" } },
  ] as StoryLibraryEntry[],
  selectedLibraryKey: "story-1",
  selectedLibraryError: null,
  selectLibraryEntry: () => {},
  reloadLibrary: async () => {},
  saveLibraryStory: async (): Promise<SaveLibraryStoryResult> => ({ ok: true, key: "story-1" }),
  deleteLibraryStory: async (): Promise<DeleteLibraryStoryResult> => ({ ok: true }),
  checkpoints: [
    { id: "cp1", name: "Arrival", objective: "Reach the gate.", status: CheckpointStatus.Current },
    { id: "cp2", name: "Chamber", objective: "Solve the seal.", status: CheckpointStatus.Pending },
  ],
  checkpointIndex: 0,
  activeCheckpointKey: "cp1",
  activateCheckpoint: () => {},
  turnsSinceEval: 1,
  activeChatId: "chat-storybook",
  ready: true,
  requirementsReady: true,
  currentUserName: "Player",
  personaDefined: true,
  groupChatSelected: true,
  worldLoreEntriesPresent: true,
  worldLoreEntriesMissing: [],
  globalLoreBookPresent: true,
  globalLoreBookMissing: [],
  missingGroupMembers: [],
  onPersonaReload: () => {},
};

export const mockValidation = () => ({ ok: false as const, errors: ["Validation unavailable"] });

export const noop = () => {};
