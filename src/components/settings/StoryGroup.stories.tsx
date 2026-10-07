import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import { StoryGroup } from "./StoryGroup";

const snapshot = (): RuntimeSnapshot =>
  ({
    storyId: null,
    storyIdentity: { id: null, pinned: false, drifted: false },
    library: [{ id: "sun-ruins", title: "The Quest for the Sun Ruins" }],
    validationErrors: [],
    ui: { authorView: false },
  }) as unknown as RuntimeSnapshot;

const fakeManager = (): RuntimeManager =>
  ({
    selectStory: fn(async () => undefined),
    importStory: fn(async () => true),
    restartStory: fn(async () => undefined),
    removeStory: fn(async () => true),
    getSnapshot: () => snapshot(),
  }) as unknown as RuntimeManager;

const meta: Meta<typeof StoryGroup> = {
  title: "Settings/StoryGroup",
  component: StoryGroup,
  args: { snapshot: snapshot(), busy: false, setBusy: fn(), importOpen: true },
};

export default meta;

type Story = StoryObj<typeof StoryGroup>;

export const ImportFieldsAreLabelled: Story = {
  args: { manager: fakeManager() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const text = canvas.getByLabelText("Import story (JSON)");
    await expect(text.tagName).toBe("TEXTAREA");
    const file = canvas.getByLabelText("Import story from a JSON file");
    await expect(file).toHaveAttribute("type", "file");
    await expect(canvas.getByRole("button", { name: "Import and load" })).toBeDisabled();
    await expect(canvasElement.querySelector("#so-no-chat")).toBeNull();
    await userEvent.type(text, "{{}");
    await userEvent.click(canvas.getByRole("button", { name: "Import and load" }));
    await expect(args.manager.importStory).toHaveBeenCalledWith("{}");
  },
};

const welcomeScreen = (notice: string): RuntimeSnapshot => ({ ...snapshot(), noChat: { notice } }) as unknown as RuntimeSnapshot;

export const NoChatOpenSavesToLibraryOnly: Story = {
  args: { manager: fakeManager(), snapshot: welcomeScreen("Saved “The Quest for the Sun Ruins” v3 to the library. Open a chat to play it.") },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector("#so-no-chat")?.textContent).toBe("Saved “The Quest for the Sun Ruins” v3 to the library. Open a chat to play it.");
    await expect(canvas.getByLabelText("Story for this chat")).toBeDisabled();
    await expect(canvas.queryByRole("button", { name: "Import and load" })).toBeNull();
    await userEvent.type(canvas.getByLabelText("Import story (JSON)"), "{{}");
    await userEvent.click(canvas.getByRole("button", { name: "Save to library" }));
    await expect(args.manager.importStory).toHaveBeenCalledWith("{}");
  },
};

export const ImportClosed: Story = {
  args: { manager: fakeManager(), importOpen: false },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByLabelText("Import story (JSON)")).toBeNull();
    await expect(canvasElement.querySelector("#so-entry-import")).toBeNull();
  },
};

const removedFromLibrary = (): RuntimeSnapshot =>
  ({
    ...snapshot(),
    storyId: "adolion-aegis",
    storyTitle: "Adolion Between the Roads",
    storyIdentity: { id: "adolion-aegis", pinned: true, drifted: false },
    ui: { authorView: true },
  }) as unknown as RuntimeSnapshot;

export const PinnedStoryRemovedFromLibrary: Story = {
  args: { manager: fakeManager(), snapshot: removedFromLibrary(), importOpen: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const select = canvas.getByLabelText("Story for this chat") as HTMLSelectElement;
    await expect(select.value).toBe("adolion-aegis");
    await expect(select.selectedOptions[0].textContent).toBe("Adolion Between the Roads (pinned copy, not in the library)");
    await expect(canvasElement.querySelector("#so-story-identity")?.textContent).toContain("It is no longer in the library");
    await expect(canvas.getByRole("button", { name: "Delete selected story from the library" })).toBeDisabled();
    const exportButton = canvas.getByRole("button", { name: "Export state" });
    await expect(exportButton.scrollWidth).toBeLessThanOrEqual(exportButton.clientWidth + 1);
  },
};
