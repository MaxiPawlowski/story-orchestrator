import { getContext } from "./context";
import { scriptModule } from "./modules";

export function isHostGenerating(): boolean {
  return Boolean(scriptModule.isGenerating());
}

export const hostSystemUserName: string = scriptModule.systemUserName;

const NO_ATTACH_TYPES = ["regenerate", "swipe", "impersonate", "quiet", "continue"];
const NO_TEXTAREA_TYPES = ["regenerate", "swipe", "quiet", "impersonate"];

// v2.2 plan 04: will this Generate() add a player message before its World Info scan? Mirrors
// script.js:4399-4401 (which types read #send_textarea), :4448 (text or a pending attachment, not
// automatic, not quiet, not a dry run) and :4455 (chat completion `send_if_empty`), read at
// GENERATION_STARTED, which fires before the box is read (:4299). The `depth` retry and a bias-only
// message (sent as a system message) are not visible here; both answer false.
export function willAddUserMessage(type: string | undefined, params: Record<string, unknown> | undefined, dryRun: boolean | undefined): boolean {
  if (dryRun || params?.automatic_trigger || type === "quiet") return false;
  const box = NO_TEXTAREA_TYPES.includes(type ?? "") ? null : document.getElementById("send_textarea");
  const text = box instanceof HTMLTextAreaElement ? box.value : "";
  const files = document.getElementById("file_form_input");
  const attachment = files instanceof HTMLInputElement && (files.files?.length ?? 0) > 0 && !NO_ATTACH_TYPES.includes(type ?? "");
  if (text !== "" || attachment) return true;
  const context = getContext();
  return (type === undefined || type === "normal") && context.mainApi === "openai" && Boolean(context.chatCompletionSettings?.send_if_empty?.trim());
}
