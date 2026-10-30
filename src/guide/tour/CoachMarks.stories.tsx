import { useEffect, useRef, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, waitFor, within } from "@storybook/test";
import { CoachMarks, type CoachMarksProps } from "./CoachMarks";
import { VIEWPORTS } from "../../../.storybook/fit";

type Args = CoachMarksProps & { stage: "connections" | "empty" | "author" | "low" | "modal" };

const Connections = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", padding: "1rem", maxWidth: "36rem" }}>
    <h2 style={{ margin: 0 }}>Connections</h2>
    <label htmlFor="so-extraction-profile">Memory model</label>
    <select id="so-extraction-profile" className="text_pole"><option>Pick a profile</option></select>
    <button id="so-self-test" type="button" className="menu_button">Test memory model</button>
    <div id="so-judge"><label htmlFor="so-judge-key">TypeSafe API key</label> <input id="so-judge-key" className="text_pole" type="password" /></div>
  </div>
);

const MODAL_STYLE = { width: "min(40rem, 90vw)", background: "var(--SmartThemeBlurTintColor)", color: "var(--SmartThemeBodyColor)", border: "1px solid var(--SmartThemeBorderColor)" };

const ModalStage = () => {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal?.();
    return () => element?.close?.();
  }, []);
  return <dialog ref={dialog} id="story-modal-stage" aria-label="Workspace" style={MODAL_STYLE}><Connections /></dialog>;
};

const STAGES: Record<Args["stage"], () => ReactNode> = {
  connections: () => <Connections />,
  empty: () => <p style={{ padding: "1rem" }}>A page without the control this stop points at.</p>,
  author: () => <div id="drawer-manager" style={{ padding: "1rem" }}><div role="tablist" aria-label="Author tabs"><button type="button" role="tab" className="menu_button">Blackboard</button>
    <button type="button" role="tab" className="menu_button">Scheduler</button></div></div>,
  low: () => <div style={{ height: "100vh", display: "flex", alignItems: "flex-end", padding: "1rem" }}><div id="so-hud" style={{ padding: "0.5rem", border: "1px solid" }}>◈ The gate</div></div>,
  modal: () => <ModalStage />,
};

const meta: Meta<Args> = {
  title: "Tour/CoachMarks",
  component: CoachMarks,
  args: { view: "setup", host: { run: fn() }, onClose: fn(), findTimeoutMs: 400, stage: "connections" },
  render: ({ stage, ...args }) => <>{STAGES[stage]()}<CoachMarks {...args} /></>,
};

export default meta;
type Story = StoryObj<Args>;

const page = (canvasElement: HTMLElement) => within(canvasElement.ownerDocument.body);
const coach = (canvasElement: HTMLElement) => canvasElement.ownerDocument.getElementById("so-coach") as HTMLElement;

export const SetupFlow: Story = {
  play: async ({ canvasElement, args }) => {
    const body = page(canvasElement);
    await expect(await body.findByRole("heading", { name: "The memory model" })).toBeInTheDocument();
    await expect(body.getByText("Step 1 of 6")).toBeInTheDocument();
    await waitFor(() => expect(coach(canvasElement)).toHaveAttribute("data-state", "found"));
    await expect(canvasElement.ownerDocument.querySelector("[data-so=\"coach-ring\"]")).not.toBeNull();
    await waitFor(() => expect(body.getByRole("button", { name: "Next" })).toHaveFocus());
    await expect(args.host.run).toHaveBeenCalledWith({ kind: "workspace", intent: { context: "orchestrator", page: "models" } });
    await expect(body.getByRole("button", { name: "Back" })).toBeDisabled();
    await userEvent.click(body.getByRole("button", { name: "Next" }));
    await expect(await body.findByRole("heading", { name: "Test the memory model" })).toBeInTheDocument();
    await userEvent.click(body.getByRole("button", { name: "Back" }));
    await expect(await body.findByRole("heading", { name: "The memory model" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await expect(args.onClose).toHaveBeenCalled();
  },
};

export const Choose: Story = {
  args: { view: null },
  play: async ({ canvasElement }) => {
    const body = page(canvasElement);
    await expect(await body.findByRole("heading", { name: "Take a tour" })).toBeInTheDocument();
    await expect(coach(canvasElement)).toHaveAttribute("data-mode", "center");
    await userEvent.click(body.getByRole("button", { name: "Setting up" }));
    await expect(await body.findByRole("heading", { name: "The memory model" })).toBeInTheDocument();
  },
};

export const NotOnScreen: Story = {
  args: { view: "player", stop: "memory", stage: "empty" },
  play: async ({ canvasElement, args }) => {
    const body = page(canvasElement);
    await expect(await body.findByText(/This is not on screen right now\./)).toBeInTheDocument();
    await expect(coach(canvasElement)).toHaveAttribute("data-state", "missing");
    await expect(canvasElement.ownerDocument.querySelector("[data-so=\"coach-ring\"]")).toBeNull();
    await expect(body.getByText("Step 4 of 7")).toBeInTheDocument();
    await userEvent.click(body.getByRole("button", { name: "Next" }));
    await expect(await body.findByRole("heading", { name: "When something is missing" })).toBeInTheDocument();
    await userEvent.click(body.getByRole("button", { name: "Skip tour" }));
    await expect(args.onClose).toHaveBeenCalled();
  },
};

export const AuthorViewAlreadyOn: Story = {
  args: { view: "author", stage: "author" },
  play: async ({ canvasElement }) => {
    const body = page(canvasElement);
    await expect(await body.findByText(/Author view is on for this chat\./)).toBeInTheDocument();
  },
};

export const InsideAModalDialog: Story = {
  args: { stage: "modal" },
  play: async ({ canvasElement, args }) => {
    const body = page(canvasElement);
    await waitFor(() => expect(coach(canvasElement)?.closest("dialog")?.id).toBe("story-modal-stage"));
    await waitFor(() => expect(coach(canvasElement)).toHaveAttribute("data-state", "found"));
    await userEvent.click(body.getByRole("button", { name: "Next" }));
    await expect(await body.findByRole("heading", { name: "Test the memory model" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await expect(args.onClose).toHaveBeenCalled();
    await expect((canvasElement.ownerDocument.getElementById("story-modal-stage") as HTMLDialogElement).open).toBe(true);
  },
};

export const PhoneSheet: Story = {
  parameters: { testViewport: VIEWPORTS.phone },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(coach(canvasElement)).toHaveAttribute("data-mode", "sheet"));
    await expect(coach(canvasElement)).toHaveAttribute("data-edge", "bottom");
    const card = coach(canvasElement).querySelector(".so-coach-card") as HTMLElement;
    const box = card.getBoundingClientRect();
    await expect(box.left).toBeGreaterThanOrEqual(0);
    await expect(box.right).toBeLessThanOrEqual(canvasElement.ownerDocument.documentElement.clientWidth);
  },
};

export const PhoneTargetLow: Story = {
  args: { view: "player", stop: "hud", stage: "low" },
  parameters: { testViewport: VIEWPORTS.phone },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(coach(canvasElement)).toHaveAttribute("data-state", "found"));
    await expect(coach(canvasElement)).toHaveAttribute("data-edge", "top");
  },
};
