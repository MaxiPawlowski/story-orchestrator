import type { Meta, StoryObj } from "@storybook/react";
import DiagnosticsPanel from "./DiagnosticsPanel";

const meta: Meta<typeof DiagnosticsPanel> = {
  title: "Studio/DiagnosticsPanel",
  component: DiagnosticsPanel,
};

export default meta;
type Story = StoryObj<typeof DiagnosticsPanel>;

export const WithErrors: Story = {
  args: {
    diagnostics: [
      { ok: false, name: "Schema validation", detail: "Checkpoint id is required" },
      { ok: false, name: "Transition targets", detail: "edge1 points to missing node" },
    ],
  },
};

export const Empty: Story = {
  args: { diagnostics: [{ ok: true, name: "valid", detail: "ok" }] },
};
