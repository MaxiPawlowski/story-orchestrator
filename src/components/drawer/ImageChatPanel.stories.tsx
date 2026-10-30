import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, waitFor, within } from "@storybook/test";
import type { RuntimeManager } from "@runtime/index";
import { getGlobalSettings, setGlobalSettings } from "@runtime/settingsStore";
import type { RuntimeSnapshot } from "@runtime/types";
import ImageChatPanel, { IMAGE_QUICK_COPY } from "../../image/ImageChatPanel";
import ImageChatPrefs, { IMAGE_PREFS_COPY } from "../../image/ImageChatPrefs";

const snapshot = (): RuntimeSnapshot => ({ storyId: "sun-ruins", ready: true, imageStory: { checkpoints: true, scenes: false } }) as unknown as RuntimeSnapshot;

const fakeManager = (): RuntimeManager =>
  ({
    getSnapshot: snapshot,
    getStory: () => null,
    getEffectiveSettings: getGlobalSettings,
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

export const QuickActions: Story = {
  beforeEach: () => {
    setGlobalSettings({ image: { enabled: true, automation: { mode: "story", everyN: 5 } } });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("group", { name: IMAGE_QUICK_COPY.label })).toBeVisible();
    await expect(canvas.getByRole("button", { name: IMAGE_QUICK_COPY.scene })).toBeEnabled();
    await expect(canvas.queryByRole("button", { name: IMAGE_QUICK_COPY.stop })).toBeNull();
    await expect(canvas.queryByRole("alert")).toBeNull();
  },
};

export const InstallOff: Story = {
  beforeEach: () => {
    setGlobalSettings({ image: { enabled: false } });
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-image-quick")).toBeNull();
  },
};

export const ChatPrefs: Story = {
  render: (args) => <ImageChatPrefs manager={args.manager} snapshot={snapshot()} />,
  beforeEach: () => {
    setGlobalSettings({ image: { enabled: true, automation: { mode: "story", everyN: 5 } } });
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/This story requests art at each new turn in the story\./)).toBeInTheDocument();
    const pause = canvas.getByRole("switch", { name: IMAGE_PREFS_COPY.pause });
    await expect(pause).not.toBeChecked();
    await userEvent.click(pause);
    await waitFor(() => expect(pause).toBeChecked());
    await userEvent.click(pause);
    await waitFor(() => expect(pause).not.toBeChecked());
  },
};
