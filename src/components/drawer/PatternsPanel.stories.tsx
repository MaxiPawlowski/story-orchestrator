import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import type { PatternAuthorSlice } from "@runtime/patternsPort";
import { PatternsPanel } from "./PatternsPanel";

const slice: PatternAuthorSlice = {
  live: [{ patternId: "two-favours", rev: "r1", next: 1, of: 2, nextStep: "quest: to done, giver ?who", refs: ["quest ferry @3.1"], bindings: "?who=mara" }],
  ended: [{ patternId: "second-try", reason: "expired", at: "14.0", next: 1 }, { patternId: "two-favours", reason: "unless", at: "9.2", next: 1 }],
  completed: [
    { patternId: "second-try", boundary: 12, messageId: 24, refs: ["check climb @8.0", "check climb @12.0"], text: "The climb, won at the second try.", withheld: false },
    { patternId: "old-friend", boundary: 6, messageId: 12, refs: ["transition start->gate#0 @6.0"], text: "Back where Tobin waits.", withheld: true },
  ],
  overflow: 2, withheldSecret: 1, gaps: [{ from: 3, to: 4, reason: "kit" }], partial: ["two-favours"],
};

const meta: Meta<typeof PatternsPanel> = {
  title: "Drawer/PatternsPanel",
  component: PatternsPanel,
};

export default meta;

type Story = StoryObj<typeof PatternsPanel>;

export const LiveEndedAndCompleted: Story = {
  args: { slice },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByText("Patterns (1 in progress, 2 completed)"));
    await expect(canvasElement.querySelector('[data-so="pattern-live"]')).toHaveTextContent("two-favours: step 1 of 2 · next quest: to done, giver ?who · ?who=mara");
    await expect(canvasElement.querySelector('[data-withheld="true"]')).toHaveTextContent("withheld from the player now");
    await expect(canvasElement.querySelectorAll('[data-so="pattern-ended"]')).toHaveLength(2);
    await expect(canvasElement.querySelector('[data-so="pattern-gap"]')).toHaveTextContent("turns 3–4 (did not load)");
    await expect(canvasElement).toHaveTextContent("2 partial match(es) dropped over the cap.");
  },
};

export const Quiet: Story = {
  args: { slice: { live: [], ended: [], completed: [], overflow: 0, withheldSecret: 0, gaps: [], partial: [] } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("#so-author-patterns")).toHaveTextContent("Patterns (0 in progress, 0 completed)");
  },
};
