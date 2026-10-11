import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { within, userEvent, expect } from "@storybook/test";
import type { Quality } from "@engine/index";
import QualityCommitEvidence from "./QualityCommitEvidence";

const meta: Meta<typeof QualityCommitEvidence> = {
  title: "Studio/QualityCommitEvidence",
  component: QualityCommitEvidence,
  args: {
    quality: { key: "oath", type: "enum", source: "extractor", rubric: "What action did the player take?", values: ["sworn", "left"], commit_evidence: { sworn: "swear|promise" } },
    disabled: false,
  },
  render: function Render(args) {
    const [quality, setQuality] = useState<Quality>(args.quality);
    return <QualityCommitEvidence {...args} quality={quality} patch={(change) => setQuality((current) => ({ ...current, ...change }))} />;
  },
};

export default meta;
type Story = StoryObj<typeof QualityCommitEvidence>;

export const PerValue: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Commitment evidence for sworn")).toHaveValue("swear|promise");
    await expect(canvas.getByLabelText("Commitment evidence for left")).toHaveValue("");
    await userEvent.type(canvas.getByLabelText("Commitment evidence for left"), "leave");
    await expect(canvas.getByLabelText("Commitment evidence for left")).toHaveValue("leave");
  },
};

export const Disabled: Story = { args: { disabled: true } };
