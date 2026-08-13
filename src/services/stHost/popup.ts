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

export interface ChoicePopupOptions<T extends string> {
  okButton: { id: T; label: string };
  cancelButton?: string;
  choices?: Array<{ id: T; label: string }>;
}

// Three-way decisions (plan 05's invalidation flow) need more than confirm/cancel. ST's popup
// takes `customButtons` whose results start at 2 (popup.js:288-290) alongside the built-in
// AFFIRMATIVE=1 / NEGATIVE=0 / CANCELLED=null (popup.js:24-27).
export async function showChoicePopup<T extends string>(content: string | HTMLElement, options: ChoicePopupOptions<T>): Promise<T | null> {
  const context = getContext() as unknown as {
    callGenericPopup?: (content: string | HTMLElement, type: number, inputValue?: string, popupOptions?: Record<string, unknown>) => Promise<unknown>;
    POPUP_TYPE?: { CONFIRM?: number };
    POPUP_RESULT?: { AFFIRMATIVE?: number };
  } | undefined;
  const choices = options.choices ?? [];
  if (typeof context?.callGenericPopup !== "function") {
    return window.confirm(typeof content === "string" ? content : options.okButton.label) ? options.okButton.id : null;
  }
  const affirmative = context.POPUP_RESULT?.AFFIRMATIVE ?? 1;
  const result = await context.callGenericPopup(content, context.POPUP_TYPE?.CONFIRM ?? 2, "", {
    okButton: options.okButton.label,
    cancelButton: options.cancelButton ?? "Cancel",
    customButtons: choices.map((choice, index) => ({ text: choice.label, result: index + 2 })),
    allowVerticalScrolling: true,
  });
  if (result === affirmative) return options.okButton.id;
  return typeof result === "number" && result >= 2 ? choices[result - 2]?.id ?? null : null;
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
