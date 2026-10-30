export const HOLD_MS = 800;
export const RELEASE_MS = 150;

const decoded = (value: string): string => {
  try { return decodeURIComponent(value); } catch { return value; }
};

export function layerNamesAuthored(image: string, authored: readonly string[]): boolean {
  const url = decoded(image).toLowerCase();
  const file = url.replace(/^url\((['"]?)/, "").replace(/(['"]?)\)$/, "").split("/").pop() ?? "";
  return authored.some((name) => {
    const wanted = name.trim().toLowerCase();
    return Boolean(wanted) && (file === wanted || file.replace(/\.[^.]+$/, "") === wanted.replace(/\.[^.]+$/, ""));
  });
}
