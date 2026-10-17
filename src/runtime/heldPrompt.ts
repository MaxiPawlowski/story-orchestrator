export interface PromptWriter {
  setStoryExtensionPrompt: (key: string, text: string, depth: number) => unknown;
  clearStoryExtensionPrompt: (key: string) => unknown;
}

export const heldPrompt = (prompt: () => PromptWriter, spec: { readonly key: string; readonly depth: number }) => {
  let text: string | null = null;
  let shown = false;
  let held = false;
  return {
    show(next: string) {
      text = next;
      held = false;
      shown = true;
      prompt().setStoryExtensionPrompt(spec.key, next, spec.depth);
    },
    hold() {
      prompt().clearStoryExtensionPrompt(spec.key);
      held = held || shown;
      shown = false;
    },
    restore() {
      if (!held || text === null) return;
      held = false;
      shown = true;
      prompt().setStoryExtensionPrompt(spec.key, text, spec.depth);
    },
    clear() {
      held = false;
      text = null;
      if (!shown) return;
      shown = false;
      prompt().clearStoryExtensionPrompt(spec.key);
    },
  };
};
