import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, waitFor, within } from "@storybook/test";
import { GuideReader } from "./GuideReader";
import { slugify } from "./links";
import type { GuideNavSection, GuidePage } from "./types";
import { fitsAt, VIEWPORTS } from "../../.storybook/fit";

const HOME = "https://github.com/MaxiPawlowski/story-orchestrator";

const page = (id: string, audience: GuidePage["audience"], lines: string[]): GuidePage => {
  const body = lines.join("\n");
  const headings = [...body.matchAll(/^(?:<a id="([a-z0-9-]+)"><\/a>\n\n)?(#{1,6})\s+(.*)$/gm)].map((match) => ({ level: match[2].length, text: match[3], slug: match[1] ?? slugify(match[3]) }));
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
  page("author/README", "author", ["# Writing a story", "", "Start with [Gates](fields/moving-on.md#gates)."]),
  page("author/fields/moving-on", "author", [
    "# Moving between scenes", "", "- [Gates](#gates)", "- [Transitions](#transitions)", "",
    "<a id=\"gates\"></a>", "", "## Gates", "", "What must be true before the story moves on.", "",
    ...Array.from({ length: 30 }, () => ["Filler paragraph about exits.", ""]).flat(),
    "<a id=\"transitions\"></a>", "", "## Transitions", "", "Where the story goes next.",
  ]),
];

const NAV: GuideNavSection[] = [
  { audience: "player", title: "Start here", ids: ["README"] },
  { audience: "player", title: "Play", ids: ["player/memory", "player/playing"] },
  { audience: "setup", title: "Set up", ids: ["setup/memory-model"] },
  { audience: "author", title: "Start here", ids: ["author/README"] },
  { audience: "author", title: "Story fields", ids: ["author/fields/moving-on"] },
];


const meta: Meta<typeof GuideReader> = {
  title: "Panels/GuideReader",
  component: GuideReader,
  args: { pages: PAGES, nav: NAV, authorView: false, homePage: HOME, target: null, onTargetSeen: fn() },
  decorators: [(Story) => <div style={{ height: 560, display: "flex" }}><Story /></div>],
};

export default meta;

type Story = StoryObj<typeof GuideReader>;

export const PlayerHome: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "Story Orchestrator guide" })).toBeInTheDocument();
    await expect(canvasElement.querySelector('[data-so="guide-nav-item"][data-page="author/fields/moving-on"]')).toBeNull();
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
    await expect(canvasElement.querySelector('[data-so="guide-result"][data-page="author/fields/moving-on"]')).toBeNull();
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
    await userEvent.click(canvasElement.querySelector('[data-so="guide-nav-item"][data-page="author/fields/moving-on"]') as HTMLElement);
    await expect(canvas.getByRole("heading", { name: "Moving between scenes" })).toBeInTheDocument();
    const sections = [...canvasElement.querySelectorAll('[data-so="guide-nav-section"]')].map((section) => section.getAttribute("data-section"));
    await expect(sections).toEqual(["Start here", "Play", "Set up", "Start here", "Story fields"]);
  },
};

export const NavFollowsTheGuideOrder: Story = {
  play: async ({ canvasElement }) => {
    const items = [...canvasElement.querySelectorAll('[data-so="guide-nav-item"]')].map((item) => item.getAttribute("data-page"));
    await expect(items).toEqual(["README", "player/memory", "player/playing", "setup/memory-model"]);
    const groups = [...canvasElement.querySelectorAll('[data-so="guide-nav-select"] optgroup')].map((group) => group.getAttribute("label"));
    await expect(groups).toEqual(["Playing: Start here", "Playing: Play", "Setup: Set up"]);
    const play = canvasElement.querySelector('[data-so="guide-nav-section"][data-section="Play"]') as HTMLDetailsElement;
    await expect(play.open).toBe(true);
    await userEvent.click(play.querySelector("summary") as HTMLElement);
    await expect(play.open).toBe(false);
  },
};

export const DeepLinkToTopicAnchor: Story = {
  args: { authorView: true, target: { id: "author/fields/moving-on", anchor: "transitions" } },
  play: async ({ canvasElement }) => {
    const heading = await within(canvasElement).findByRole("heading", { name: "Transitions" });
    await expect(heading.id).toBe("so-guide-h-transitions");
    const content = canvasElement.querySelector(".so-guide-content") as HTMLElement;
    await waitFor(() => expect(content.scrollTop).toBeGreaterThan(0));
  },
};

export const OutlineAndInPageLinks: Story = {
  args: { authorView: true, target: { id: "author/README" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("link", { name: "Gates" }));
    await expect(await canvas.findByRole("heading", { name: "Gates" })).toHaveAttribute("id", "so-guide-h-gates");
    const outline = [...canvasElement.querySelectorAll('[data-so="guide-nav-heading"]')].map((item) => item.getAttribute("data-anchor"));
    await expect(outline).toEqual(["gates", "transitions"]);
    const content = canvasElement.querySelector(".so-guide-content") as HTMLElement;
    await userEvent.click(canvasElement.querySelector('[data-so="guide-nav-heading"][data-anchor="transitions"]') as HTMLElement);
    await waitFor(() => expect(content.scrollTop).toBeGreaterThan(0));
    await expect(canvasElement.querySelector('[data-so="guide-nav-heading"][data-anchor="transitions"]')).toHaveAttribute("aria-current", "location");
  },
};


const phoneNav = async (canvasElement: HTMLElement) => {
  await expect(canvasElement.querySelector('[data-so="guide-nav"]')).not.toBeVisible();
  return canvasElement.querySelector('[data-so="guide-nav-select"]');
};
const sideNav = async (canvasElement: HTMLElement) => {
  await expect(canvasElement.querySelector('[data-so="guide-nav-select"]')).not.toBeVisible();
  return canvasElement.querySelector('[data-so="guide-nav"]');
};

export const Phone: Story = fitsAt(VIEWPORTS.phone, phoneNav);
export const Tablet: Story = fitsAt(VIEWPORTS.tablet, sideNav);
export const Wide: Story = fitsAt(VIEWPORTS.wide, sideNav);

export const AuthorPageInPlayerMode: Story = {
  args: { target: { id: "author/fields/moving-on" } },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText("That page is not available here. Pick one from the list.")).toBeInTheDocument();
  },
};

const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYPj/HwADAgH/eL9GtQAAAABJRU5ErkJggg==";

export const ShowsBundledImagesOnly: Story = {
  args: {
    pages: [page("setup/README", "setup", ["# Setup", "", "![The settings panel](../assets/panel.png)", "", "![Remote](https://example.com/a.png)"])],
    target: { id: "setup/README" },
    assetSrc: (asset: string) => (asset === "assets/panel.png" ? PIXEL : undefined),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("img", { name: "The settings panel" })).toHaveAttribute("src", PIXEL);
    await expect(canvas.queryByRole("img", { name: "Remote" })).toBeNull();
    await expect(canvas.getByText("Remote")).toBeInTheDocument();
  },
};
