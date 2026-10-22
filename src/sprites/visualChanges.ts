const listeners = new Set<() => void>();
export function subscribeVisualSources(listener: () => void): () => void {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
export function visualSourceAccepted(): void { for (const listener of listeners) listener(); }
const fileListeners = new Set<() => void>();
export function subscribeSpriteFiles(listener: () => void): () => void {
  fileListeners.add(listener); return () => { fileListeners.delete(listener); };
}
export function spriteFilesSaved(): void { for (const listener of fileListeners) listener(); }
