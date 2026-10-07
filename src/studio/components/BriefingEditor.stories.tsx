import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import { expect, fn, userEvent, within } from "@storybook/test";
import type { StoryBriefing } from "@engine/index";
import { BriefingEditor } from "./BriefingEditor";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const Harness = ({ initial, onChange, onPreview }: { initial?: StoryBriefing; onChange: (next: StoryBriefing | undefined) => void; onPreview: () => void }) => {
  const [briefing, setBriefing] = useState(initial);
  return <BriefingEditor name="Briefing" hint="Shown once when the story starts." briefing={briefing} onPreview={onPreview}
    onChange={(next) => { setBriefing(next); onChange(next); }} />;
};

const meta: Meta<typeof Harness> = {
  title: "Studio/BriefingEditor",
  component: Harness,
  args: { onChange: fn(), onPreview: fn() },
};

export default meta;

type Story = StoryObj<typeof Harness>;

export const Empty: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "+ Section" }));
    await expect(args.onChange).toHaveBeenLastCalledWith({ sections: [{ heading: "How to play", text: "Write what you do and say; the world answers." }] });
    await userEvent.type(canvas.getByLabelText("Briefing title"), "The Road");
    await expect(args.onChange).toHaveBeenLastCalledWith(expect.objectContaining({ title: "The Road" }));
    await userEvent.click(canvas.getByRole("button", { name: "Remove Briefing section 1" }));
    await expect(args.onChange).toHaveBeenLastCalledWith({ title: "The Road", sections: [] });
  },
};

const withSections = { args: { initial: { title: "The Road", tone: "Grim.", sections: [{ heading: "Who you are", text: "A courier with a debt and a sealed letter." }] } } };
const addSection = (canvasElement: HTMLElement) => within(canvasElement).getByRole("button", { name: "+ Section" });

export const Phone: Story = { ...withSections, ...fitsAt(VIEWPORTS.phone, addSection) };
export const Tablet: Story = { ...withSections, ...fitsAt(VIEWPORTS.tablet, addSection) };
export const Wide: Story = { ...withSections, ...fitsAt(VIEWPORTS.wide, addSection) };

export const Full: Story = {
  args: {
    initial: {
      title: "The Road", tone: "Grim.", sections: Array.from({ length: 6 }, (_, index) => ({ heading: `Section ${index + 1}`, text: "Text." })),
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "+ Section" })).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Preview briefing" }));
    await expect(args.onPreview).toHaveBeenCalled();
  },
};
