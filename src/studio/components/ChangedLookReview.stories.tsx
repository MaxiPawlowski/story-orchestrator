import React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import ChangedLookReview from "./ChangedLookReview";
import { visualFixture } from "../../sprites/visualFixtures";
import { syntheticHead } from "../../sprites/liveHead/synthetic";
import { SPRITE_FIXTURE_PNG } from "./spriteBuilderFixtures";

const source = visualFixture(), image = `data:image/png;base64,${SPRITE_FIXTURE_PNG}`;
const base = { ...source.base, path: image };
const rows = [{ look: "look_blue", state: "pending-bust" as const, base }, { look: "default", state: "pending-rig" as const, base, bust: { ...source.bust, path: image } }];
const review = { target: { character: source.character, member: "synthetic", look: "look_blue" }, root: `${source.id}:1`, base, box: source.box,
  bust: { data: SPRITE_FIXTURE_PNG, sha256: source.bust.sha256, key: "k".repeat(64) } };
const meta: Meta<typeof ChangedLookReview> = { title: "Studio/ChangedLookReview", component: ChangedLookReview,
  args: { rows: [], busy: false, rebuild: fn(), accept: fn(), cancel: fn() }, parameters: { a11y: { test: "error" } } };
export default meta;
type Story = StoryObj<typeof meta>;

export const NothingStale: Story = { play: async ({ canvasElement }) => {
  await expect(within(canvasElement).getByRole("status")).toHaveTextContent("Every published look has a matching bust and rig.");
} };
export const StaleLooks: Story = { args: { rows }, play: async ({ canvasElement, args }) => {
  const canvas = within(canvasElement);
  await expect(canvas.getAllByText(/static artwork until rebuilt/)).toHaveLength(2);
  await expect(canvas.getByText(/look_blue: bust and rig are stale/)).toBeVisible();
  await userEvent.click(canvas.getByRole("button", { name: "Rebuild bust and rig for look_blue" }));
  await expect(args.rebuild).toHaveBeenCalledWith("look_blue");
} };
export const ReviewWithRig: Story = { args: { rows, review: { ...review, rig: syntheticHead },
  preview: <img src={syntheticHead.source} alt="Rig preview placeholder" /> }, play: async ({ canvasElement, args }) => {
  const canvas = within(canvasElement);
  await expect(canvas.getByAltText("Rebuilt bust to approve")).toBeVisible();
  await expect(canvas.getByText(/Rig prepared from face landmarks/)).toBeVisible();
  await userEvent.click(canvas.getByRole("button", { name: "Accept rebuilt bust and rig" }));
  await expect(args.accept).toHaveBeenCalled();
} };
export const RigRefused: Story = { args: { review: { ...review, rigError: "The vision model refused this bust: hair covers both eyes." } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/hair covers both eyes/)).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Accept rebuilt bust only" }));
    await expect(args.accept).toHaveBeenCalled();
    await userEvent.click(canvas.getByRole("button", { name: "Cancel rebuild" }));
    await expect(args.cancel).toHaveBeenCalled();
  } };
export const ProgressAndRefusal: Story = { args: { rows, busy: true, error: "This look's artwork changed. Rebuild it again." },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Rebuild bust and rig for look_blue" })).toBeDisabled();
    await expect(canvas.getByRole("alert")).toHaveTextContent("artwork changed");
    await userEvent.click(canvas.getByRole("button", { name: "Cancel rebuild" }));
    await expect(args.cancel).toHaveBeenCalled();
  } };
