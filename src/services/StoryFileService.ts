import { extensionDirectoryName } from "@constants/main";

export type SaveStoryFileResponse =
  | { ok: true; fileName: string; overwrite: boolean; warning?: string }
  | { ok: false; error: string };

export interface SaveStoryFileOptions {
  overwrite?: boolean;
  global?: boolean;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

const parseErrorResponse = async (response: Response): Promise<string> => {
  const text = await response.text();
  if (!text) return `${response.status} ${response.statusText}`;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && "error" in parsed) {
      const value = (parsed as { error?: string }).error;
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
  } catch {
    // not json, fall back to text
  }
  return text;
};

export async function saveStoryFile(
  fileName: string,
  story: unknown,
  options: SaveStoryFileOptions = {},
): Promise<SaveStoryFileResponse> {
  try {
    const response = await fetch("/api/extensions/story-files/save", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        extensionName: extensionDirectoryName,
        global: Boolean(options.global),
        fileName,
        story,
        overwrite: Boolean(options.overwrite),
      }),
    });

    if (!response.ok) {
      const error = await parseErrorResponse(response);
      return { ok: false, error };
    }

    const payload = await response.json().catch(() => ({}));
    const safeFileName =
      typeof payload?.fileName === "string" && payload.fileName.trim()
        ? payload.fileName.trim()
        : fileName;

    return {
      ok: true,
      fileName: safeFileName,
      overwrite: Boolean(payload?.overwrite),
      warning: typeof payload?.warning === "string" ? payload.warning : undefined,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { ok: false, error: message };
  }
}
