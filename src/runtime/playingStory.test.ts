import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import EntryPoints from "../components/settings/EntryPoints";
import { createSaveHealth } from "./saveHealth";
import { playingLine, playingStory } from "./playingStory";
import type { RuntimeSnapshot } from "./types";

const library = [{ id: "sun-ruins", title: "The Quest for the Sun Ruins" }];

describe("T4-3: a chat whose story left the library still says what it plays", () => {
  it("reads the library title while the story is listed", () => {
    expect(playingStory({ storyId: "sun-ruins", storyTitle: "Pinned title", library } as never)).toEqual({ id: "sun-ruins", title: "The Quest for the Sun Ruins", inLibrary: true });
  });

  it("reads the pinned copy's title once the story was removed from the library", () => {
    const playing = playingStory({ storyId: "adolion-aegis", storyTitle: "Adolion Between the Roads", library } as never);
    expect(playing).toEqual({ id: "adolion-aegis", title: "Adolion Between the Roads", inLibrary: false });
    expect(playingLine(playing)).toBe('Playing "Adolion Between the Roads" from this chat\'s pinned copy. It is no longer in the library.');
  });

  it("says nothing is playing only when no story is", () => {
    expect(playingStory({ storyId: null, storyTitle: null, library } as never)).toBeNull();
    expect(playingLine(null)).toBe("No story is playing in this chat yet.");
  });

  it("the Continue card names the pinned story instead of 'no story'", () => {
    const snapshot = {
      storyId: "adolion-aegis",
      storyTitle: "Adolion Between the Roads",
      library,
      extraction: { settings: { enabled: true, profileId: "artemis" } },
      requirements: { ready: true, missingPersonas: [], missingMembers: [], missingLorebooks: [] },
      saveHealth: createSaveHealth(),
      ui: { authorView: false },
      copilot: { enabled: true },
    } as unknown as RuntimeSnapshot;
    const noop = () => undefined;
    const page = renderToStaticMarkup(createElement(EntryPoints, { snapshot, busy: false, importOpen: false, onToggleImport: noop, onNewStory: noop, onOpenStudio: noop, onOpenDrawer: noop, onRevealSetting: noop, onFixWithWizard: noop }));
    expect(page).toContain("Adolion Between the Roads");
    expect(page).not.toContain("No story is playing in this chat yet.");
  });
});
