import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "@storybook/test";
import { Callout } from "./Callout";
import { Button } from "./Button";

const meta = { title: "Kit/Callout", component: Callout, args: { children: <p>The memory model is not answering.</p> } } satisfies Meta<typeof Callout>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Tones: Story = {
  render: () => (
    <div className="so-section">
      <Callout tone="info" title="Heads up"><p>Images are paused in this chat.</p></Callout>
      <Callout tone="ok"><p>Saved "Factions lab" to the library.</p></Callout>
      <Callout tone="warn" title="Lore" actions={<><Button variant="primary">Show me</Button><Button variant="ghost">Keep it</Button></>}><p>One book is missing.</p></Callout>
      <Callout tone="error" role="alert" title="Stops the story"><p>The group has no members.</p></Callout>
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("alert")).toHaveTextContent("Stops the story");
    await expect([...canvasElement.querySelectorAll(".so-callout")].every((callout) => callout.querySelector(":scope > i"))).toBe(true);
  },
};
