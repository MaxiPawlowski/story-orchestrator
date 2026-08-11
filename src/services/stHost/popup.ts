import { getContext } from "./context";

export interface TextPopupOptions {
  okButton?: string;
  wide?: boolean;
}

export interface ConfirmPopupOptions {
  okButton?: string;
  cancelButton?: string;
}

export async function showConfirmPopup(content: string, options: ConfirmPopupOptions = {}): Promise<boolean> {
  const context = getContext() as unknown as {
    callGenericPopup?: (content: string | HTMLElement, type: number, inputValue?: string, popupOptions?: Record<string, unknown>) => Promise<unknown>;
    POPUP_TYPE?: { CONFIRM?: number };
    POPUP_RESULT?: { AFFIRMATIVE?: number };
  } | undefined;
  if (typeof context?.callGenericPopup !== "function") {
    return window.confirm(content);
  }
  const type = context.POPUP_TYPE?.CONFIRM ?? 2;
  const affirmative = context.POPUP_RESULT?.AFFIRMATIVE ?? 1;
  const result = await context.callGenericPopup(content, type, "", { okButton: options.okButton ?? "OK", cancelButton: options.cancelButton ?? "Cancel" });
  return result === affirmative;
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
