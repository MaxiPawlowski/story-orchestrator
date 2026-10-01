import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import type { SceneReadRecord } from "@judge/index";
import ScenePanel from "./ScenePanel";
import { MessageJumpProvider } from "./MessageCitation";

const record = (patch: Partial<SceneReadRecord> = {}): SceneReadRecord => ({
  at: "2026-09-30T12:00:00.000Z",
  boundary: 7,
  messageId: 12,
  model: "jev-1.13.0",
  sceneBreak: { p: 0.82, type: "location", triggered: true },
  location: { value: "the inner sanctum", confidence: 0.91 },
  time: { value: "dusk", confidence: 0.4 },
  present: [{ id: "arin", name: "Arin", p: 0.97 }, { id: "sphinx", name: "Sphinx", p: 0.66 }],
  headingTo: [
    { id: "vault", name: "The Vault", p: 0.31, hops: 1 },
    { id: "gate", name: "The Gate", p: 0.58, hops: 1 },
    { id: "ending", name: "The Ending", p: 0.9, hops: 2 },
  ],
  facts: { location: "the inner sanctum", time: null, present: ["Arin", "Sphinx"], headingTo: ["gate"] },
  ...patch,
});

const onJump = fn();

const meta: Meta<typeof ScenePanel> = {
  title: "Drawer/ScenePanel",
  component: ScenePanel,
};

export default meta;

type Story = StoryObj<typeof ScenePanel>;

export const EveryFieldWithItsProbability: Story = {
  args: { scene: record() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Scene read")).toBeInTheDocument();
    await expect(canvasElement.textContent).toContain("message 12 · boundary 7 · jev-1.13.0");
    await expect(canvasElement.textContent).toContain("change: 82% (location) · read asked");
    await expect(canvas.getByText("Location: the inner sanctum (91%)")).toBeInTheDocument();
    await expect(canvas.getByText("Time: dusk (40%) · below floor")).toBeInTheDocument();
    await expect(canvas.getByText("Present: Arin 97% · Sphinx 66%")).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-so="scene-heading"]')).toHaveTextContent("Heading toward: The Gate 58% · The Vault 31%");
    await expect(canvasElement.textContent).not.toContain("The Ending");
  },
};

export const NothingReadYet: Story = {
  args: { scene: null },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-so="scene-read"]')).toBeNull();
  },
};

export const CitationJumpsToTheMessage: Story = {
  args: { scene: record({ headingTo: [] }) },
  render: (args) => (
    <MessageJumpProvider value={{ enabled: true, index: null, onJump }}>
      <ScenePanel {...args} />
    </MessageJumpProvider>
  ),
  play: async ({ canvasElement }) => {
    const jump = canvasElement.querySelector<HTMLButtonElement>('[data-so="jump-to-message"]');
    await expect(jump).toHaveAttribute("data-mesid", "12");
    await userEvent.click(jump as HTMLButtonElement);
    await expect(onJump).toHaveBeenCalledWith(12);
    await expect(canvasElement.querySelector('[data-so="scene-heading"]')).toBeNull();
  },
};
