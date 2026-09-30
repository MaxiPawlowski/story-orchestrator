import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { within, userEvent, expect } from "@storybook/test";
import type { Checkpoint } from "@engine/index";
import GuidanceEditor from "./GuidanceEditor";

const roster = [{ id: "haley", name: "Haley" }, { id: "forre", name: "Forre" }];

const Harness: React.FC<{ initial?: Checkpoint["guidance"] }> = ({ initial }) => {
  const [guidance, setGuidance] = useState<Checkpoint["guidance"]>(initial);
  return (
    <>
      <GuidanceEditor guidance={guidance} roster={roster} onChange={setGuidance} />
      <pre data-so="guidance-record">{JSON.stringify(guidance ?? null)}</pre>
    </>
  );
};

const meta: Meta<typeof Harness> = {
  title: "Studio/GuidanceEditor",
  component: Harness,
};

export default meta;

type Story = StoryObj<typeof Harness>;

const record = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="guidance-record"]')?.textContent;

export const SharedTextStaysAPlainString: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Guidance (everyone hears this)"), "Noon duel.");
    await expect(record(canvasElement)).toBe(JSON.stringify("Noon duel."));
  },
};

export const AMemberPartMakesItPerMember: Story = {
  args: { initial: "Noon duel." },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText(/Private direction per member/));
    await userEvent.type(canvas.getByLabelText("Only Haley hears"), "You rigged the blade.");
    await expect(record(canvasElement)).toBe(JSON.stringify({ all: "Noon duel.", members: { haley: "You rigged the blade." } }));
    await userEvent.clear(canvas.getByLabelText("Only Haley hears"));
    await expect(record(canvasElement)).toBe(JSON.stringify("Noon duel."));
  },
};

export const NamesAnUnknownMember: Story = {
  args: { initial: { members: { ghost: "Hide." } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/"ghost" is not in the roster/)).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Remove" }));
    await expect(record(canvasElement)).toBe("null");
  },
};
