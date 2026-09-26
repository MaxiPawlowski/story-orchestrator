import type { Meta, StoryObj } from "@storybook/react";
import { within, userEvent, expect, fn } from "@storybook/test";
import React from "react";
import GateReplayPanel from "./GateReplayPanel";
import { sampleStory, seedDraft } from "../stories/fixtures";
import { useDraftStore } from "../draft";
import { setTransitionGate } from "../mutations";
import { GateReplayContext } from "../replayContext";
import { buildReplaySource, type GateReplaySource, type ReplayLogEntry } from "../gateReplay";

const draft = () => ({ ...sampleStory(), id: "ruins-heist" });

const step = (boundary: number, at: string, evaluated: ReplayLogEntry["evaluated"], fired: ReplayLogEntry["fired"] = null, source: ReplayLogEntry["source"] = "gate"): ReplayLogEntry => ({
  boundary, before: { activeCheckpointId: at }, fired, source, context: { lastMessageId: boundary * 2 + 1 }, evaluated,
});

const jump = fn();

const recorded = (): GateReplaySource => ({
  ...buildReplaySource("ruins-heist", draft(), {
    from: { boundary: 0, messageId: 0 },
    log: [
      step(1, "start", {}),
      step(2, "start", { route: "stealth" }, { from: "start", to: "infiltrate" }),
      step(3, "infiltrate", { route: "stealth", trust: 1 }),
      step(4, "infiltrate", { route: "stealth", trust: 2 }, { from: "infiltrate", to: "cache" }),
    ],
  })!,
  jump,
});

const withSource = (source: GateReplaySource | null) => function WithReplaySource(Story: React.FC) {
  return (
    <GateReplayContext.Provider value={source}>
      <Story />
    </GateReplayContext.Provider>
  );
};

const meta: Meta<typeof GateReplayPanel> = {
  title: "Studio/GateReplayPanel",
  component: GateReplayPanel,
  args: { index: 1 },
  beforeEach: () => {
    seedDraft(draft());
  },
};

export default meta;

type Story = StoryObj<typeof GateReplayPanel>;

export const UnchangedGateShowsTheRecordedFire: Story = {
  decorators: [withSource(recorded())],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Would first hold at boundary 4 \(message 9\) · recorded: fired at boundary 4/)).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-so="gate-replay"]')?.getAttribute("data-state")).toBe("holds");
    await userEvent.click(canvas.getByRole("button", { name: "boundary 4 (message 9)" }));
    await expect(jump).toHaveBeenCalledWith(9);
  },
};

export const EditedThresholdHoldsEarlier: Story = {
  decorators: [withSource(recorded())],
  beforeEach: () => {
    seedDraft(draft());
    useDraftStore.getState().mutate((current) => setTransitionGate(current, 1, { q: "trust", op: ">=", v: 1 }));
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Would first hold at boundary 3/)).toBeInTheDocument();
    await expect(canvas.getByText(/Valid up to boundary 3/)).toBeInTheDocument();
  },
};

export const NeverHolds: Story = {
  decorators: [withSource(recorded())],
  beforeEach: () => {
    seedDraft(draft());
    useDraftStore.getState().mutate((current) => setTransitionGate(current, 1, { q: "trust", op: ">=", v: 9 }));
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Never held in the last 4 boundaries · recorded: fired at boundary 4/)).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-so="gate-replay"]')?.getAttribute("data-state")).toBe("never");
  },
};

export const UnknownQuality: Story = {
  decorators: [withSource(recorded())],
  beforeEach: () => {
    seedDraft(draft());
    useDraftStore.getState().mutate((current) => ({
      ...setTransitionGate(current, 1, { q: "lantern_lit", op: "==", v: true }),
      qualities: [...current.qualities, { key: "lantern_lit", type: "bool", source: "extractor", rubric: "Is the lantern lit?" }],
    }));
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/declares no lantern_lit/)).toBeInTheDocument();
    await expect(canvas.getByText(/changes to a quality/)).toBeInTheDocument();
  },
};

export const NoHistory: Story = {
  decorators: [withSource(null)],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Open the Studio from a chat that plays this story/)).toBeInTheDocument();
  },
};
