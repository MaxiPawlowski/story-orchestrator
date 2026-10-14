import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within } from "@storybook/test";
import CodexEditor from "./CodexEditor";
import { useDraftStore } from "../draft";
import { codexStory } from "./gameEditorFixtures";
import { seedDraft } from "../stories/fixtures";
import { fitsAt, VIEWPORTS } from "../../../.storybook/fit";

const meta: Meta<typeof CodexEditor> = {
  title: "Studio/CodexEditor",
  component: CodexEditor,
};

export default meta;

type Story = StoryObj<typeof CodexEditor>;

const seeded = { beforeEach: () => { seedDraft(codexStory()); } };

export const EditsPages: Story = {
  ...seeded,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("People")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "+ Place" }));
    await expect(useDraftStore.getState().draft.codex?.places).toHaveLength(2);
    await userEvent.click(canvas.getAllByRole("button", { name: "+ Fact" })[0]);
    await expect(useDraftStore.getState().draft.codex?.people?.[0].facts).toHaveLength(3);
    await userEvent.selectOptions(canvas.getByLabelText("ferryman.job known when"), "start");
    await expect(useDraftStore.getState().draft.codex?.people?.[0].facts[0].known_when).toBe("start");
    await userEvent.click(canvas.getByLabelText("Show People and Places to players"));
    await expect(useDraftStore.getState().draft.display?.codex).toBe(false);
    await userEvent.click(canvas.getByRole("button", { name: "Remove people ferryman" }));
    await expect(useDraftStore.getState().draft.codex?.people).toBeUndefined();
  },
};

export const Empty: Story = {
  beforeEach: () => { seedDraft({ ...codexStory(), codex: undefined }); },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "+ Person" }));
    await expect(useDraftStore.getState().draft.codex?.people?.[0].id).toBe("person");
  },
};

const primary = (canvasElement: HTMLElement) => canvasElement.querySelector('[data-so="codex-editor"]');

export const Phone: Story = { ...seeded, ...fitsAt(VIEWPORTS.phone, primary) };
export const Tablet: Story = { ...seeded, ...fitsAt(VIEWPORTS.tablet, primary) };
export const Wide: Story = { ...seeded, ...fitsAt(VIEWPORTS.wide, primary) };
