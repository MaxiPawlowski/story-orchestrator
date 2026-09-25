import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "@storybook/test";
import type { RoleRouteView } from "@runtime/roleHealth";
import { RoleProfilesGroup } from "./RoleProfilesGroup";

const route = (role: RoleRouteView["role"], label: string, state: RoleRouteView["state"] = "fallback", profileId: string | null = "memory", detail = "Same as memory model"): RoleRouteView => ({ role, label, state, profileId, detail });

const allFallback: RoleRouteView[] = [
  route("read", "Story reads"),
  route("synthesis", "Summaries and canon"),
  route("authoring", "Wizard and road ahead"),
  route("director", "Speaker direction"),
  route("curator", "World Info curator"),
];

const profiles = [{ id: "memory", name: "Memory RunPod", model: "artemis" }, { id: "fast", name: "Fast local", model: "gemma-4-e4b" }];

const meta: Meta<typeof RoleProfilesGroup> = {
  title: "Settings/RoleProfilesGroup",
  component: RoleProfilesGroup,
  args: { routes: allFallback, assigned: {}, profiles, testing: null, onAssign: fn(), onTest: fn() },
};

export default meta;

type Story = StoryObj<typeof RoleProfilesGroup>;

export const SameAsMemoryModel: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText(/Models per task/));
    await expect(canvas.getByText(/Affects every chat/)).toBeVisible();
    await expect(canvasElement.querySelectorAll('[data-so="role-profile"]')).toHaveLength(5);
    await expect(canvasElement.querySelector('[data-so="role-profile-test"]')).toBeNull();
    await userEvent.selectOptions(canvasElement.querySelector("#so-role-profile-director") as HTMLSelectElement, "fast");
    await expect(args.onAssign).toHaveBeenCalledWith("director", "fast");
  },
};

export const RoutedAndFailing: Story = {
  args: {
    assigned: { director: "fast", curator: "gone" },
    routes: allFallback.map((entry) => {
      if (entry.role === "director") return route("director", "Speaker direction", "failed", "fast", "Speaker direction failed its self-test: 1 of 3 director cases answered a usable SPEAKER line");
      if (entry.role === "curator") return route("curator", "World Info curator", "missing", "gone", "The profile chosen for World Info curator no longer exists (ID: gone)");
      return entry;
    }),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText(/Models per task \(2 set\)/));
    const director = canvasElement.querySelector('[data-role="director"]') as HTMLElement;
    await expect(director.dataset.state).toBe("failed");
    await expect(director.textContent).toContain("1 of 3 director cases");
    const curatorSelect = canvasElement.querySelector("#so-role-profile-curator") as HTMLSelectElement;
    await expect(curatorSelect.value).toBe("gone");
    await expect(curatorSelect.selectedOptions[0].textContent).toContain("Missing profile");
    await expect(canvasElement.querySelector('[data-role="curator"] [data-so="role-profile-test"]')).toBeDisabled();
    await userEvent.click(within(director).getByRole("button", { name: "Test" }));
    await expect(args.onTest).toHaveBeenCalledWith("director");
    await userEvent.selectOptions(curatorSelect, "");
    await expect(args.onAssign).toHaveBeenCalledWith("curator", null);
  },
};

export const Testing: Story = {
  args: { assigned: { synthesis: "fast" }, testing: "synthesis", routes: allFallback.map((entry) => (entry.role === "synthesis" ? route("synthesis", "Summaries and canon", "untested", "fast", "Summaries and canon: not tested yet") : entry)) },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByText(/Models per task/));
    await expect(canvasElement.querySelector('[data-role="synthesis"] [data-so="role-profile-test"]')?.textContent).toBe("Testing…");
    await expect(canvasElement.querySelector('[data-role="synthesis"] [data-so="role-profile-state"]')?.textContent).toBe("not tested yet");
  },
};
