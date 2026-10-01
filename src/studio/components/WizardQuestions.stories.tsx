import type { Meta, StoryObj } from "@storybook/react";
import { within, userEvent, expect, fn } from "@storybook/test";
import WizardQuestions from "./WizardQuestions";

const meta: Meta<typeof WizardQuestions> = {
  title: "Studio/WizardQuestions",
  component: WizardQuestions,
  args: {
    onAnswer: fn(),
    onDismiss: fn(),
    summary: "Two calls would change the shape of this.",
    questions: [
      { id: "antagonist", text: "Who opposes the party?", why: "it decides the mid-story gates", options: ["a rival crew", "the ruins themselves"] },
      { id: "ending", text: "How should it end?" },
    ],
  },
};

export default meta;

type Story = StoryObj<typeof WizardQuestions>;

export const AnsweringWithChipsAndText: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "a rival crew" }));
    await expect(canvas.getByRole("button", { name: "a rival crew" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.type(canvas.getByLabelText("How should it end?"), "Ambiguously.");
    await userEvent.click(canvas.getByRole("button", { name: "Send answers" }));
    await expect(args.onAnswer).toHaveBeenCalledWith([
      { id: "antagonist", text: "a rival crew" },
      { id: "ending", text: "Ambiguously." },
    ]);
  },
};

export const BusyWhileTheWizardWorks: Story = {
  args: { busy: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const send = canvas.getByRole("button", { name: "Working…" });
    await expect(send).toBeDisabled();
    await expect(canvas.queryByRole("button", { name: "Send answers" })).toBeNull();
    await expect(canvas.getByRole("button", { name: "You decide" })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Dismiss" })).toBeEnabled();
    await userEvent.type(canvas.getByLabelText("How should it end?"), "Ambiguously.");
    await expect(canvas.getByLabelText("How should it end?")).toHaveValue("Ambiguously.");
    await expect(args.onAnswer).not.toHaveBeenCalled();
  },
};

// "You decide" always proceeds: an author who does not want to answer is never stuck.
export const YouDecideAlwaysProceeds: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "You decide" }));
    await expect(args.onAnswer).toHaveBeenCalledWith([
      { id: "antagonist", text: "" },
      { id: "ending", text: "" },
    ]);
  },
};
