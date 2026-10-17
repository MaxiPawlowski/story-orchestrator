import { getContext } from "./context";
import { couldNot, wrote, type WriteResult } from "@utils/writeResult";

export type UserJsonRead = { ok: true; value: unknown } | { ok: false; reason: string };

const headers = (): Record<string, string> | null => {
  const context = getContext() as unknown as { getRequestHeaders?: () => Record<string, string> };
  return typeof context.getRequestHeaders === "function" ? context.getRequestHeaders() : null;
};

const base64 = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(binary);
};

export async function readUserJson(name: string): Promise<UserJsonRead> {
  try {
    const response = await fetch(`/user/files/${encodeURIComponent(name)}`, { cache: "no-store", headers: headers() ?? {} });
    if (response.status === 404) return { ok: true, value: null };
    if (!response.ok) return { ok: false, reason: `SillyTavern answered ${response.status} for ${name}` };
    return { ok: true, value: JSON.parse(await response.text()) as unknown };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

export async function writeUserJson(name: string, value: unknown): Promise<WriteResult<{ path: string }>> {
  const sent = headers();
  if (!sent) return couldNot("this SillyTavern build exposes no request headers");
  try {
    const response = await fetch("/api/files/upload", { method: "POST", headers: sent, body: JSON.stringify({ name, data: base64(JSON.stringify(value)) }) });
    if (!response.ok) return couldNot(`SillyTavern answered ${response.status} when saving ${name}`);
    const answer = (await response.json()) as { path?: unknown };
    return typeof answer.path === "string" ? wrote({ path: answer.path }) : couldNot(`SillyTavern did not say where ${name} was saved`);
  } catch (error) {
    return couldNot(error instanceof Error ? error.message : String(error));
  }
}
