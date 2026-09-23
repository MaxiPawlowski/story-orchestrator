import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import { CapabilitiesGroup } from "./CapabilitiesGroup";

const present = { id: "macros" as const, state: "present" as const, detail: "MacrosParser" };
const facts = { stVersion: "1.13.4", stCommit: "abc1234", macroEngine: "new" as const };

const meta: Meta<typeof CapabilitiesGroup> = {
  title: "Settings/CapabilitiesGroup",
  component: CapabilitiesGroup,
  args: { reports: [present], facts, extensionVersion: "2.3.0", onRefresh: fn() },
};

export default meta;

type Story = StoryObj<typeof CapabilitiesGroup>;

export const AllPresent: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/Everything this extension needs is here/)).toBeInTheDocument();
    await expect(canvasElement.querySelector("#so-capability-vectors")).toBeNull();
    // v2.3 plan 08: which host this is running on, since a probe cannot say that.
    await expect(canvasElement.querySelector("#so-host-facts")?.textContent).toContain("SillyTavern 1.13.4 (abc1234)");
    await expect(canvasElement.querySelector("#so-host-facts")?.textContent).toContain("new macro engine");
  },
};

export const NamesWhatIsMissing: Story = {
  args: {
    reports: [
      present,
      { id: "vectors", state: "absent", detail: "this build has no /api/vector routes" },
      { id: "judge", state: "error", detail: "the probe failed" },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(/2 of 3 unavailable/)).toBeInTheDocument();
    await expect(canvasElement.querySelector("#so-capability-vectors")?.textContent).toContain("is unavailable");
    // An `error` is not an absence, and must not be reported as one.
    await expect(canvasElement.querySelector("#so-capability-judge")?.textContent).toContain("could not be checked");
  },
};

export const RecheckAsksAgain: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Recheck" }));
    await expect(args.onRefresh).toHaveBeenCalledTimes(1);
  },
};

export const CheckingSaysSo: Story = {
  args: { reports: "checking" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Checking…")).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Recheck" })).toBeDisabled();
  },
};

// The whole point of the block: one paste that carries the version, the engine and every probe, so a
// bug report does not start with three round trips asking which build it was.
export const CopiesTheWholePicture: Story = {
  args: {
    reports: [
      present,
      { id: "vectors", state: "absent", detail: "no /api/vector routes" },
    ],
    onCopy: fn(),
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Copy for a bug report" }));
    await expect(args.onCopy).toHaveBeenCalledTimes(1);
    const text = (args.onCopy as unknown as { mock: { calls: string[][] } }).mock.calls[0][0];
    expect(text).toContain("Story Orchestrator 2.3.0");
    expect(text).toContain("SillyTavern 1.13.4 (abc1234)");
    expect(text).toContain("macros: new engine");
    expect(text).toContain("vectors: absent — no /api/vector routes");
    await expect(canvas.getByRole("button", { name: "Copied" })).toBeInTheDocument();
  },
};
