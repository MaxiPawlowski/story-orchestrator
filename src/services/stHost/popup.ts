import { getContext } from "./context";
import { log } from "@utils/log";

interface PopupHost {
  callGenericPopup?: (content: string | HTMLElement, type: number, inputValue?: string, popupOptions?: Record<string, unknown>) => Promise<unknown>;
  POPUP_TYPE?: { CONFIRM?: number; TEXT?: number };
  POPUP_RESULT?: { AFFIRMATIVE?: number; NEGATIVE?: number };
}

const popupHost = (): PopupHost | undefined => getContext() as unknown as PopupHost | undefined;

export interface TextPopupOptions {
  okButton?: string;
  wide?: boolean;
}

export interface ConfirmPopupOptions {
  okButton?: string;
  cancelButton?: string;
  safeDefault?: boolean;
}

export type ConfirmAnswer = "confirmed" | "declined" | "dismissed";

const defaultResultFor = (context: PopupHost, safeDefault: boolean | undefined) =>
  (safeDefault ? { defaultResult: context.POPUP_RESULT?.NEGATIVE ?? 0 } : {});

export async function askConfirm(content: PopupContent, options: ConfirmPopupOptions = {}): Promise<ConfirmAnswer> {
  const context = popupHost();
  if (typeof context?.callGenericPopup !== "function") {
    return window.confirm(plainText(content)) ? "confirmed" : "declined";
  }
  const type = context.POPUP_TYPE?.CONFIRM ?? 2;
  const affirmative = context.POPUP_RESULT?.AFFIRMATIVE ?? 1;
  const negative = context.POPUP_RESULT?.NEGATIVE ?? 0;
  const result = await context.callGenericPopup(asContentNode(content), type, "", {
    okButton: options.okButton ?? "OK",
    cancelButton: options.cancelButton ?? "Cancel",
    ...defaultResultFor(context, options.safeDefault),
  });
  if (result === affirmative) return "confirmed";
  return result === negative ? "declined" : "dismissed";
}

export async function showConfirmPopup(content: PopupContent, options: ConfirmPopupOptions = {}): Promise<boolean> {
  return (await askConfirm(content, options)) === "confirmed";
}

export interface ChoicePopupOptions<T extends string> {
  okButton: { id: T; label: string };
  cancelButton?: string;
  choices?: Array<{ id: T; label: string }>;
  safeDefault?: boolean;
}

// A caller that needs markup builds it from the document it is handed, so what
// it interpolates is a text node at the point of construction. A plain string is content, not
// markup: it is escaped through one, because the host assigns string content to innerHTML
// (popup.js:534) and the strings this popup shows include authored story titles.
export type PopupContent = string | HTMLElement | ((doc: Document) => HTMLElement);

export const asContentNode = (content: PopupContent): HTMLElement => {
  if (typeof content === "function") return content(document);
  if (typeof content !== "string") return content;
  const holder = document.createElement("div");
  holder.textContent = content;
  return holder;
};

const plainText = (content: PopupContent): string => (typeof content === "string" ? content : asContentNode(content).textContent ?? "");

// Three-way decisions (invalidation flow) need more than confirm/cancel. ST's popup
// takes `customButtons` whose results start at 2 (popup.js:288-290) alongside the built-in
// AFFIRMATIVE=1 / NEGATIVE=0 / CANCELLED=null (popup.js:24-27).
export async function showChoicePopup<T extends string>(content: PopupContent, options: ChoicePopupOptions<T>): Promise<T | null> {
  const context = popupHost();
  const choices = options.choices ?? [];
  if (typeof context?.callGenericPopup !== "function") {
    return window.confirm(plainText(content) || options.okButton.label) ? options.okButton.id : null;
  }
  const affirmative = context.POPUP_RESULT?.AFFIRMATIVE ?? 1;
  const result = await context.callGenericPopup(asContentNode(content), context.POPUP_TYPE?.CONFIRM ?? 2, "", {
    okButton: options.okButton.label,
    cancelButton: options.cancelButton ?? "Cancel",
    customButtons: choices.map((choice, index) => ({ text: choice.label, result: index + 2 })),
    allowVerticalScrolling: true,
    ...defaultResultFor(context, options.safeDefault),
  });
  if (result === affirmative) return options.okButton.id;
  return typeof result === "number" && result >= 2 ? choices[result - 2]?.id ?? null : null;
}

export interface TextPopupHandle {
  /** Close this popup if it is still the one on screen. A no-op once it is gone. */
  close: () => void;
}

/**
 * A TEXT popup, plus a handle that can take it back down.
 *
 * v2.3 plan 03. The handle walks up from an anchor node this call owns, so it can only ever reach
 * the dialog this call opened — never a popup somebody else put on screen in the meantime. The
 * host's `[data-result]` controls complete the popup when clicked (popup.js:546), and the ok
 * button carries result 1, so a click is the supported close path.
 */
export function showTextPopup(content: PopupContent, options: TextPopupOptions = {}): TextPopupHandle {
  const context = popupHost();
  if (typeof context?.callGenericPopup !== "function") {
    log.warn("host has no callGenericPopup; popup suppressed");
    return { close: () => undefined };
  }
  const type = context.POPUP_TYPE?.TEXT ?? 1;
  const anchor = document.createElement("div");
  anchor.className = "so-popup-anchor";
  anchor.append(asContentNode(content));
  void context.callGenericPopup(anchor, type, "", { okButton: options.okButton ?? "OK", wide: options.wide ?? false, allowVerticalScrolling: true });
  return {
    close: () => {
      const dialog = anchor.closest("dialog.popup");
      (dialog?.querySelector(".popup-button-ok") as HTMLElement | null)?.click();
    },
  };
}
