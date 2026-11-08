import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import QuestResolutionsPanel from "./QuestResolutionsPanel";
import { useDraftStore } from "../draft";
import { resolutionStory } from "./gameEditorFixtures";
import { seedDraft } from "../stories/fixtures";

const meta: Meta<typeof QuestResolutionsPanel> = {
  title: "Studio/QuestResolutionsPanel",
  component: QuestResolutionsPanel,
  render: () => <QuestResolutionsPanel quest={useDraftStore((state) => state.draft.quests![0])} />,
};

export default meta;

type Story = StoryObj<typeof QuestResolutionsPanel>;

const seeded = { beforeEach: () => { seedDraft(resolutionStory()); } };

export const Matrix: Story = {
  ...seeded,
  play: async ({ canvasElement }) => {
    const matrix = canvasElement.querySelector('[data-so="quest-matrix"]');
    await expect(matrix?.querySelectorAll("tbody tr")).toHaveLength(3);
    await expect(matrix?.querySelector('[data-resolution="paid"]')).toHaveTextContent("thanks · sets coins");
    await expect(matrix?.querySelector('[data-resolution="paid"]')).toHaveTextContent("echoes thanks");
    await expect(matrix?.querySelector('[data-resolution="fled"]')).toHaveTextContent("nothing yet");
    await expect(matrix?.querySelector('[data-resolution="declined"]')).toHaveTextContent("from offered");
  },
};

export const Simulates: Story = {
  ...seeded,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const values = canvas.getByLabelText("debt simulate values");
    await userEvent.clear(values);
    await userEvent.type(values, '{{"trust": 1, "alarm": false, "route": "force"}');
    await userEvent.click(canvas.getByRole("button", { name: "Simulate" }));
    const result = canvasElement.querySelector('[data-so="quest-simulation"]');
    await expect(result).toHaveTextContent("Closes on paid");
    await expect(result).toHaveTextContent("rough: applies");
    await expect(result).toHaveTextContent("coins: ∅ → 3");
    await expect(result).toHaveTextContent("Journal shows: Paid the ferryman · Word of the brawl spread");
    await userEvent.selectOptions(canvas.getByLabelText("debt simulate resolution"), "fled");
    await userEvent.click(canvas.getByRole("button", { name: "Simulate" }));
    await expect(canvasElement.querySelector('[data-so="quest-simulation"]')).toHaveTextContent("Closes on fled");
  },
};

export const EditsPrecedenceAndHold: Story = {
  ...seeded,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const precedence = canvas.getByLabelText("debt precedence");
    await userEvent.clear(precedence);
    await userEvent.type(precedence, "paid, fled, declined");
    await expect(useDraftStore.getState().draft.quests?.[0].precedence).toEqual(["paid", "fled", "declined"]);
    await userEvent.click(canvas.getByRole("switch", { name: "debt holds open when two endings match" }));
    await expect(useDraftStore.getState().draft.quests?.[0].hold_when_ambiguous).toBe(true);
  },
};
