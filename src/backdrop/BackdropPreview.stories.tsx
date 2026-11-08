import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, waitFor } from "@storybook/test";
import { BackdropPreview } from "./BackdropPreview";

const meta: Meta<typeof BackdropPreview> = { title: "Backdrop/Stage", component: BackdropPreview };
export default meta;
type Story = StoryObj<typeof BackdropPreview>;

const layersAfter = async (onView: ReturnType<typeof fn>, expected: string[]) => {
  await waitFor(() => expect(onView).toHaveBeenCalled(), { timeout: 4000 });
  const view = onView.mock.calls.at(-1)?.[0] as { active: boolean; layers: string[] } | undefined;
  if (view && !view.active) return;
  await expect(view?.layers).toEqual(expected);
};

export const RainAtDusk: Story = {
  args: { values: { weather: "rain", time_of_day: "evening" }, onView: fn() },
  play: async ({ args }) => { await layersAfter(args.onView as ReturnType<typeof fn>, ["drift", "rain"]); },
};

export const StormWithTension: Story = { args: { values: { weather: "thunderstorm", tension_current: 0.9 }, onView: fn() } };

export const SnowNight: Story = { args: { values: { weather: "snow", time_of_day: "night" }, onView: fn() } };

export const WindyDay: Story = {
  args: { values: { weather: "windy", time_of_day: "afternoon" }, onView: fn() },
  play: async ({ args }) => { await layersAfter(args.onView as ReturnType<typeof fn>, ["drift", "dust"]); },
};

export const CityNightHasNoFireflies: Story = {
  args: { sceneKey: "city street.png", values: { time_of_day: "night" }, onView: fn() },
  play: async ({ args }) => { await layersAfter(args.onView as ReturnType<typeof fn>, ["drift"]); },
};

export const FirefliesNight: Story = {
  args: { values: { time_of_day: "night" }, onView: fn() },
  play: async ({ args }) => { await layersAfter(args.onView as ReturnType<typeof fn>, ["drift", "fireflies"]); },
};

export const CandlelitCellar: Story = { args: { sceneKey: "cellar.png", values: { time_of_day: "night" }, onView: fn() } };

export const AuthoredEmbersAndShimmer: Story = {
  args: { values: {}, effect: { layers: [{ kind: "embers", intensity: 0.8 }, { kind: "shimmer", mask: "water" }, { kind: "fog", intensity: 0.3 }] }, onView: fn() },
  play: async ({ args }) => { await layersAfter(args.onView as ReturnType<typeof fn>, ["shimmer", "fog", "embers"]); },
};

export const ReducedMotionStill: Story = {
  args: { values: { weather: "rain" }, reducedMotion: true, onView: fn() },
  play: async ({ args }) => { await layersAfter(args.onView as ReturnType<typeof fn>, []); },
};
