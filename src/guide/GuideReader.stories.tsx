import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, waitFor, within } from "@storybook/test";
import { GuideReader } from "./GuideReader";
import { slugify } from "./links";
import type { GuidePage } from "./types";

const HOME = "https://github.com/MaxiPawlowski/story-orchestrator";

const page = (id: string, audience: GuidePage["audience"], lines: string[]): GuidePage => {
  const body = lines.join("\n");
  const headings = [...body.matchAll(/^(#{1,6})\s+(.*)$/gm)].map((match) => ({ level: match[1].length, text: match[2], slug: slugify(match[2]) }));
  return { id, doc: `${id}.md`, audience, title: headings[0]?.text ?? id, headings, body };
};

const PAGES: GuidePage[] = [
  page("README", "player", [
    "# Story Orchestrator guide", "", "Start with [Playing](player/playing.md) or [Memory](player/memory.md#pinning).", "", "| Page | For |", "|---|---|", "| Playing | everyone |",
  ]),
  page("player/playing", "player", [
    "# Playing a story", "", "1. Open the group chat.", "2. Write your first message.", "   - The story follows.", "", "## Restart", "",
    "**Restart story** starts over. Back to the [guide](../README.md).",
  ]),
  page("player/memory", "player", [
    "# Story memory", "", "What the story remembers.", "", ...Array.from({ length: 30 }, () => ["Filler paragraph about memory tiers.", ""]).flat(),
    "## Pinning", "", "Pin a fact to keep it in every prompt: `/so-mem pin 2 on`.",
  ]),
  page("setup/memory-model", "setup", ["# The memory model", "", "Pick a **Connection Manager** profile.", "", "```", "/profile Memory", "```"]),
  page("author/topics/gates", "author", ["# Gates", "", "What must be true before the story moves on."]),
];

const meta: Meta<typeof GuideReader> = {
  title: "Panels/GuideReader",
  component: GuideReader,
  args: { pages: PAGES, authorView: false, homePage: HOME, target: null },
  decorators: [(Story) => <div style={{ height: 560, display: "flex" }}><Story /></div>],
};

export default meta;

type Story = StoryObj<typeof GuideReader>;

export const PlayerHome: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Story Orchestrator guide" })).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-so="guide-nav-item"][data-page="author/topics/gates"]')).toBeNull();
    await expect(canvasElement.querySelector('[data-so="guide-nav"] [data-audience="author"]')).toBeNull();
    await expect(canvas.getByRole("link", { name: "Open on GitHub" })).toHaveAttribute("href", `${HOME}/blob/master/docs/guide/README.md`);
  },
};

export const FollowLinksAndGoBack: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("link", { name: "Playing" }));
    await expect(canvas.getByRole("heading", { name: "Playing a story" })).toBeInTheDocument();
    await expect(canvasElement.querySelectorAll('[data-so="guide-page"] ol > li')).toHaveLength(2);
    await userEvent.click(canvas.getByRole("link", { name: "guide" }));
    await expect(canvas.getByRole("heading", { name: "Story Orchestrator guide" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Back" }));
    await expect(canvas.getByRole("heading", { name: "Playing a story" })).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Forward" }));
    await expect(canvas.getByRole("heading", { name: "Story Orchestrator guide" })).toBeInTheDocument();
  },
};

export const DeepLinkToHeading: Story = {
  args: { target: { id: "player/memory", anchor: "pinning" } },
  play: async ({ canvasElement }) => {
    const heading = await within(canvasElement).findByRole("heading", { name: "Pinning" });
    const content = canvasElement.querySelector(".so-guide-content") as HTMLElement;
    await waitFor(() => expect(content.scrollTop).toBeGreaterThan(0));
    await expect(heading.id).toBe("so-guide-h-pinning");
  },
};

export const Search: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("searchbox", { name: "Search the guide" }), "memory");
    const results = canvasElement.querySelectorAll('[data-so="guide-result"]');
    await expect(results[0]).toHaveAttribute("data-page", "player/memory");
    await expect(canvasElement.querySelector('[data-so="guide-result"][data-page="author/topics/gates"]')).toBeNull();
    await userEvent.click(results[1] as HTMLElement);
    await expect(canvas.getByRole("heading", { name: "The memory model" })).toBeInTheDocument();
    await userEvent.type(canvas.getByRole("searchbox", { name: "Search the guide" }), "zzqx");
    await expect(canvas.getByText("No page matches. Try another word.")).toBeInTheDocument();
  },
};

export const AuthorView: Story = {
  args: { authorView: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvasElement.querySelector('[data-so="guide-nav-item"][data-page="author/topics/gates"]') as HTMLElement);
    await expect(canvas.getByRole("heading", { name: "Gates" })).toBeInTheDocument();
  },
};

export const AuthorPageInPlayerMode: Story = {
  args: { target: { id: "author/topics/gates" } },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText("That page is not available here. Pick one from the list.")).toBeInTheDocument();
  },
};
