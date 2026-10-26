import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { within, userEvent, expect } from "@storybook/test";
import type { RosterMember, TalkControl } from "@engine/index";
import TalkControlEditor from "./TalkControlEditor";

const roster: RosterMember[] = [
  { id: "guide", name: "The Guide" },
  { id: "warden", name: "The Warden" },
];

const Harness: React.FC<{ initial?: TalkControl }> = ({ initial }) => {
  const [control, setControl] = useState<TalkControl | undefined>(initial);
  return <TalkControlEditor control={control} roster={roster} onChange={setControl} />;
};

const meta: Meta<typeof Harness> = {
  title: "Studio/TalkControlEditor",
  component: Harness,
};

export default meta;

type Story = StoryObj<typeof Harness>;

export const Disabled: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Talk control")).not.toBeChecked();
    await expect(canvas.queryByLabelText("Lead speaker")).not.toBeInTheDocument();
  },
};

export const EnableAndConfigure: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByLabelText("Talk control"));
    await userEvent.click(canvas.getByRole("button", { name: "+ Speaker" }));
    await expect(canvas.getByLabelText("Speaker 1")).toHaveValue("The Guide");
    await userEvent.selectOptions(canvas.getByLabelText("Lead speaker"), "The Warden");
    await userEvent.click(canvas.getByLabelText("LLM director picks the speaker"));
    await userEvent.click(canvas.getByLabelText("Allow silence (nobody replies)"));
    await userEvent.type(canvas.getByLabelText("Director instruction"), "Warden leads.");
    await expect(canvas.getByLabelText("Director instruction")).toHaveValue("Warden leads.");
  },
};

export const Populated: Story = {
  args: {
    initial: {
      speakers: [{ member: "The Guide", weight: 2 }, { member: "The Warden" }],
      lead: "The Guide",
      allow_silence: true,
      director: { instruction: "Only the addressed one answers." },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Speaker 1 weight")).toHaveValue(2);
    await expect(canvas.getByLabelText("Lead speaker")).toHaveValue("The Guide");
    await expect(canvas.getByLabelText("Allow silence (nobody replies)")).toBeChecked();
    await expect(canvas.getByLabelText("Director instruction")).toHaveValue("Only the addressed one answers.");
  },
};

export const ChainYieldsOnQuestion: Story = {
  args: { initial: { speakers: [{ member: "The Guide" }] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const yieldBox = canvas.getByLabelText("End the chain when a voice asks the player something");
    await expect(yieldBox).toBeChecked();
    await userEvent.click(yieldBox);
    await expect(canvas.getByLabelText("End the chain when a voice asks the player something")).not.toBeChecked();
  },
};

export const RemoveSpeaker: Story = {
  args: { initial: { speakers: [{ member: "The Guide" }] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Remove speaker 1" }));
    await expect(canvas.queryByLabelText("Speaker 1")).not.toBeInTheDocument();
    await expect(canvas.getByText(/empty = whole roster/)).toBeInTheDocument();
  },
};

export const PicksPacingProfile: Story = {
  args: { initial: { speakers: [{ member: "The Guide" }, { member: "The Warden" }], lead: "The Guide" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Effective: 3 voices and 4 generations at most per player message; the lead answers first/)).toBeInTheDocument();
    await userEvent.selectOptions(canvas.getByLabelText("Pacing profile"), "conversation");
    await expect(canvas.getByText(/Effective: 3 voices .*the lead does not get the first word; lead replies near 120 words/)).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-so="talk-spotlight"]')).toBeChecked();
    await userEvent.click(canvasElement.querySelector('[data-so="talk-spotlight"]') as HTMLElement);
    await expect(canvasElement.querySelector('[data-so="talk-spotlight"]')).not.toBeChecked();
    await userEvent.type(canvas.getByLabelText("Voices per player message"), "2");
    await expect(canvas.getByText(/Effective: 2 voices and 3 generations/)).toBeInTheDocument();
  },
};
