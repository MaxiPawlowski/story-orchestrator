export function onLorebookListChanged(handler: () => void): () => void {
  const select = globalThis.document?.querySelector<HTMLSelectElement>("#world_info");
  if (!select || typeof globalThis.MutationObserver !== "function") return () => {};
  const names = () => JSON.stringify([...select.options].filter((option) => option.value !== "").map((option) => option.text).sort());
  let previous = names();
  const observer = new MutationObserver(() => {
    const current = names();
    if (current === previous) return;
    previous = current;
    handler();
  });
  observer.observe(select, { childList: true, subtree: true, characterData: true });
  return () => observer.disconnect();
}
