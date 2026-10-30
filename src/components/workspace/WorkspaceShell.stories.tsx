import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, waitFor, within } from "@storybook/test";
import { WorkspaceShell } from "./WorkspaceShell";
import "./workspace.css";

const meta: Meta<typeof WorkspaceShell> = {
  title: "Workspace/Shell", component: WorkspaceShell,
  args: { intent: { context: "story" }, storyTitle: "Test story", authorView: false, onClose: fn(),
    render: (location, navigate) => <section><h2>{location.sub ?? location.feature ?? location.page}</h2>
      <button onClick={() => navigate({ context: "story", page: "features", feature: "inner" })}>Open inner voice</button>
      {location.feature && <button onClick={() => navigate({ context: "story", page: "features" })}>All features</button>}
      {location.page === "models" && <p id="so-extraction-profile" tabIndex={-1}>Memory model row</p>}
    </section> },
};
export default meta;
type Story = StoryObj<typeof WorkspaceShell>;

const navLabels = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>("#so-workspace-nav .so-nav-item")].map((item) => item.textContent?.trim());

export const PlayerSeesPlayAndSettings: Story = {
  play: async ({ canvasElement }) => {
    const body = canvasElement.ownerDocument.body;
    const page = within(body);
    await expect(await page.findByRole("dialog", { name: "Test story" })).toHaveAttribute("open");
    await expect(navLabels(body)).toEqual(["Play", "Story settings"]);
    await expect(body.querySelector("#so-workspace-context-story")).toHaveTextContent("This chat");
    await expect(body.querySelector("#so-workspace-context-orchestrator")).toHaveTextContent("Settings");
    await userEvent.click(body.querySelector("#so-workspace-page-features") as HTMLElement);
    await userEvent.click(await page.findByRole("button", { name: "Open inner voice" }));
    await expect(await page.findByRole("heading", { name: "inner" })).toBeInTheDocument();
    await userEvent.click(await page.findByRole("button", { name: "All features" }));
    await expect(await page.findByRole("heading", { name: "features" })).toBeInTheDocument();
  },
};

export const AuthorViewAddsReviewAndAuthor: Story = {
  args: { authorView: true },
  play: async ({ canvasElement }) => {
    const body = canvasElement.ownerDocument.body;
    await within(body).findByRole("dialog", { name: "Test story" });
    await expect(navLabels(body)).toEqual(["Play", "Story settings", "Review", "Author"]);
  },
};

export const SettingsHasOneLeftNav: Story = {
  args: { intent: { context: "orchestrator", page: "library" }, badges: { features: { text: "29 on" }, judge: { text: "off" } } },
  play: async ({ canvasElement }) => {
    const body = canvasElement.ownerDocument.body;
    const page = within(body);
    await page.findByRole("dialog", { name: "Story Orchestrator" });
    await expect(navLabels(body)).toEqual(["Library", "Features29 on", "Models", "Judgeoff", "Images & stage", "World & lore", "Display", "Authoring", "Diagnostics", "Help"]);
    await expect(await page.findByRole("heading", { name: "library" })).toBeInTheDocument();
    await userEvent.click(body.querySelector("#so-workspace-page-models") as HTMLElement);
    await expect(await page.findByRole("heading", { name: "models" })).toBeInTheDocument();
    await expect(body.querySelector("#so-workspace-page-models")).toHaveAttribute("aria-current", "page");
  },
};

export const SearchJumpsToTheRow: Story = {
  args: { intent: { context: "story", page: "play" } },
  play: async ({ canvasElement }) => {
    const body = canvasElement.ownerDocument.body;
    const page = within(body);
    const search = await page.findByRole("searchbox", { name: "Search all settings" });
    await userEvent.click(search);
    await userEvent.type(search, "memory model");
    await userEvent.click(await page.findByRole("button", { name: /^Memory model/ }));
    await expect(await page.findByRole("heading", { name: "models" })).toBeInTheDocument();
    await expect(body.querySelector("#so-workspace-modal")).toHaveAttribute("data-context", "orchestrator");
    await waitFor(() => expect(body.ownerDocument.activeElement?.id).toBe("so-extraction-profile"));
  },
};

export const MobileIsMasterDetailWithOneBack: Story = {
  args: { intent: { context: "orchestrator" } },
  parameters: { viewport: { defaultViewport: "mobile1" } },
  play: async ({ canvasElement }) => {
    const body = canvasElement.ownerDocument.body;
    const page = within(body);
    await page.findByRole("dialog");
    const modal = body.querySelector("#so-workspace-modal") as HTMLElement;
    if (!window.matchMedia("(max-width: 699px)").matches) return;
    await expect(modal).toHaveAttribute("data-view", "list");
    await expect(body.querySelector("#so-workspace-content")).toBeNull();
    await userEvent.click(body.querySelector("#so-workspace-page-judge") as HTMLElement);
    await expect(await page.findByRole("heading", { name: "judge" })).toBeInTheDocument();
    await expect(body.querySelectorAll("#so-workspace-back")).toHaveLength(1);
    await userEvent.click(body.querySelector("#so-workspace-back") as HTMLElement);
    await waitFor(() => expect(modal).toHaveAttribute("data-view", "list"));
  },
};
