import { couldNot, wrote, type WriteResult } from "@utils/writeResult";
import { log } from "@utils/log";
import { getContext } from "./context";
import { scriptModule } from "./modules";
import { trailingOwnRows } from "./ownRows";

export const REGENERATE_BUTTON = "option_regenerate";

type JQueryHandler = { handler: (...args: unknown[]) => unknown; namespace?: string };
type JQueryChain = {
  on: (events: string, handler: (...args: unknown[]) => unknown) => unknown;
  off: (events: string) => unknown;
  trigger: (event: string, args?: unknown[]) => unknown;
};
type JQueryStatic = ((target: unknown) => JQueryChain) & { _data?: (element: unknown, key: string) => { click?: JQueryHandler[] } | undefined };

export interface RegenerateDeps {
  enabled(): boolean;
  inGroup(): boolean;
  busy(): boolean;
  chat(): readonly unknown[];
  deleteLast(): Promise<void>;
  rerun(args: unknown[]): void;
  warn(message: string, detail?: unknown): void;
}

// A group Regenerate deletes back to the first system row from the end and stops there
// (group-chats.js:167-188), so a story note or picture left last would keep the old reply and add a
// new round under it. Our own rows go first; then ST's Regenerate runs unchanged.
export function regenerateClick(deps: RegenerateDeps, state: { passing: boolean }) {
  return (event: { stopImmediatePropagation(): void }, ...args: unknown[]): void => {
    if (state.passing || !deps.enabled() || !deps.inGroup() || deps.busy()) return;
    const count = trailingOwnRows(deps.chat());
    if (!count) return;
    event.stopImmediatePropagation();
    void (async () => {
      try {
        for (let index = 0; index < count && trailingOwnRows(deps.chat()) > 0; index += 1) await deps.deleteLast();
      } catch (error) {
        deps.warn("regenerate: a story row could not be removed before regenerating", error);
        return;
      }
      state.passing = true;
      try {
        deps.rerun(args);
      } finally {
        state.passing = false;
      }
    })();
  };
}

export function installGroupRegenerate(enabled: () => boolean, doc: Document = document): WriteResult<{ uninstall: () => void }> {
  const jquery = (globalThis as { jQuery?: JQueryStatic }).jQuery;
  const button = doc.getElementById(REGENERATE_BUTTON);
  if (!jquery || typeof jquery._data !== "function") return couldNot("this page has no jQuery event table to wrap Regenerate in");
  if (!button) return couldNot("SillyTavern's Regenerate menu entry is missing");
  const clicks = jquery._data(button, "events")?.click;
  if (!clicks?.length) return couldNot("SillyTavern's Regenerate entry has no click handler to run before");
  const ctx = getContext() as unknown as { deleteLastMessage?: () => Promise<void> };
  if (typeof ctx.deleteLastMessage !== "function") return couldNot("SillyTavern cannot delete the last message from an extension");
  const deleteLast = ctx.deleteLastMessage;
  const state = { passing: false };
  const click = regenerateClick({
    enabled,
    inGroup: () => Boolean(getContext().groupId),
    busy: () => { try { return scriptModule.isGenerating(); } catch { return true; } },
    chat: () => (Array.isArray(getContext().chat) ? getContext().chat : []),
    deleteLast: () => deleteLast(),
    rerun: (args) => { jquery(button).trigger("click", args); },
    warn: (message, detail) => log.warn(message, detail),
  }, state);
  jquery(button).on("click.soRegenerate", click as (...args: unknown[]) => unknown);
  const ours = clicks.findIndex((entry) => entry.namespace === "soRegenerate");
  if (ours > 0) clicks.unshift(...clicks.splice(ours, 1));
  if (clicks[0]?.namespace !== "soRegenerate") {
    jquery(button).off("click.soRegenerate");
    return couldNot("the Regenerate handler could not be placed before SillyTavern's own");
  }
  return wrote({ uninstall: () => { jquery(button).off("click.soRegenerate"); } });
}
