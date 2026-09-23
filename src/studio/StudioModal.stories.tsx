import type { Meta, StoryObj } from "@storybook/react";
import { fn, within, userEvent, expect } from "@storybook/test";
import StudioModal from "./StudioModal";
import { seedDraft, seedEmptyDraft, sampleStory } from "./stories/fixtures";

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

export const Empty: Story = {
  beforeEach: () => {
    seedEmptyDraft();
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("button", { name: "Close studio" }));
    await expect(args.onClose).toHaveBeenCalledTimes(1);
  },
};

export const WizardTabEnabled: Story = {
  args: { copilotEnabled: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement.ownerDocument.body);
    await userEvent.click(await canvas.findByRole("tab", { name: "Wizard" }));
    await expect(await canvas.findByLabelText("Copilot unavailable")).toBeInTheDocument();
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
    const selected = tabs.find((entry) => entry.getAttribute("aria-selected") === "true")!;
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
