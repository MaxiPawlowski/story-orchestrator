import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { within, userEvent, expect } from "@storybook/test";
import type { AgencyPolicy } from "@engine/index";
import AgencyEditor from "./AgencyEditor";

const checkpoints = [
  { id: "gate", name: "The Gate" },
  { id: "hall", name: "The Hall" },
];

const Harness: React.FC<{ initial?: Partial<AgencyPolicy> }> = ({ initial }) => {
  const [policy, setPolicy] = useState<Partial<AgencyPolicy> | undefined>(initial);
  return (
    <>
      <AgencyEditor policy={policy} checkpoints={checkpoints} onChange={setPolicy} />
      <pre data-so="agency-record">{JSON.stringify(policy ?? null)}</pre>
    </>
  );
};

const meta: Meta<typeof Harness> = {
  title: "Studio/AgencyEditor",
  component: Harness,
};

export default meta;

type Story = StoryObj<typeof Harness>;

// The policy is optional in the record and defaulted in the runtime, so an untouched editor shows the
// defaults the story is ALREADY playing under, and writes nothing until the author changes one.
export const DefaultsWithoutWriting: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Objective kind")).toHaveValue("world_pressure");
    await expect(canvas.getByLabelText("Never narrate the player accepting what they refused")).toBeChecked();
    await expect(canvas.getByLabelText("The player's own acts are theirs to write")).toBeChecked();
    await expect(canvasElement.querySelector('[data-so="agency-record"]')?.textContent).toBe("null");
  },
};

export const WritesOnlyTheDifference: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(canvas.getByLabelText("Objective kind"), "player_action");
    await expect(canvasElement.querySelector('[data-so="agency-record"]')?.textContent).toBe(JSON.stringify({ objective_kind: "player_action" }));
    // Turning a default back off is a difference too — and turning it back ON is not, so the record
    // does not carry a value that merely restates the default.
    await userEvent.click(canvas.getByLabelText("The player's own acts are theirs to write"));
    await expect(canvasElement.querySelector('[data-so="agency-record"]')?.textContent).toBe(JSON.stringify({ objective_kind: "player_action", never_narrate_player_action: false }));
    await userEvent.click(canvas.getByLabelText("The player's own acts are theirs to write"));
    await expect(canvasElement.querySelector('[data-so="agency-record"]')?.textContent).toBe(JSON.stringify({ objective_kind: "player_action" }));
  },
};

export const NamesTheRefusalFallback: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(canvas.getByLabelText("If the player refuses the route here"), "hall");
    await expect(canvasElement.querySelector('[data-so="agency-record"]')?.textContent).toContain('"alternate":"hall"');
  },
};

export const OptsIntoPlayerAttempts: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const attempts = canvas.getByLabelText("The player's message is an attempt; the world decides whether it works");
    await expect(attempts).not.toBeChecked();
    await userEvent.click(attempts);
    await expect(canvasElement.querySelector('[data-so="agency-record"]')?.textContent).toBe(JSON.stringify({ player_attempts_only: true }));
    await userEvent.click(attempts);
    await expect(canvasElement.querySelector('[data-so="agency-record"]')?.textContent).toBe("null");
  },
};

export const ShowsAnAuthoredPolicy: Story = {
  args: { initial: { protect_player_choice: false, objective_kind: "player_action", alternate: "gate" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Never narrate the player accepting what they refused")).not.toBeChecked();
    await expect(canvas.getByLabelText("If the player refuses the route here")).toHaveValue("gate");
  },
};
