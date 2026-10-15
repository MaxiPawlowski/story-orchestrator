export const INSECURE_PAGE_MESSAGE = "Open SillyTavern on localhost or HTTPS: the browser computes file fingerprints only on a secure page.";

export async function sha256Hex(bytes: ArrayBuffer | Uint8Array, insecure: string = INSECURE_PAGE_MESSAGE): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error(insecure);
  const digest = await subtle.digest("SHA-256", bytes instanceof Uint8Array ? new Uint8Array(bytes) : bytes);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}
