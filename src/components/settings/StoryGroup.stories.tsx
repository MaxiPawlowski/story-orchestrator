import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import { StoryGroup } from "./StoryGroup";

const snapshot = (): RuntimeSnapshot =>
  ({
    storyId: null,
    storyIdentity: { id: null, playedVersion: null, libraryVersion: null, pinned: false, drifted: false },
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
    await userEvent.type(text, "{{}");
    await userEvent.click(canvas.getByRole("button", { name: "Import and load" }));
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
