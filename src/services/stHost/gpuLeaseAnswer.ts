import { isRecord } from "@utils/guards";
import { couldNot, wrote, type WriteResult } from "@utils/writeResult";

export const releaseAnswer = (ok: boolean, data: unknown): WriteResult<{ released: boolean }> => {
  if (!ok || !isRecord(data) || typeof data.released !== "boolean") return couldNot("The GPU broker did not release the image lease.");
  return wrote({ released: data.released });
};
