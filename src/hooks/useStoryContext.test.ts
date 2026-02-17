import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

jest.mock("@components/context/StoryContext", () => {
  const React = require("react");
  return {
    __esModule: true,
    default: React.createContext(undefined),
  };
});

import StoryContext from "@components/context/StoryContext";
import { useStoryContext } from "@hooks/useStoryContext";

function HookConsumer({ onValue }: { onValue?: (value: unknown) => void }) {
  const value = useStoryContext();
  onValue?.(value);
  return null;
}

describe("useStoryContext", () => {
  it("throws outside StoryProvider", () => {
    expect(() => renderToStaticMarkup(createElement(HookConsumer))).toThrow(
      "useStoryContext must be used within a StoryProvider",
    );
  });

  it("returns context value inside provider", () => {
    let captured: unknown;
    const provided = {
      loading: false,
      story: null,
      title: undefined,
      libraryEntries: [],
      selectedLibraryKey: null,
      selectedLibraryError: null,
      selectLibraryEntry: jest.fn(),
      reloadLibrary: jest.fn(),
      saveLibraryStory: jest.fn(),
      deleteLibraryStory: jest.fn(),
      validate: jest.fn(),
      checkpoints: [],
      checkpointIndex: 0,
      activeCheckpointKey: null,
      activateCheckpoint: jest.fn(),
      turnsSinceEval: 0,
      activeChatId: null,
      ready: false,
      requirementsReady: false,
      currentUserName: "",
      personaDefined: false,
      groupChatSelected: false,
      worldLoreEntriesPresent: false,
      worldLoreEntriesMissing: [],
      globalLoreBookPresent: false,
      globalLoreBookMissing: [],
      missingGroupMembers: [],
      onPersonaReload: jest.fn(),
    };

    renderToStaticMarkup(
      createElement(
        StoryContext.Provider,
        { value: provided as any },
        createElement(HookConsumer, { onValue: (value) => { captured = value; } }),
      ),
    );

    expect(captured).toBe(provided);
  });
});
