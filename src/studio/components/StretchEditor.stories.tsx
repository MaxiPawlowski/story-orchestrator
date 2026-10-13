import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { within, userEvent, expect } from "@storybook/test";
import type { CheckpointStretch } from "@engine/index";
import StretchEditor from "./StretchEditor";
import type { StretchExit } from "../stretchDraft";

const arrive = { q: "reached_walls", op: "==", v: true } as const;

const exits: StretchExit[] = [
  { index: 0, to: "walls", toName: "The walls", gate: arrive },
  { index: 3, to: "inn", toName: "The inn", gate: { q: "player_turns_in_checkpoint", op: ">=", v: 8 } },
];

const Harness: React.FC<{ initial?: CheckpointStretch; playerText?: boolean; withExits?: StretchExit[]; anchor?: boolean }> = ({ initial, playerText = false, withExits = exits, anchor = false }) => {
  const [stretch, setStretch] = useState<CheckpointStretch | undefined>(initial);
  return (
    <>
      <StretchEditor anchor={anchor} stretch={stretch} exits={withExits} hasPlayerText={playerText} onChange={setStretch} />
      <pre data-so="stretch-record">{JSON.stringify(stretch ?? null)}</pre>
    </>
  );
};

const meta: Meta<typeof Harness> = {
  title: "Studio/StretchEditor",
  component: Harness,
  tags: ["b3-open-stretch"],
};

export default meta;

type Story = StoryObj<typeof Harness>;

const record = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="stretch-record"]')?.textContent ?? "";

export const OpensOnTheFirstExit: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(record(canvasElement)).toBe("null");
    await userEvent.click(canvas.getByText(/Open stretch: free play/));
    await expect(record(canvasElement)).toBe(JSON.stringify({ mode: "open", pace: "unhurried", pull_after: 6, arrive_when: arrive }));
    await expect(canvas.getByLabelText("Arrival exit")).toHaveValue("0");
    await expect(canvasElement.querySelector('[data-so="stretch-side-exits"]')?.textContent).toContain("to The inn");
  },
};

export const PaceSetsThePull: Story = {
  args: { initial: { mode: "open", pace: "unhurried", pull_after: 6, max_turns: 8, arrive_when: arrive } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(canvas.getByLabelText("Stretch pace"), "long");
    await expect(record(canvasElement)).toBe(JSON.stringify({ mode: "open", pace: "long", pull_after: 10, arrive_when: arrive }));
    await userEvent.selectOptions(canvas.getByLabelText("Stretch pace"), "brief");
    await userEvent.type(canvas.getByLabelText("Plain pull at"), "5");
    await expect(record(canvasElement)).toBe(JSON.stringify({ mode: "open", pace: "brief", pull_after: 3, arrive_when: arrive, max_turns: 5 }));
  },
};

export const ClosesToAPlainStub: Story = {
  args: { initial: { mode: "open", pace: "brief", pull_after: 3, arrive_when: arrive }, playerText: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector('[data-so="stretch-player-text"]')).not.toBeNull();
    await userEvent.click(canvas.getByText(/Open stretch: free play/));
    await expect(record(canvasElement)).toBe("null");
  },
};

export const OffersEncounters: Story = {
  args: { initial: { mode: "open", pace: "brief", pull_after: 3, arrive_when: arrive } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText(/Offer encounters/));
    await expect(record(canvasElement)).toBe(JSON.stringify({ mode: "open", pace: "brief", pull_after: 3, arrive_when: arrive, offer: ["encounters"] }));
    await userEvent.click(canvas.getByText(/Offer encounters/));
    await expect(record(canvasElement)).toBe(JSON.stringify({ mode: "open", pace: "brief", pull_after: 3, arrive_when: arrive }));
  },
};

export const OpensAnAnchorOpening: Story = {
  args: { anchor: true, withExits: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector('[data-so="stretch-editor"]')).toBeNull();
    await userEvent.click(canvas.getByText(/Open opening: no objective line/));
    await expect(record(canvasElement)).toBe(JSON.stringify({ mode: "open", pace: "unhurried", pull_after: 6 }));
    await userEvent.selectOptions(canvas.getByLabelText("Opening pace"), "brief");
    await expect(record(canvasElement)).toBe(JSON.stringify({ mode: "open", pace: "brief", pull_after: 3 }));
    await expect(canvasElement.querySelector('[data-so="stretch-arrival"]')).toBeNull();
    await userEvent.click(canvas.getByText(/Open opening: no objective line/));
    await expect(record(canvasElement)).toBe("null");
  },
};

export const CapsTheOpening: Story = {
  args: { anchor: true, initial: { mode: "open", pace: "long", pull_after: 10 }, playerText: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.clear(canvas.getByLabelText("Open for"));
    await userEvent.type(canvas.getByLabelText("Open for"), "40");
    await expect(record(canvasElement)).toBe(JSON.stringify({ mode: "open", pace: "long", pull_after: 10 }));
    await expect(canvasElement.querySelector('[data-so="opening-player-text"]')).not.toBeNull();
  },
};

export const NoExitYet: Story = {
  args: { withExits: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText(/Open stretch: free play/));
    await expect(canvas.getByText("add a transition from this beat first")).toBeTruthy();
    await expect(record(canvasElement)).toContain('"arrive_when":{"all":[]}');
  },
};
