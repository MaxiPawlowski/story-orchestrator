import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import type { RuntimeManager } from "@runtime/runtimeManager";
import { getGlobalSettings, setGlobalSettings } from "@runtime/settingsStore";
import ImageGroup from "../../image/ImageGroup";

const fakeManager = (): RuntimeManager =>
  ({
    getSnapshot: () => ({ storyId: null, ready: false }),
    getStory: () => null,
    getEngineState: () => null,
    ownsImageChat: () => false,
    subscribe: () => () => {},
    onBoundary: () => () => {},
    onSceneBreakConfirmed: () => () => {},
    onRollback: () => () => {},
    onEpochChanged: () => () => {},
  }) as unknown as RuntimeManager;

const meta: Meta<typeof ImageGroup> = {
  title: "Settings/ImageGroup",
  component: ImageGroup,
  args: { manager: fakeManager() },
  beforeEach: () => {
    setGlobalSettings({ image: { enabled: true, automation: { mode: "manual", everyN: 5 } } });
  },
};

export default meta;

type Story = StoryObj<typeof ImageGroup>;

export const ChangesInstallSettings: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText("Image service"));
    const permit = canvas.getByRole("checkbox", { name: "Permit automatic illustrations on this install" });
    await expect(permit).toBeChecked();
    await userEvent.click(permit);
    await expect(permit).not.toBeChecked();
    await expect(getGlobalSettings().image.enabled).toBe(false);
    const mode = canvas.getByLabelText("Automation for all chats");
    await expect(mode).toHaveValue("manual");
    await expect(canvas.queryByRole("spinbutton", { name: "Every N replies" })).toBeNull();
    await userEvent.selectOptions(mode, "everyN");
    await expect(await canvas.findByRole("spinbutton", { name: "Every N replies" })).toHaveValue(5);
    await expect(getGlobalSettings().image.automation.mode).toBe("everyN");
  },
};

export const ListsTheChatCastForFallbackAppearance: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Arin")).toBeInTheDocument();
    await expect(canvas.getByText("Companion")).toBeInTheDocument();
    await expect(canvas.getByLabelText("Image-prompt model")).toHaveAttribute("id", "so-image-profile");
    await expect(canvas.getByLabelText("ComfyUI URL")).toHaveAttribute("placeholder", "http://127.0.0.1:8188");
  },
};
