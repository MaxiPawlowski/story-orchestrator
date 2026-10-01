import type { Meta, StoryObj } from "@storybook/react";
import { within, userEvent, expect } from "@storybook/test";
import ChaptersEditor from "./ChaptersEditor";
import { useDraftStore } from "../draft";
import { sampleStory, seedDraft } from "../stories/fixtures";

const chaptered = () => ({
  ...sampleStory(),
  chapters: [{ id: "act1", title: "The Approach" }, { id: "act2", title: "The Vault", final: true }],
  checkpoints: sampleStory().checkpoints.map((checkpoint) => ({ ...checkpoint, chapter: checkpoint.id === "cache" ? "act2" : "act1" })),
});

const meta: Meta<typeof ChaptersEditor> = {
  title: "Studio/ChaptersEditor",
  component: ChaptersEditor,
};

export default meta;

type Story = StoryObj<typeof ChaptersEditor>;

export const NoChaptersYet: Story = {
  beforeEach: () => {
    seedDraft(sampleStory());
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/played as one long act/)).toBeInTheDocument();
    await userEvent.type(canvas.getByLabelText("New chapter id"), "act1");
    await userEvent.click(canvas.getByRole("button", { name: "+ Chapter" }));
    await expect(useDraftStore.getState().draft.chapters).toEqual([{ id: "act1", title: "act1" }]);
    await userEvent.click(canvas.getByRole("button", { name: "+ Chapter" }));
    await expect(useDraftStore.getState().draft.chapters?.map((chapter) => chapter.id)).toEqual(["act1", "chapter"]);
    await expect(canvas.getByLabelText("Chapter of Approach")).toHaveValue("");
  },
};

export const EditTitlesAndKind: Story = {
  beforeEach: () => {
    seedDraft(chaptered());
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const title = canvas.getByLabelText("act1 title");
    await userEvent.clear(title);
    await userEvent.type(title, "Arrival");
    await userEvent.type(canvas.getByLabelText("act1 player title"), "Chapter One");
    await userEvent.selectOptions(canvas.getByLabelText("act1 kind"), "interlude");
    await expect(canvas.getByLabelText("act2 ends the story")).toBeChecked();
    await userEvent.click(canvas.getByLabelText("act2 ends the story"));
    const [first, second] = useDraftStore.getState().draft.chapters ?? [];
    await expect(first).toEqual({ id: "act1", title: "Arrival", player_title: "Chapter One", kind: "interlude" });
    await expect(second.final).toBeUndefined();
  },
};

export const SealPolicy: Story = {
  beforeEach: () => {
    seedDraft(chaptered());
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(canvas.getByLabelText("act1 open threads"), "close");
    await userEvent.type(canvas.getByLabelText("act1 messages kept verbatim"), "4");
    await userEvent.selectOptions(canvas.getByLabelText("act1 record style"), "chronicle");
    await userEvent.click(canvas.getByLabelText("act1 leaves the prompt once sealed"));
    await expect(useDraftStore.getState().draft.chapters?.[0].seal).toEqual({ open_threads: "close", keep_tail: 4, record_style: "chronicle", fold_messages: false });
    await userEvent.click(canvas.getByLabelText("act1 leaves the prompt once sealed"));
    await userEvent.selectOptions(canvas.getByLabelText("act1 open threads"), "");
    await expect(useDraftStore.getState().draft.chapters?.[0].seal).toEqual({ keep_tail: 4, record_style: "chronicle" });
  },
};

export const AssignAndRemove: Story = {
  beforeEach: () => {
    seedDraft(chaptered());
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(canvas.getByLabelText("Chapter of Infiltrate"), "act2");
    await expect(useDraftStore.getState().draft.checkpoints.find((checkpoint) => checkpoint.id === "infiltrate")?.chapter).toBe("act2");
    await userEvent.click(canvas.getByRole("button", { name: "Remove chapter act2" }));
    const draft = useDraftStore.getState().draft;
    await expect(draft.chapters?.map((chapter) => chapter.id)).toEqual(["act1"]);
    await expect(draft.checkpoints.map((checkpoint) => checkpoint.chapter)).toEqual(["act1", undefined, undefined]);
    await expect(canvas.getByLabelText("Chapter of The Cache")).toHaveValue("");
  },
};
