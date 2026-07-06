import { popupModule } from "./modules";

const POPUP_TYPE_TEXT = 1;

export interface TextPopupOptions {
  okButton?: string;
  wide?: boolean;
}

export async function showTextPopup(content: string | HTMLElement, options: TextPopupOptions = {}): Promise<void> {
  const popup = popupModule as unknown as { callGenericPopup?: (content: string | HTMLElement, type: number, inputValue?: string, popupOptions?: Record<string, unknown>) => Promise<unknown> };
  if (typeof popup.callGenericPopup !== "function") {
    console.warn("[Story Orchestrator] host has no callGenericPopup; popup suppressed");
    return;
  }
  await popup.callGenericPopup(content, POPUP_TYPE_TEXT, "", { okButton: options.okButton ?? "OK", wide: options.wide ?? false, allowVerticalScrolling: true });
}
