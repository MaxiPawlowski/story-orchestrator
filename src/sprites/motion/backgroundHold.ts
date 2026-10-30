export const HOLD_MS = 800;
export const RELEASE_MS = 150;

const stem = (file: string): string => file.replace(/\.[^.]+$/, "");

export function layerNamesAuthored(image: string, authored: readonly string[]): boolean {
  const file = (image.replace(/^url\((['"]?)/, "").replace(/(['"]?)\)$/, "").split("/").pop() ?? "").toLowerCase();
  return authored.some((name) => {
    const wanted = name.trim().toLowerCase();
    if (!wanted) return false;
    return [wanted, encodeURIComponent(wanted).toLowerCase()].some((form) => file === form || stem(file) === stem(form));
  });
}
