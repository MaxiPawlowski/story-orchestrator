/** @jest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useStoryLibrary, type StoryLibraryHook } from "@hooks/useStoryLibrary";
import {
  SAVED_KEY_PREFIX,
  loadStudioState,
  persistStudioState,
  generateStoryId,
  toSavedEntries,
  type StudioState,
} from "@utils/story-library";

jest.mock("@utils/story-library", () => ({
  SAVED_KEY_PREFIX: "saved:",
  loadStudioState: jest.fn(),
  persistStudioState: jest.fn(),
  generateStoryId: jest.fn(),
  toSavedEntries: jest.fn(),
}));

const loadStudioStateMock = loadStudioState as jest.MockedFunction<typeof loadStudioState>;
const persistStudioStateMock = persistStudioState as jest.MockedFunction<typeof persistStudioState>;
const generateStoryIdMock = generateStoryId as jest.MockedFunction<typeof generateStoryId>;
const toSavedEntriesMock = toSavedEntries as jest.MockedFunction<typeof toSavedEntries>;

function createStory(title: string) {
  return { title, checkpoints: [], transitions: [] } as any;
}

function renderHook() {
  const container = document.createElement("div");
  const root: Root = createRoot(container);
  const state: { current: StoryLibraryHook | null } = { current: null };

  function Probe() {
    state.current = useStoryLibrary();
    return null;
  }

  act(() => {
    root.render(createElement(Probe));
  });

  return {
    get current() {
      if (!state.current) throw new Error("Hook state unavailable");
      return state.current;
    },
    rerender() {
      act(() => {
        root.render(createElement(Probe));
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
    },
  };
}

describe("useStoryLibrary", () => {
  let studioState: StudioState;
  const originalActEnv = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;

  beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = originalActEnv;
  });

  beforeEach(() => {
    studioState = {
      stories: [],
      lastSelectedKey: null,
    };

    loadStudioStateMock.mockImplementation(() => ({
      stories: [...studioState.stories],
      lastSelectedKey: studioState.lastSelectedKey,
    }));

    persistStudioStateMock.mockImplementation((next) => {
      studioState = {
        stories: [...next.stories],
        lastSelectedKey: next.lastSelectedKey,
      };
    });

    generateStoryIdMock.mockReset();
    generateStoryIdMock.mockImplementation((used) => {
      const candidate = "generated-1";
      used.add(candidate);
      return candidate;
    });

    toSavedEntriesMock.mockImplementation((stories) => stories.map((entry) => ({
      key: `${SAVED_KEY_PREFIX}${entry.id}`,
      kind: "saved",
      label: entry.name,
      ok: true,
      story: entry.story as any,
      meta: { id: entry.id, name: entry.name, updatedAt: entry.updatedAt },
    })));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("auto-selects fallback entry when last selection is missing", () => {
    studioState = {
      stories: [{ id: "a", name: "Story A", story: createStory("A"), updatedAt: 1 }],
      lastSelectedKey: null,
    };

    const hook = renderHook();

    expect(hook.current.selectedKey).toBe("saved:a");
    expect(hook.current.selectedEntry?.key).toBe("saved:a");
    expect(persistStudioStateMock).toHaveBeenCalled();
    hook.unmount();
  });

  it("saves new story and selects generated key", async () => {
    const hook = renderHook();
    let result: Awaited<ReturnType<StoryLibraryHook["saveStory"]>> | null = null;

    await act(async () => {
      result = await hook.current.saveStory(createStory("Quest"));
    });

    expect(result).toEqual({ ok: true, key: "saved:generated-1" });
    expect(hook.current.selectedKey).toBe("saved:generated-1");
    expect(studioState.stories).toHaveLength(1);
    expect(studioState.stories[0]?.name).toBe("Quest");
    hook.unmount();
  });

  it("deletes saved story and clears selection", async () => {
    studioState = {
      stories: [{ id: "a", name: "Story A", story: createStory("A"), updatedAt: 1 }],
      lastSelectedKey: "saved:a",
    };

    const hook = renderHook();
    let result: Awaited<ReturnType<StoryLibraryHook["deleteStory"]>> | null = null;

    await act(async () => {
      result = await hook.current.deleteStory("saved:a");
    });

    expect(result).toEqual({ ok: true });
    expect(studioState.stories).toHaveLength(0);
    expect(hook.current.selectedKey).toBeNull();
    hook.unmount();
  });

  it("reloadLibrary applies preferred key when it exists", async () => {
    studioState = {
      stories: [
        { id: "a", name: "Story A", story: createStory("A"), updatedAt: 1 },
        { id: "b", name: "Story B", story: createStory("B"), updatedAt: 2 },
      ],
      lastSelectedKey: "saved:a",
    };

    const hook = renderHook();

    await act(async () => {
      await hook.current.reloadLibrary("saved:b");
    });

    expect(hook.current.selectedKey).toBe("saved:b");
    expect(hook.current.selectedEntry?.key).toBe("saved:b");
    hook.unmount();
  });
});
