import { parseStoryOrThrow, type NormalizedStory } from "@engine/index";
import { stampCreated, type CuratorOpRecord } from "@stagecraft/index";
import { CuratorWriter, FOREIGN_CREATED_REFUSAL } from "./curatorWriter";
import { createStagecraft } from "./extras";
import { mintToken, tokenMatches, type RunContext } from "./runToken";

const story = parseStoryOrThrow({
  id: "foreign", title: "Foreign", description: "",
  qualities: [{ key: "done", type: "bool", source: "extractor", rubric: "Done?" }],
  checkpoints: [{ id: "a", name: "A", objective: "", type: "anchor", start: true }],
  transitions: [],
  roster: [{ id: "mira", name: "Mira" }],
  stagecraft: { lorebooks: ["Story Lore"] },
}) as NormalizedStory;

const context: RunContext = { chatId: "chat-b", storyId: "foreign", storyHash: "h", sessionEpoch: 1, windowRevision: 0 };
const ownership = { mint: () => mintToken(context), check: (token: ReturnType<typeof mintToken>) => tokenMatches(context, token) };

const writerFor = (content: string) => {
  const writes: unknown[] = [];
  const host = {
    readWIEntryAt: async () => ({ uid: 7, comment: "Oskar", keys: ["Oskar"], content, disabled: false }),
    readWIEntry: async () => ({ uid: 7, comment: "Oskar", keys: ["Oskar"], content, disabled: false }),
    updateWIEntryByUid: async (...args: unknown[]) => { writes.push(args); return { ok: true }; },
  };
  let state = createStagecraft();
  const writer = new CuratorWriter({
    getStory: () => story, state: () => state, patch: (next) => { state = { ...state, ...next }; }, updateOps: () => undefined,
    save: async () => undefined, journal: () => undefined, ownership: () => ownership, host: () => host as never,
    owner: () => ({ chatId: "chat-b", groupId: null }),
  });
  return { writer, writes };
};

const rewrite: CuratorOpRecord = { op: { kind: "rewrite", lorebook: "Story Lore", comment: "Oskar", uid: 7, text: "Oskar now sells boats." }, status: "accepted" } as CuratorOpRecord;
const run = () => { const token = mintToken(context); return { stillOwns: () => tokenMatches(context, token), lapsed: () => !tokenMatches(context, token) } as never; };

test("61b: the write edge refuses to change an entry another chat created, and writes nothing", async () => {
  const foreign = writerFor(stampCreated("Oskar mends hulls for a silver.", { chatId: "chat-a", groupId: null }));
  const result = await foreign.writer.writeOp(story, rewrite, run(), 3, async () => undefined);
  expect(result).toMatchObject({ ok: false, record: { status: "failed", message: FOREIGN_CREATED_REFUSAL } });
  expect(foreign.writes).toHaveLength(0);
  const own = writerFor(stampCreated("Oskar mends hulls for a silver.", { chatId: "chat-b", groupId: null }));
  expect((await own.writer.writeOp(story, rewrite, run(), 3, async () => undefined)).record.message).not.toBe(FOREIGN_CREATED_REFUSAL);
});
