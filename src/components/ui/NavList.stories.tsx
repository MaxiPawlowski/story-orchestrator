import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import { NavList, type NavGroup } from "./NavList";

const GROUPS: NavGroup[] = [
  {
    label: "This chat",
    items: [{ id: "play", label: "Play", icon: "fa-play" }, { id: "features", label: "Features", count: 12 }, { id: "review", label: "Review", badge: { text: "2 waiting", tone: "warn" } }],
  },
  { label: "Settings", items: [{ id: "library", label: "Library" }, { id: "connections", label: "Connections" }, { id: "help", label: "Help" }] },
];

const Demo = () => {
  const [page, setPage] = useState("play");
  return <div className="flex gap-4"><div style={{ width: "14rem" }}><NavList label="Workspace sections" groups={GROUPS} value={page} onSelect={setPage} /></div><p data-so="page">{page}</p></div>;
};

const meta = {
  title: "Kit/NavList",
  component: Demo,
  parameters: { docs: { description: { component: "Vertical nav with aria-current. Under 700px the default mobile=\"bar\" turns it into one scrolling row (group headings hidden); "
    + "mobile=\"stack\" keeps the column." } } },
} satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const CurrentPage: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nav = canvas.getByRole("navigation", { name: "Workspace sections" });
    await expect(within(nav).getByRole("button", { name: /Play/ })).toHaveAttribute("aria-current", "page");
    await userEvent.click(within(nav).getByRole("button", { name: /Review/ }));
    await expect(within(nav).getByRole("button", { name: /Review/ })).toHaveAttribute("aria-current", "page");
    await expect(within(nav).getByRole("button", { name: /Play/ })).not.toHaveAttribute("aria-current");
    await expect(canvasElement.querySelector("[data-so=page]")).toHaveTextContent("review");
    await expect(within(nav).getByText("12")).toBeInTheDocument();
  },
};

export const PhoneBar: Story = { parameters: { testViewport: { width: 390, height: 844 } } };
