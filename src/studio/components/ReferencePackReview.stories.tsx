import type { Meta, StoryObj } from "@storybook/react";
import { expect, userEvent, within, fn } from "@storybook/test";
import ReferencePackReview from "./ReferencePackReview";
import { visualFixture } from "../../sprites/visualFixtures";
import { RENDERED_VIEWS } from "../../sprites/referenceViews";
import { REFERENCE_VIEWS, type VisualManifest } from "../../sprites/visualManifest";
import { SPRITE_FIXTURE_PNG } from "./spriteBuilderFixtures";

const png = `data:image/png;base64,${SPRITE_FIXTURE_PNG}`;
const fixture = visualFixture();
const source: VisualManifest = { ...fixture, base: { ...fixture.base, path: png }, bust: { ...fixture.bust, path: png } };
const review = { character: source.character, root: `${source.id}:1`, revision: 1,
  views: RENDERED_VIEWS.map((view, index) => ({ view, data: SPRITE_FIXTURE_PNG, sha256: String(index).repeat(64), key: String(index + 4).repeat(64) })) };
const packed: VisualManifest = { ...source, revision: 2, pack: { hash: "9".repeat(64),
  views: Object.fromEntries(REFERENCE_VIEWS.map((view) => [view, { ...source.base, key: view }])) as NonNullable<VisualManifest["pack"]>["views"] } };

const meta: Meta<typeof ReferencePackReview> = { title: "Studio/ReferencePackReview", component: ReferencePackReview,
  args: { busy: false, prepare: fn(), accept: fn(), cancel: fn() } };
export default meta;
type Story = StoryObj<typeof meta>;

export const NoAcceptedSource: Story = { play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(canvas.getByRole("status")).toHaveTextContent("Accept a base and bust above");
  await expect(canvas.queryByRole("button", { name: "Draw reference views" })).toBeNull();
} };
export const NoPackYet: Story = { args: { source }, play: async ({ canvasElement, args }) => {
  const canvas = within(canvasElement);
  await expect(canvas.getByRole("status")).toHaveTextContent("No reference pack");
  await userEvent.click(canvas.getByRole("button", { name: "Draw reference views" })); await expect(args.prepare).toHaveBeenCalled();
} };
export const DrawingWithProgress: Story = { args: { source, busy: true, progress: { done: 2, total: 4 } }, play: async ({ canvasElement, args }) => {
  const canvas = within(canvasElement);
  await expect(canvas.getByRole("status")).toHaveTextContent("Drawing view 3 of 4");
  await expect(canvas.getByRole("button", { name: "Draw reference views" })).toBeDisabled();
  await userEvent.click(canvas.getByRole("button", { name: "Cancel reference views" })); await expect(args.cancel).toHaveBeenCalled();
} };
export const AuthorReview: Story = { args: { source, review }, play: async ({ canvasElement, args }) => {
  const canvas = within(canvasElement);
  await expect(canvas.getAllByRole("img")).toHaveLength(6);
  await expect(canvas.getByRole("img", { name: "Profile view to approve" })).toBeVisible();
  await userEvent.click(canvas.getByRole("button", { name: "Accept all six views" })); await expect(args.accept).toHaveBeenCalled();
} };
export const Accepted: Story = { args: { source: packed }, play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await expect(canvas.getByRole("status")).toHaveTextContent("Reference pack 999999999999 accepted on source revision 2");
  await expect(within(canvas.getByRole("list", { name: "Accepted reference views" })).getAllByRole("img")).toHaveLength(6);
  await expect(canvas.getByRole("button", { name: "Draw the reference views again" })).toBeEnabled();
} };
export const Refused: Story = { args: { source, error: "A newer visual source was accepted. Prepare its reference views instead." },
  play: async ({ canvasElement }) => { await expect(within(canvasElement).getByRole("alert")).toHaveTextContent("newer visual source"); } };
