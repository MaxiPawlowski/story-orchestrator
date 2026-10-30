import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import { Tab, TabList, TabPanel, Tabs, type TabsVariant } from "./Tabs";

const SECTIONS = [{ id: "qualities", label: "Qualities" }, { id: "game", label: "Game" }, { id: "rules", label: "Story rules" }];

const Demo = ({ variant = "underline" }: { variant?: TabsVariant }) => {
  const [active, setActive] = useState("qualities");
  return (
    <Tabs value={active} onChange={setActive} idPrefix="kit-tab-">
      <TabList label="Studio sections" variant={variant}>
        {SECTIONS.map((section, index) => <Tab key={section.id} value={section.id} controls="kit-tabpanel" count={index === 0 ? 4 : undefined}>{section.label}</Tab>)}
      </TabList>
      <TabPanel id="kit-tabpanel" className="so-dialog-body">Showing {active}</TabPanel>
    </Tabs>
  );
};

const meta = { title: "Kit/Tabs", component: Demo } satisfies Meta<typeof Demo>;
export default meta;
type Story = StoryObj<typeof meta>;

export const RovingKeyboard: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tabs = canvas.getAllByRole("tab");
    await expect(tabs.map((tab) => tab.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    await expect(canvas.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "kit-tab-qualities");
    tabs[0].focus();
    await userEvent.keyboard("{ArrowRight}");
    await expect(canvas.getByRole("tab", { name: "Game" })).toHaveAttribute("aria-selected", "true");
    await expect(canvas.getByRole("tab", { name: "Game" })).toHaveFocus();
    await userEvent.keyboard("{End}");
    await expect(canvas.getByRole("tab", { name: "Story rules" })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowRight}");
    await expect(canvas.getByRole("tab", { name: /Qualities/ })).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowLeft}");
    await expect(canvas.getByRole("tab", { name: "Story rules" })).toHaveFocus();
    await userEvent.keyboard("{Home}");
    await expect(canvas.getByRole("tabpanel")).toHaveTextContent("Showing qualities");
  },
};

export const Segmented: Story = { args: { variant: "segmented" } };

export const Phone: Story = { parameters: { testViewport: { width: 390, height: 844 } } };
