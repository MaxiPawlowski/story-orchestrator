import { getContext } from "./context";

export interface TextPopupOptions {
  okButton?: string;
  wide?: boolean;
}

export async function showTextPopup(content: string | HTMLElement, options: TextPopupOptions = {}): Promise<void> {
  const context = getContext() as unknown as {
    callGenericPopup?: (content: string | HTMLElement, type: number, inputValue?: string, popupOptions?: Record<string, unknown>) => Promise<unknown>;
    POPUP_TYPE?: { TEXT?: number };
  };
  if (typeof context.callGenericPopup !== "function") {
    console.warn("[Story Orchestrator] host has no callGenericPopup; popup suppressed");
    return;
  }
  const type = context.POPUP_TYPE?.TEXT ?? 1;
  await context.callGenericPopup(content, type, "", { okButton: options.okButton ?? "OK", wide: options.wide ?? false, allowVerticalScrolling: true });
}
