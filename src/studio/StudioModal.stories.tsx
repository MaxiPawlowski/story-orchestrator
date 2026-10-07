import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { fn, within, userEvent, expect, waitFor } from "@storybook/test";
import StudioModal from "./StudioModal";
import { seedDraft, seedEmptyDraft, sampleStory } from "./stories/fixtures";
import { required } from "@utils/guards";
import { emptyEnvironment } from "@wizard/index";
import { GUIDE_COPY } from "@features/helpCopy";
import { authorGuideDoc } from "@features/guideLinks";
import { STUDIO_TAB_GUIDE } from "./guideTabs";

const meta: Meta<typeof StudioModal> = {
  title: "Studio/StudioModal",
  component: StudioModal,
  args: { onClose: fn() },
  beforeEach: () => {
    seedDraft(sampleStory());
  },
};

export default meta;

type Story = StoryObj<typeof StudioModal>;

export const Seeded: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await expect(await canvas.findByLabelText("Story title")).toHaveValue("The Ruins Heist");
    await userEvent.click(await canvas.findByRole("tab", { name: "Qualities" }));
    await expect(await canvas.findByText("trust")).toBeInTheDocument();
  },
};

export const DialogIsNamedByItsHeading: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    const dialog = await canvas.findByRole("dialog", { name: "Checkpoint Studio" });
    await expect(dialog).toHaveAttribute("aria-labelledby", "so-studio-heading");
    await expect(dialog).toHaveAttribute("open");
  },
};

export const ClosingReturnsFocusToTheOpener: Story = {
  render: () => <KeyboardHost />,
  play: async ({ canvasElement }) => {
    const doc = canvasElement.ownerDocument;
    const body = within(doc.body);
    const opener = body.getByRole("button", { name: "Open studio" });
    opener.focus();
    await expect(opener).toHaveFocus();
    await userEvent.click(opener);
    await body.findByRole("dialog", { name: "Checkpoint Studio" });
    await waitFor(() => expect(doc.activeElement).not.toBe(opener));
    await userEvent.click(body.getByRole("button", { name: "Close studio" }));
    await waitFor(() => expect(body.queryByRole("dialog", { name: "Checkpoint Studio" })).toBeNull());
    await waitFor(() => expect(opener).toHaveFocus());
  },
};

export const Empty: Story = {
  beforeEach: () => {
    seedEmptyDraft();
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("button", { name: "Close studio" }));
    await waitFor(() => expect(args.onClose).toHaveBeenCalledTimes(1));
  },
};

export const WizardTabEnabled: Story = {
  args: { copilotEnabled: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("tab", { name: "Wizard" }));
    await expect(await canvas.findByLabelText("Wizard unavailable")).toBeInTheDocument();
  },
};

export const WizardTabHiddenWhenDisabled: Story = {
  args: { copilotEnabled: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await canvas.findByRole("button", { name: "Close studio" });
    await expect(canvas.queryByRole("tab", { name: "Wizard" })).toBeNull();
  },
};

// An untouched draft is the one place where "start with the wizard" is unambiguously the next step.
export const EmptyDraftOffersTheWizard: Story = {
  args: { copilotEnabled: true },
  beforeEach: () => {
    seedEmptyDraft();
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("button", { name: "Start with the wizard" }));
    await expect(await canvas.findByRole("tab", { name: "Wizard" })).toHaveAttribute("aria-selected", "true");
  },
};

export const SeededDraftDoesNotOfferTheWizard: Story = {
  args: { copilotEnabled: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await canvas.findByRole("button", { name: "Close studio" });
    await expect(canvas.queryByRole("button", { name: "Start with the wizard" })).toBeNull();
  },
};

// v2.3 plan 09. The review's keyboard trace: ArrowRight on the tablist did nothing, so a keyboard
// author could not reach a tab they could not already click. APG tabs: one tab stop, arrows move focus
// AND selection with wrapping, Home/End jump to the ends, the panel names the tab it belongs to.
//
// The dialog opens after the mount effect, so the first query retries (`findByRole`) and the rest can
// read the list; the stories are written against whatever tab the Studio opens on, never a fixed one.
type TabCanvas = { findByRole: (role: "tab", options: { name: string }) => Promise<HTMLElement>; getAllByRole: (role: "tab") => HTMLElement[] };

const tablist = async (canvas: TabCanvas): Promise<HTMLElement[]> => {
  await canvas.findByRole("tab", { name: "Story" });
  return canvas.getAllByRole("tab");
};

export const TabsAreOneTabStopAndTheKeyboardMovesThem: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    const tabs = await tablist(canvas);
    const selected = required(tabs.find((entry) => entry.getAttribute("aria-selected") === "true"), "selected tab");
    selected.focus();
    await expect(selected).toHaveFocus();
    await expect(selected).toHaveAttribute("tabindex", "0");
    tabs.filter((entry) => entry !== selected).forEach((entry) => expect(entry).toHaveAttribute("tabindex", "-1"));

    await userEvent.keyboard("{ArrowRight}");
    const next = tabs[(tabs.indexOf(selected) + 1) % tabs.length];
    await expect(next).toHaveFocus();
    await expect(next).toHaveAttribute("aria-selected", "true");
    await expect(selected).toHaveAttribute("tabindex", "-1");

    await userEvent.keyboard("{ArrowLeft}");
    await expect(selected).toHaveFocus();
    await expect(selected).toHaveAttribute("aria-selected", "true");
  },
};

export const TabsWrapAndThePanelSaysWhichItIs: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    const tabs = await tablist(canvas);
    const first = tabs[0];
    first.focus();
    // Wrapping, both ways, and the panel is labelled by the tab that is actually selected.
    await userEvent.keyboard("{ArrowLeft}");
    const last = tabs[tabs.length - 1];
    await expect(last).toHaveFocus();
    await expect(last).toHaveAttribute("aria-selected", "true");
    await expect(canvas.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", last.id);
    await expect(last).toHaveAttribute("aria-controls", canvas.getByRole("tabpanel").id);

    await userEvent.keyboard("{Home}");
    await expect(first).toHaveFocus();
    await userEvent.keyboard("{End}");
    await expect(last).toHaveFocus();
  },
};

// V19 (plan 09 §keyboard-only authoring): open, rename, save, export, close and reopen without one
// pointer event. Every step moves focus with Tab or acts with Enter/Escape, and each Tab walk is
// bounded, so a control that focus cannot reach fails here instead of looping.
const KeyboardHost = () => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" className="menu_button" onClick={() => setOpen(true)}>Open studio</button>
      {open && <StudioModal onClose={() => setOpen(false)} />}
    </div>
  );
};

const tabTo = async (doc: Document, matches: (element: Element | null) => boolean) => {
  for (let step = 0; step < 300; step += 1) {
    if (matches(doc.activeElement)) return;
    await userEvent.tab();
  }
  throw new Error(`focus never reached the control; it stopped on ${doc.activeElement?.outerHTML.slice(0, 120)}`);
};

const isButton = (name: string) => (element: Element | null) => element instanceof HTMLButtonElement && element.textContent?.trim() === name;

export const KeyboardOnlyAuthoring: Story = {
  render: () => <KeyboardHost />,
  play: async ({ canvasElement, step }) => {
    const doc = canvasElement.ownerDocument;
    const body = within(doc.body);
    const created: string[] = [];
    const original = URL.createObjectURL;
    URL.createObjectURL = ((blob: Blob) => { void blob.text().then((text) => created.push(text)); return "blob:keyboard"; }) as typeof URL.createObjectURL;
    try {
      await step("open the Studio from the keyboard", async () => {
        await tabTo(doc, isButton("Open studio"));
        await userEvent.keyboard("{Enter}");
        const title = await body.findByLabelText("Story title");
        await expect(doc.activeElement).toBe(title);
        await userEvent.keyboard("{Control>}a{/Control}Keyboard Heist");
        await expect(title).toHaveValue("Keyboard Heist");
      });
      // The graph tab's canvas is walked with real key presses live (so-studio-keyboard.mts); user-event's
      // simulated Tab does not walk it the way a browser does, so this pass moves to the Story tab the
      // way the tablist is meant to be used (APG: one tab stop, arrows move).
      await step("move to the Story tab with the arrow keys", async () => {
        await tabTo(doc, (element) => element?.getAttribute("role") === "tab");
        await userEvent.keyboard("{ArrowRight}");
        await expect(await body.findByRole("tab", { name: "Story" })).toHaveAttribute("aria-selected", "true");
        await expect(doc.activeElement?.textContent).toBe("Story");
      });
      await step("save with Enter on Save", async () => {
        await tabTo(doc, isButton("Save"));
        await userEvent.keyboard("{Enter}");
        await expect(await body.findByText(/Saved .Keyboard Heist. v\d+ to the library\./)).toBeInTheDocument();
      });
      await step("export with Enter on Export JSON", async () => {
        await tabTo(doc, isButton("Export JSON"));
        await userEvent.keyboard("{Enter}");
        await waitFor(() => expect(created).toHaveLength(1));
        await expect(created[0]).toContain("Keyboard Heist");
      });
      await step("close with Escape and reopen with Enter; the draft is still there", async () => {
        await userEvent.keyboard("{Escape}");
        await waitFor(() => expect(body.queryByLabelText("Story title")).toBeNull());
        await tabTo(doc, isButton("Open studio"));
        await userEvent.keyboard("{Enter}");
        await expect(await body.findByLabelText("Story title")).toHaveValue("Keyboard Heist");
      });
    } finally {
      URL.createObjectURL = original;
    }
  },
};

export const WizardKeepsItsModeAcrossTabs: Story = {
  args: {
    copilotEnabled: true,
    runCopilotStage: async () => { throw new Error("no stage runs in this story"); },
    agentModel: async () => ({ text: "", finish: "stop" }),
    wizardHost: { environment: () => emptyEnvironment(), applyProvisioning: async () => ({ ok: true, message: "" }) },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("tab", { name: "Wizard" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Agent" }));
    await expect(await canvas.findByLabelText("What should the agent build")).toBeInTheDocument();
    await userEvent.click(await canvas.findByRole("tab", { name: "Graph" }));
    await userEvent.click(await canvas.findByRole("tab", { name: "Wizard" }));
    await expect(await canvas.findByRole("button", { name: "Agent" })).toHaveAttribute("aria-pressed", "true");
    await expect(await canvas.findByLabelText("What should the agent build")).toBeInTheDocument();
  },
};

const GUIDE_TABS: Array<[label: string, tab: keyof typeof STUDIO_TAB_GUIDE]> = [
  ["Story", "story"], ["Qualities", "qualities"], ["Checkpoints", "checkpoints"], ["Transitions", "transitions"], ["Roster", "roster"], ["Game", "game"],
];

const topmostAt = (element: Element) => {
  const box = element.getBoundingClientRect();
  return element.ownerDocument.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
};

export const GuideOpensAboveTheStudioFromEveryTab: Story = {
  play: async ({ canvasElement, step }) => {
    const doc = canvasElement.ownerDocument;
    const body = within(doc.body);
    const studio = await body.findByRole("dialog", { name: "Checkpoint Studio" });
    for (const [index, [label, tab]] of GUIDE_TABS.entries()) {
      const topic = required(STUDIO_TAB_GUIDE[tab]?.[0], `${tab} guide topic`);
      const byPointer = index % 2 === 1;
      await step(`${label}: open ${topic} in the guide above the Studio, close it by ${byPointer ? "pointer" : "keyboard"}`, async () => {
        await userEvent.click(await body.findByRole("tab", { name: label }));
        const disclosure = required(doc.querySelector<HTMLDetailsElement>("#so-studio-guide"), "guide disclosure");
        disclosure.open = true;
        const entry = required(disclosure.querySelector<HTMLDetailsElement>(`[data-so="guide-topic"][data-topic="${topic}"]`), "guide topic");
        entry.open = true;
        await userEvent.click(required(entry.querySelector<HTMLButtonElement>('[data-so="guide-topic-open"]'), "open in the guide"));
        const reader = await body.findByRole("dialog", { name: GUIDE_COPY.title });
        await expect(reader).toHaveAttribute("open");
        await waitFor(() => expect(reader.querySelector(`[data-so="guide-page"][data-doc="${authorGuideDoc(topic)}"]`)).toBeVisible(), { timeout: 5000 });
        await waitFor(() => expect(reader.contains(doc.activeElement)).toBe(true));
        const close = within(reader).getByRole("button", { name: GUIDE_COPY.close });
        const search = within(reader).getByRole("searchbox", { name: GUIDE_COPY.search });
        await expect(topmostAt(close)).toBe(close);
        await expect(topmostAt(search)).toBe(search);
        if (byPointer) await userEvent.click(close);
        else {
          search.focus();
          await userEvent.keyboard("{Escape}");
        }
        await waitFor(() => expect(body.queryByRole("dialog", { name: GUIDE_COPY.title })).toBeNull());
        await expect(studio).toHaveAttribute("open");
        await expect(body.getByRole("tab", { name: label })).toHaveAttribute("aria-selected", "true");
      });
    }
  },
};
