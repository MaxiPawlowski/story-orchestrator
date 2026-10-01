import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, waitFor, within } from "@storybook/test";
import type { RuntimeManager } from "@runtime/index";
import { PLAYER_COPY } from "@runtime/narrative";
import { setGlobalSettings } from "@runtime/settingsStore";
import type { RuntimeSnapshot } from "@runtime/types";
import ImageChatPanel from "../../image/ImageChatPanel";

const snapshot = (): RuntimeSnapshot => ({ storyId: "sun-ruins", ready: true, imageStory: { checkpoints: true, scenes: false } }) as unknown as RuntimeSnapshot;

const fakeManager = (): RuntimeManager =>
  ({
    getSnapshot: snapshot,
    getStory: () => null,
    getEngineState: () => null,
    ownsImageChat: () => false,
    subscribe: () => () => {},
    onBoundary: () => () => {},
    onSceneBreakConfirmed: () => () => {},
    onRollback: () => () => {},
    onEpochChanged: () => () => {},
  }) as unknown as RuntimeManager;

const meta: Meta<typeof ImageChatPanel> = {
  title: "Drawer/ImageChatPanel",
  component: ImageChatPanel,
  args: { manager: fakeManager(), snapshot: snapshot() },
};

export default meta;

type Story = StoryObj<typeof ImageChatPanel>;

export const PausesThisChat: Story = {
  beforeEach: () => {
    setGlobalSettings({ image: { enabled: true, automation: { mode: "story", everyN: 5 } } });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/This story requests art at each new turn in the story\./)).toBeInTheDocument();
    await expect(canvas.getByRole("status")).toHaveTextContent(PLAYER_COPY.imageNoJobs);
    await expect(canvas.queryByRole("alert")).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Stop images" })).toBeNull();
    const pause = canvas.getByRole("checkbox", { name: "Pause automatic images in this chat" });
    await expect(pause).not.toBeChecked();
    await userEvent.click(pause);
    await waitFor(() => expect(pause).toBeChecked());
    await userEvent.click(pause);
    await waitFor(() => expect(pause).not.toBeChecked());
  },
};

export const InstallOff: Story = {
  beforeEach: () => {
    setGlobalSettings({ image: { enabled: false } });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(new RegExp(PLAYER_COPY.imageInstallOff))).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Illustrate scene" })).toBeEnabled();
  },
};
