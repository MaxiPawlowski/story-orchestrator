import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { SettingsSearch } from "./SettingsSearch";
import "./workspace.css";

const meta: Meta<typeof SettingsSearch> = {
  title: "Workspace/SettingsSearch", component: SettingsSearch,
  decorators: [(Story) => <div id="so-workspace-modal" style={{ display: "flex", padding: "1rem", minHeight: "20rem" }}><Story /></div>],
  args: { authorView: false, onPick: fn() },
};
export default meta;
type Story = StoryObj<typeof SettingsSearch>;

export const FindsAFeatureControlAndJumps: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const box = canvas.getByRole("searchbox", { name: "Search all settings" });
    await userEvent.type(box, "read every");
    await expect(await canvas.findByText("Settings › Features › Story reading › Read every … replies")).toBeInTheDocument();
    await userEvent.type(box, "{Enter}");
    await expect(args.onPick).toHaveBeenCalledWith({ intent: { context: "orchestrator", page: "features", feature: "reading", control: "so-feature-reading-cadence" } });
    await expect(box).toHaveValue("");
  },
};

export const FindsADeviceRowAndAJudgeUse: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const box = canvas.getByRole("searchbox", { name: "Search all settings" });
    await userEvent.type(box, "this device notes");
    await expect(await canvas.findByRole("button", { name: /Notes under messages on this device/ })).toBeInTheDocument();
    await userEvent.clear(box);
    await userEvent.type(box, "nothing like this exists");
    await expect(await canvas.findByText(/Nothing matches/)).toBeInTheDocument();
  },
};
