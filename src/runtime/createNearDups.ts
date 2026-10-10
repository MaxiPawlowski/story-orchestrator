import { CREATE_NEAR_DUP_VECTOR_BANDS, nearDupText, vectorNearDups, type CuratorEntryView, type NearDup, type NearDupSubject } from "@stagecraft/index";
import { log } from "@utils/log";
import type { VectorHost } from "./hostPorts";

export async function createNearDups(host: VectorHost, subjects: NearDupSubject[], entries: CuratorEntryView[]): Promise<NearDup[][] | null> {
  if (!subjects.length || !entries.length) return null;
  if ((await host.capabilityState("vectors")) === "absent") return null;
  const collectionId = `so_create_${String(Date.now())}_${String(Math.floor(Math.random() * 1e6))}`;
  try {
    await host.vectorInsert(collectionId, entries.map((entry, index) => ({ hash: index, text: nearDupText(entry), index })), host.source);
    const near = async (text: string, threshold: number) => new Set((await host.vectorQuery(collectionId, text, entries.length, threshold, host.source)).map((match) => match.index));
    const found: NearDup[][] = [];
    for (const subject of subjects) {
      const text = nearDupText(subject);
      found.push(vectorNearDups(entries, await near(text, CREATE_NEAR_DUP_VECTOR_BANDS.duplicate), await near(text, CREATE_NEAR_DUP_VECTOR_BANDS.sameTopic)));
    }
    return found;
  } catch (error) {
    log.warn("stagecraft: vector near-duplicate check unavailable, using wording", error);
    return null;
  } finally {
    try {
      await host.vectorPurge(collectionId);
    } catch (error) {
      log.warn("stagecraft: the temporary vector collection could not be purged", error);
    }
  }
}
