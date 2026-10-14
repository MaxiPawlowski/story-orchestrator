import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within, fn } from "@storybook/test";
import PresentationReview from "./PresentationReview";
import { visualFixture } from "../../sprites/visualFixtures";
import { SPRITE_FIXTURE_PNG } from "./spriteBuilderFixtures";

const source = visualFixture();
const meta: Meta<typeof PresentationReview> = { title: "Studio/PresentationReview", component: PresentationReview,
  args: { busy: false, prepare: fn(), accept: fn(), cancel: fn() } };
export default meta;
type Story = StoryObj<typeof meta>;
export const NoArtwork: Story = { play: async ({ canvasElement, args }) => {
  const canvas = within(canvasElement); await expect(canvas.getByRole("status")).toHaveTextContent("No artwork accepted");
  await userEvent.click(canvas.getByRole("button", { name: "Review selected base and bust" })); await expect(args.prepare).toHaveBeenCalled();
} };
export const AuthorReview: Story = { args: { review: { input: { character: source.character, card: source.card, baseSet: source.baseSet,
  base: { ...source.base, path: `data:image/png;base64,${SPRITE_FIXTURE_PNG}` }, box: source.box }, data: SPRITE_FIXTURE_PNG, sha256: source.bust.sha256, key: source.id } },
  play: async ({ canvasElement, args }) => { const canvas = within(canvasElement);
    await expect(canvas.getAllByRole("img")).toHaveLength(2); await userEvent.click(canvas.getByRole("button", { name: "Accept base and bust identity" }));
    await expect(args.accept).toHaveBeenCalled(); } };
export const ProgressAndCancel: Story = { args: { busy: true }, play: async ({ canvasElement, args }) => {
  const canvas = within(canvasElement); await expect(canvas.getByRole("button", { name: "Review selected base and bust" })).toBeDisabled();
  await userEvent.click(canvas.getByRole("button", { name: "Cancel presentation review" })); await expect(args.cancel).toHaveBeenCalled();
} };
export const RefusedChangedSource: Story = { args: { error: "The source artwork changed. Choose and review it again." },
  play: async ({ canvasElement }) => { await expect(within(canvasElement).getByRole("alert")).toHaveTextContent("source artwork changed"); } };
export const ChangedLookStale: Story = { args: { accepted: source, stale: true }, play: async ({ canvasElement }) => {
  await expect(within(canvasElement).getByText(/changed look needs its own bust and rig/)).toBeVisible();
} };
