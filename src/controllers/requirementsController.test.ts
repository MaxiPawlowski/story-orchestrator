import { createRequirementsController } from "@controllers/requirementsController";
import { getContext } from "@services/stHost/context";
import { getWorldInfoSettings } from "@services/stHost/worldInfo";
import { subscribeToEventSource } from "@utils/event-source";
import { resolveGroupMemberName } from "@utils/groups";
import { storySessionStore } from "@store/storySessionStore";

jest.mock("@services/stHost/context", () => ({
  getContext: jest.fn(),
}));

jest.mock("@services/stHost/worldInfo", () => ({
  getWorldInfoSettings: jest.fn(),
}));

jest.mock("@utils/event-source", () => ({
  subscribeToEventSource: jest.fn(),
}));

jest.mock("@utils/groups", () => ({
  resolveGroupMemberName: jest.fn(),
}));

jest.mock("@store/storySessionStore", () => ({
  storySessionStore: {
    getState: jest.fn(),
  },
}));

const getContextMock = getContext as jest.MockedFunction<typeof getContext>;
const getWorldInfoSettingsMock = getWorldInfoSettings as jest.MockedFunction<typeof getWorldInfoSettings>;
const subscribeToEventSourceMock = subscribeToEventSource as jest.MockedFunction<typeof subscribeToEventSource>;
const resolveGroupMemberNameMock = resolveGroupMemberName as jest.MockedFunction<typeof resolveGroupMemberName>;
const storeMock = storySessionStore as any;

describe("requirementsController", () => {
  beforeEach(() => {
    getContextMock.mockReset();
    getWorldInfoSettingsMock.mockReset();
    subscribeToEventSourceMock.mockReset();
    resolveGroupMemberNameMock.mockReset();
    storeMock.getState.mockReset();
  });

  it("evaluates required group members and world lore entries from story data", async () => {
    const setRequirementsState = jest.fn();
    storeMock.getState.mockReturnValue({ setRequirementsState });
    resolveGroupMemberNameMock.mockImplementation((member: any) => (member?.name ?? String(member)));
    getWorldInfoSettingsMock.mockReturnValue({
      world_info: {
        globalSelect: ["MainLore"],
      },
    } as any);
    getContextMock.mockReturnValue({
      groupId: "group-1",
      groups: [{ id: "group-1", members: [{ name: "Companion" }] }],
      name1: "Player",
      loadWorldInfo: jest.fn().mockResolvedValue({
        entries: {
          1: { comment: "Ancient Relic" },
        },
      }),
      eventSource: {},
      eventTypes: {
        WORLDINFO_UPDATED: "WORLDINFO_UPDATED",
        WORLDINFO_SETTINGS_UPDATED: "WORLDINFO_SETTINGS_UPDATED",
        WORLDINFO_ENTRIES_LOADED: "WORLDINFO_ENTRIES_LOADED",
        GROUP_UPDATED: "GROUP_UPDATED",
      },
    } as any);

    const controller = createRequirementsController();
    controller.setStory({
      title: "Story",
      description: "",
      startId: "cp-1",
      global_lorebook: "MainLore",
      roles: { companion: "Companion" },
      checkpoints: [
        {
          id: "cp-1",
          name: "Checkpoint 1",
          objective: "",
          world_info: {
            activate: ["Ancient Relic", "Hidden Sigil"],
            deactivate: [],
          },
        },
      ],
      transitions: [],
    } as any);
    controller.handleChatContextChanged();

    await Promise.resolve();

    const latest = setRequirementsState.mock.calls.at(-1)?.[0];
    expect(latest.groupChatSelected).toBe(true);
    expect(latest.missingGroupMembers).toEqual([]);
    expect(latest.worldLoreEntriesPresent).toBe(false);
    expect(latest.worldLoreEntriesMissing).toEqual(["Hidden Sigil"]);
    expect(latest.globalLoreBookPresent).toBe(true);
  });

  it("subscribes to world/group events on start and initializes persona/group state", () => {
    const setRequirementsState = jest.fn();
    storeMock.getState.mockReturnValue({ setRequirementsState });
    resolveGroupMemberNameMock.mockImplementation((member: any) => String(member));
    getWorldInfoSettingsMock.mockReturnValue({ world_info: { globalSelect: [] } } as any);
    subscribeToEventSourceMock.mockReturnValue(jest.fn());
    getContextMock.mockReturnValue({
      groupId: "group-1",
      groups: [{ id: "group-1", members: ["A"] }],
      name1: "Player",
      loadWorldInfo: jest.fn().mockResolvedValue({ entries: {} }),
      eventSource: {},
      eventTypes: {
        WORLDINFO_UPDATED: "WORLDINFO_UPDATED",
        WORLDINFO_SETTINGS_UPDATED: "WORLDINFO_SETTINGS_UPDATED",
        WORLDINFO_ENTRIES_LOADED: "WORLDINFO_ENTRIES_LOADED",
        GROUP_UPDATED: "GROUP_UPDATED",
      },
    } as any);

    const controller = createRequirementsController();
    controller.start();

    expect(subscribeToEventSourceMock).toHaveBeenCalledTimes(4);
    const latest = setRequirementsState.mock.calls.at(-1)?.[0];
    expect(latest.groupChatSelected).toBe(true);
    expect(latest.personaDefined).toBe(true);
    expect(latest.currentUserName).toBe("Player");
  });

  it("ignores stale loadWorldInfo results after chat context changes", async () => {
    const setRequirementsState = jest.fn();
    storeMock.getState.mockReturnValue({ setRequirementsState });
    getWorldInfoSettingsMock.mockReturnValue({
      world_info: {
        globalSelect: ["MainLore"],
      },
    } as any);

    let resolveFirst!: (value: unknown) => void;
    let resolveSecond!: (value: unknown) => void;
    const loadWorldInfo = jest.fn()
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirst = resolve;
      }))
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveSecond = resolve;
      }));

    const contextState: any = {
      chatId: "chat-1",
      groupId: "group-1",
      groups: [],
      name1: "Player",
      loadWorldInfo,
      eventSource: {},
      eventTypes: {},
    };
    getContextMock.mockImplementation(() => contextState);

    const controller = createRequirementsController();
    controller.setStory({
      title: "Story",
      description: "",
      startId: "cp-1",
      global_lorebook: "MainLore",
      roles: {},
      checkpoints: [
        {
          id: "cp-1",
          name: "Checkpoint 1",
          objective: "",
          world_info: {
            activate: ["Ancient Relic"],
            deactivate: [],
          },
        },
      ],
      transitions: [],
    } as any);

    contextState.chatId = "chat-2";
    controller.handleChatContextChanged();
    const callCountBeforeStaleResolve = setRequirementsState.mock.calls.length;

    resolveFirst({ entries: { 1: { comment: "Ancient Relic" } } });
    await Promise.resolve();

    expect(setRequirementsState.mock.calls).toHaveLength(callCountBeforeStaleResolve);

    resolveSecond({ entries: {} });
    await Promise.resolve();

    const latest = setRequirementsState.mock.calls.at(-1)?.[0];
    expect(latest.worldLoreEntriesPresent).toBe(false);
    expect(latest.worldLoreEntriesMissing).toEqual(["Ancient Relic"]);
  });

  it("recomputes the active snapshot through one path for group toggle and persona reload", async () => {
    const setRequirementsState = jest.fn();
    storeMock.getState.mockReturnValue({ setRequirementsState });
    resolveGroupMemberNameMock.mockImplementation((member: any) => member?.name ?? String(member));
    getWorldInfoSettingsMock.mockReturnValue({
      world_info: {
        globalSelect: ["MainLore"],
      },
    } as any);

    const contextState: any = {
      chatId: "chat-1",
      groupId: null,
      groups: [{ id: "group-1", members: [{ name: "Companion" }] }],
      name1: "",
      loadWorldInfo: jest.fn().mockResolvedValue({
        entries: {
          1: { comment: "Ancient Relic" },
        },
      }),
      eventSource: {},
      eventTypes: {},
    };
    getContextMock.mockImplementation(() => contextState);

    const controller = createRequirementsController();
    controller.setStory({
      title: "Story",
      description: "",
      startId: "cp-1",
      global_lorebook: "MainLore",
      roles: { companion: "Companion" },
      checkpoints: [
        {
          id: "cp-1",
          name: "Checkpoint 1",
          objective: "",
          world_info: {
            activate: ["Ancient Relic"],
            deactivate: [],
          },
        },
      ],
      transitions: [],
    } as any);
    await Promise.resolve();

    let latest = setRequirementsState.mock.calls.at(-1)?.[0];
    expect(latest.groupChatSelected).toBe(false);
    expect(latest.personaDefined).toBe(false);
    expect(latest.requirementsReady).toBe(false);

    contextState.groupId = "group-1";
    contextState.name1 = "Player";
    controller.handleChatContextChanged();
    await Promise.resolve();

    latest = setRequirementsState.mock.calls.at(-1)?.[0];
    expect(latest.groupChatSelected).toBe(true);
    expect(latest.personaDefined).toBe(true);
    expect(latest.missingGroupMembers).toEqual([]);
    expect(latest.requirementsReady).toBe(true);

    contextState.name1 = "Reloaded Player";
    await controller.reloadPersona();
    await Promise.resolve();

    latest = setRequirementsState.mock.calls.at(-1)?.[0];
    expect(latest.currentUserName).toBe("Reloaded Player");
    expect(latest.requirementsReady).toBe(true);
  });
});
