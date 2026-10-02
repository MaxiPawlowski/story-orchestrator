import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { FallbackProfileField } from "./FallbackProfileField";

const profiles = [
  { id: "deepseek", name: "deepseek 4.1 flash", model: "deepseek-flash" },
  { id: "artemis", name: "Story Orchestrator Memory RunPod" },
];

const meta: Meta<typeof FallbackProfileField> = {
  title: "Settings/FallbackProfileField",
  component: FallbackProfileField,
};

export default meta;

type Story = StoryObj<typeof FallbackProfileField>;

export const ChooseFallback: Story = {
  args: { value: null, primary: "deepseek", profiles, onChange: fn() },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const select = canvas.getByLabelText("Fallback when it is down");
    await expect(select).toHaveAttribute("id", "so-extraction-fallback");
    await expect(select).toBeEnabled();
    await expect(canvas.queryByRole("option", { name: /deepseek 4.1 flash/ })).toBeNull();
    await userEvent.selectOptions(select, "artemis");
    await expect(args.onChange).toHaveBeenCalledWith("artemis");
  },
};

export const ClearFallback: Story = {
  args: { value: "artemis", primary: "deepseek", profiles, onChange: fn() },
  play: async ({ canvasElement, args }) => {
    const select = within(canvasElement).getByLabelText("Fallback when it is down");
    await expect(select).toHaveValue("artemis");
    await userEvent.selectOptions(select, "");
    await expect(args.onChange).toHaveBeenCalledWith(null);
  },
};

export const NoMemoryModel: Story = {
  args: { value: null, primary: null, profiles, onChange: fn() },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText("Fallback when it is down")).toBeDisabled();
  },
};

export const MissingProfile: Story = {
  args: { value: "gone", primary: "deepseek", profiles, onChange: fn() },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("option", { name: "gone (no longer exists)" })).toBeInTheDocument();
  },
};
