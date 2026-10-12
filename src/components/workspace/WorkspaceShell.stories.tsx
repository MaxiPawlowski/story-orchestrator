import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { WorkspaceShell } from "./WorkspaceShell";
import "./workspace.css";

const meta: Meta<typeof WorkspaceShell> = {
  title: "Workspace/Shell", component: WorkspaceShell,
  args: { intent: { context: "story" }, storyTitle: "Test story", authorView: false, onClose: fn(),
    render: (location, navigate) => <section><h2>{location.feature ?? location.page}</h2>
      <button onClick={() => navigate({ context: "story", page: "features", feature: "inner" })}>Open inner voice</button>
      {location.feature && <button onClick={() => navigate({ context: "story", page: "features" })}>All features</button>}
    </section> },
};
export default meta;
type Story = StoryObj<typeof WorkspaceShell>;
export const Desktop: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByRole("dialog", { name: "Test story" })).toHaveAttribute("open");
    await userEvent.click(page.getByRole("button", { name: "Features" }));
    await userEvent.click(page.getByRole("button", { name: "Open inner voice" }));
    await expect(page.getByRole("heading", { name: "inner" })).toBeInTheDocument();
    await userEvent.click(page.getByRole("button", { name: "All features" }));
    await expect(page.getByRole("heading", { name: "features" })).toBeInTheDocument();
  },
};
export const Mobile: Story = { ...Desktop, parameters: { viewport: { defaultViewport: "mobile1" } } };
