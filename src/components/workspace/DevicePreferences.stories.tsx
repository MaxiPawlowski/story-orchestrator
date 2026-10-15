import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, waitFor, within } from "@storybook/test";
import { DevicePreferences } from "./DevicePreferences";
import type { RuntimeManager } from "@runtime/runtimeManager";
import "./workspace.css";

const meta: Meta<typeof DevicePreferences> = {
  title: "Workspace/DevicePreferences", component: DevicePreferences,
  args: { manager: { notify: fn() } as unknown as RuntimeManager },
  decorators: [(Story) => <div id="so-workspace-modal"><Story /></div>],
  beforeEach: () => { localStorage.removeItem("story-orchestrator.device.storybook-user"); },
};
export default meta;
type Story = StoryObj<typeof DevicePreferences>;
export const Desktop: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByLabelText("Blinking"));
    await userEvent.click(await canvas.findByRole("button", { name: "Reset Blinking to default" }));
    await waitFor(() => expect(canvas.getByLabelText("Blinking")).toBeChecked());
  },
};
export const Mobile: Story = { ...Desktop, parameters: { viewport: { defaultViewport: "mobile1" } } };
