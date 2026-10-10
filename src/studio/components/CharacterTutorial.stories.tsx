import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { emptyEnvironment } from "@wizard/index";
import { VIEWPORTS, expectFits } from "../../../.storybook/fit";
import { useDraftStore } from "../draft";
import { sampleStory, seedDraft } from "../stories/fixtures";
import CharacterTutorial from "./CharacterTutorial";
import type { WizardHost } from "./StudioCopilot";

const host = (characters: string[] = ["The Guide"]): WizardHost => ({
  environment: () => ({ ...emptyEnvironment(), characterNames: characters }),
  applyProvisioning: fn(async () => ({ ok: true, message: 'Created the character card "Brannoc Hale".', created: "Brannoc Hale" })),
});

const meta: Meta<typeof CharacterTutorial> = {
  title: "Studio/CharacterTutorial",
  component: CharacterTutorial,
  args: { host: host(), onShowTopic: fn() },
  beforeEach: () => {
    seedDraft(sampleStory());
  },
};

export default meta;

type Story = StoryObj<typeof CharacterTutorial>;

const step = (canvasElement: HTMLElement, id: string) => canvasElement.querySelector(`[data-so="tutorial-step"][data-step="${id}"]`) as HTMLElement;

export const WalksTheSixSteps: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelectorAll('[data-so="tutorial-step"]')).toHaveLength(6);
    await expect(step(canvasElement, "who")).toHaveAttribute("aria-pressed", "true");
    await expect(canvasElement.querySelector('[data-so="tutorial-why"]')?.textContent).toMatch(/unique name/);
    await userEvent.click(canvasElement.querySelector('[data-so="tutorial-topic"][data-topic="author/roster"]') as HTMLElement);
    await expect(args.onShowTopic).toHaveBeenCalledWith({ kind: "studio", target: "roster" });
    await userEvent.click(canvas.getByRole("button", { name: "Next" }));
    await expect(step(canvasElement, "look")).toHaveAttribute("aria-pressed", "true");
    await expect(canvas.getByRole("button", { name: "Draft it for me" })).toBeDisabled();
  },
};

export const LookIsAStoryChangeYouReview: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Name"), "Brannoc Hale");
    await userEvent.click(step(canvasElement, "look"));
    await userEvent.type(canvas.getByLabelText("Appearance"), "Broad, grey-bearded, a brass whistle on a cord.");
    await userEvent.click(canvas.getByRole("button", { name: "Propose the look" }));
    const card = await canvas.findByRole("group", { name: "Change to the story: the look" });
    await expect(within(card).getAllByText(/Brannoc|brannoc_hale/).length).toBeGreaterThan(0);
    await userEvent.click(within(card).getByRole("button", { name: "Accept" }));
    await expect(useDraftStore.getState().draft.illustrations?.appearances?.brannoc_hale).toBe("Broad, grey-bearded, a brass whistle on a cord.");
    await expect(useDraftStore.getState().draft.roster.map((member) => member.id)).toContain("brannoc_hale");
  },
};

export const RejectingTheLookChangesNothing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Name"), "Brannoc Hale");
    await userEvent.click(step(canvasElement, "look"));
    await userEvent.type(canvas.getByLabelText("Appearance"), "Tall.");
    await userEvent.click(canvas.getByRole("button", { name: "Propose the look" }));
    await userEvent.click(await canvas.findByRole("button", { name: "Reject" }));
    await expect(useDraftStore.getState().draft.illustrations).toBeUndefined();
  },
};

export const DraftItForMeFillsTheStep: Story = {
  args: { draftStep: fn(async () => JSON.stringify({ name: "Ilsa Crane", role: "fence", concept: "buys anything that floats" })) },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Draft it for me" }));
    await expect(await canvas.findByDisplayValue("Ilsa Crane")).toBeInTheDocument();
    await expect(args.draftStep).toHaveBeenCalledWith(expect.stringContaining('"name", "role", "concept"'));
  },
};

export const ReviewBlocksATakenName: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Name"), "The Guide");
    await userEvent.click(step(canvasElement, "review"));
    await expect(canvasElement.querySelector('[data-so="tutorial-finding"][data-finding="name-taken"]')).toHaveAttribute("data-severity", "blocks");
    await expect(canvasElement.querySelector('[data-so="tutorial-blocked"]')).not.toBeNull();
    await expect(canvas.queryByRole("button", { name: "Create it" })).toBeNull();
  },
};

export const ReviewCreatesTheCardOnlyOnConfirm: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Name"), "Brannoc Hale");
    await userEvent.click(step(canvasElement, "voice"));
    await userEvent.type(canvas.getByLabelText("Description"), "Brannoc runs the harbour office. He never answers a question the first time. He wants to retire with his debts paid.");
    await userEvent.click(step(canvasElement, "first"));
    await userEvent.click(canvas.getByLabelText("In the opening scene"));
    await userEvent.type(canvas.getByLabelText("First message"), "{{{{user}} walks in and nods.");
    await userEvent.click(step(canvasElement, "review"));
    await expect(canvasElement.querySelector('[data-finding="greeting-speaks-for-player"]')).not.toBeNull();
    await expect(args.host?.applyProvisioning).not.toHaveBeenCalled();
    await userEvent.click(canvas.getByRole("button", { name: "Create it" }));
    await expect(args.host?.applyProvisioning).toHaveBeenCalledWith(expect.objectContaining({ kind: "createCharacterCard", name: "Brannoc Hale" }), expect.anything());
    await expect(await canvas.findByRole("button", { name: "Created" })).toBeDisabled();
    await expect(useDraftStore.getState().draft.roster.map((member) => member.name)).toContain("Brannoc Hale");
  },
};

const fits = (viewport: (typeof VIEWPORTS)[keyof typeof VIEWPORTS]): Story => ({
  parameters: { testViewport: viewport },
  play: async ({ canvasElement }) => {
    await expectFits(canvasElement, canvasElement.querySelector("#so-character-tutorial"));
  },
});

export const Phone = fits(VIEWPORTS.phone);

export const Tablet = fits(VIEWPORTS.tablet);

export const Wide = fits(VIEWPORTS.wide);
