import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { Card } from "./Card";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { Callout } from "./Callout";
import { SettingRow } from "./SettingRow";
import { Switch } from "./Switch";

const meta = { title: "Kit/Card", component: Card, args: { title: "Memory", children: <p className="m-0">Reads replies to track facts.</p> } } satisfies Meta<typeof Card>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {};

export const Interactive: Story = {
  args: { interactive: true, onClick: fn(), title: "Story features", children: <span>12 on · 2 off</span> },
  play: async ({ canvasElement, args }) => {
    const card = within(canvasElement).getByRole("button", { name: /Story features/ });
    await userEvent.click(card);
    await expect(args.onClick).toHaveBeenCalled();
  },
};

export const Toned: Story = {
  render: () => (
    <div className="so-task-grid">
      <Card tone="ok" title="Persona">Ready</Card>
      <Card tone="warn" title="Lore">1 book missing</Card>
      <Card selected title="Selected">Chosen</Card>
    </div>
  ),
};

const Composed = () => {
  const [reading, setReading] = useState(false);
  return (
    <Card title="Memory" actions={<Badge tone={reading ? "ok" : "neutral"}>{reading ? "On" : "Off"}</Badge>}>
      <SettingRow label="Story reading" htmlFor="kit-composed-reading" description="Reads replies to track facts and story progress."
        control={<Switch id="kit-composed-reading" checked={reading} onChange={setReading} />} />
      <Callout tone="warn" actions={<><Button variant="primary">Show me</Button><Button variant="ghost">Keep it</Button></>}>
        <p>The memory model is not answering. The story catches up when it does.</p>
      </Callout>
    </Card>
  );
};

export const DesignSnippet: StoryObj<typeof Composed> = {
  render: () => <Composed />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("switch", { name: "Story reading" }));
    await expect(canvas.getByText("On")).toBeInTheDocument();
  },
};
