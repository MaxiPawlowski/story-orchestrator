import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import type { RuntimeManager } from "@runtime/index";
import type { RuntimeSnapshot } from "@runtime/types";
import { InnerVoiceControls } from "./InnerVoiceControls";

const snapshot = (settings: Record<string, unknown> = {}): RuntimeSnapshot => ({ memory: { settings: { epistemicLedgerCapable: true, ...settings } } }) as unknown as RuntimeSnapshot;

const fakeManager = () => ({ setMemorySettings: fn() }) as unknown as RuntimeManager;

const meta: Meta<typeof InnerVoiceControls> = {
  title: "Settings/InnerVoiceControls",
  component: InnerVoiceControls,
  args: { snapshot: snapshot() },
};

export default meta;

type Story = StoryObj<typeof InnerVoiceControls>;

export const OffByDefault: Story = {
  args: { manager: fakeManager() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText(/Read characters' reasoning/)).not.toBeChecked();
    await expect(canvas.getByLabelText(/Prepare a private inner beat/)).not.toBeChecked();
    await expect(canvas.getByLabelText("Inner beats for")).toBeDisabled();
    await expect(canvasElement.querySelector("#so-inner-harvest-idle")).toBeNull();
  },
};

export const SwitchOn: Story = {
  args: { manager: fakeManager() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByLabelText(/Read characters' reasoning/));
    await expect(args.manager.setMemorySettings).toHaveBeenCalledWith({ harvestReasoning: true });
    await userEvent.click(canvas.getByLabelText(/Prepare a private inner beat/));
    await expect(args.manager.setMemorySettings).toHaveBeenLastCalledWith({ innerBeat: true });
  },
};

export const BeatOnPicksTheFanOut: Story = {
  args: { manager: fakeManager(), snapshot: snapshot({ innerBeat: true }) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const fanOut = canvas.getByLabelText("Inner beats for");
    await expect(fanOut).toBeEnabled();
    await expect(fanOut).toHaveValue("lead");
    await userEvent.selectOptions(fanOut, "top2");
    await expect(args.manager.setMemorySettings).toHaveBeenCalledWith({ innerFanOut: "top2" });
  },
};

export const HarvestWithoutKnowledgeTracking: Story = {
  args: { manager: fakeManager(), snapshot: snapshot({ harvestReasoning: true, epistemicLedgerCapable: false }) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-inner-harvest-idle")).toHaveTextContent("knowledge tracking is off");
  },
};
