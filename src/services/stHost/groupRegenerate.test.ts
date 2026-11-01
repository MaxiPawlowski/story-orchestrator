/**
 * @jest-environment jsdom
 */
const host = { chat: [] as unknown[], groupId: "g1" as string | null, generating: false, posted: true };
const deleteLastMessage = jest.fn(async () => { host.chat.pop(); });

jest.mock("./context", () => ({ getContext: () => ({ chat: host.chat, groupId: host.groupId, deleteLastMessage }) }));
jest.mock("./modules", () => ({ scriptModule: { isGenerating: () => host.generating } }));
jest.mock("./slashCommands", () => ({
  executeSlashCommands: async (command: string) => {
    if (!host.posted) return false;
    host.chat.push({ name: "System", is_system: true, is_user: false, mes: command.replace(/^\/comment compact=true raw=false /, ""), extra: { type: "comment" } });
    return true;
  },
}));

import { installGroupRegenerate } from "./groupRegenerate";
import { isOwnRow, markOwnRows, postOwnComment, trailingOwnRows } from "./ownRows";

const reply = (gen: number, mes = "reply") => ({ name: "Arin", is_user: false, is_system: false, mes, extra: { gen_id: gen } });
const player = { name: "You", is_user: true, is_system: false, mes: "hi", extra: {} };
const note = { name: "System", is_user: false, is_system: true, mes: "◈ Dawn", extra: { type: "comment", so_row: "note" } };
const picture = { name: "Image Director", is_user: false, is_system: true, mes: "", extra: { media: [], so_row: "image" } };
const foreign = { name: "System", is_user: false, is_system: true, mes: "a comment the player typed", extra: { type: "comment" } };

// group-chats.js:167-188, the loop ST's group Regenerate runs before a new round.
async function stRegenerateGroup(): Promise<string> {
  const last = host.chat[host.chat.length - 1] as { is_user: boolean; is_system: boolean; extra?: { gen_id?: number } } | undefined;
  const generationId = last && !last.is_user && !last.is_system ? last.extra?.gen_id : undefined;
  while (host.chat.length > 0) {
    const row = host.chat[host.chat.length - 1] as { is_user: boolean; is_system: boolean; extra?: { gen_id?: number } };
    if (generationId && row.extra?.gen_id && generationId !== row.extra.gen_id) break;
    if (row.is_user || row.is_system) break;
    await deleteLastMessage();
  }
  return "new round";
}

type Handler = { handler: (event: FakeEvent, ...args: unknown[]) => unknown; namespace?: string };
class FakeEvent { stopped = false; stopImmediatePropagation() { this.stopped = true; } }

const fakeJQuery = () => {
  const table = new WeakMap<object, { click: Handler[] }>();
  const events = (element: object) => { if (!table.has(element)) table.set(element, { click: [] }); return table.get(element) as { click: Handler[] }; };
  const $ = (element: object) => ({
    on: (name: string, handler: Handler["handler"]) => { events(element).click.push({ handler, namespace: name.split(".")[1] }); },
    off: (name: string) => { const list = events(element).click; for (let i = list.length - 1; i >= 0; i -= 1) if (list[i]?.namespace === name.split(".")[1]) list.splice(i, 1); },
    trigger: (_name: string, args: unknown[] = []) => {
      const event = new FakeEvent();
      for (const entry of [...events(element).click]) { entry.handler(event, ...args); if (event.stopped) break; }
    },
  });
  $._data = (element: object, _key: string) => events(element);
  return $;
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("group Regenerate after the story's own trailing rows (v3.0 43 T, owner 2026-11-01)", () => {
  let rounds: string[] = [];
  let uninstall: () => void = () => undefined;
  let $: ReturnType<typeof fakeJQuery>;
  let enabled = true;
  const click = () => $(document.getElementById("option_regenerate") as HTMLElement).trigger("click");

  beforeEach(() => {
    document.body.innerHTML = "<div id=\"options\"><a id=\"option_regenerate\"></a></div>";
    host.chat = []; host.groupId = "g1"; host.generating = false; host.posted = true; enabled = true; rounds = [];
    deleteLastMessage.mockClear();
    $ = fakeJQuery();
    (globalThis as { jQuery?: unknown }).jQuery = $;
    const button = document.getElementById("option_regenerate") as HTMLElement;
    $(button).on("click", () => { void stRegenerateGroup().then((round) => rounds.push(round)); });
    const installed = installGroupRegenerate(() => enabled);
    if (!installed.ok) throw new Error(installed.reason);
    uninstall = installed.uninstall;
  });
  afterEach(() => { uninstall(); delete (globalThis as { jQuery?: unknown }).jQuery; });

  it("regression: ST alone keeps the reply under a trailing story note and adds a round below it", async () => {
    uninstall();
    host.chat = [player, reply(7), note];
    click();
    await flush();
    expect(host.chat).toEqual([player, reply(7), note]);
    expect(rounds).toEqual(["new round"]);
  });

  it("removes the story's trailing note and picture, then ST deletes the reply and regenerates it", async () => {
    host.chat = [player, reply(7, "a"), reply(7, "b"), note, picture];
    click();
    await flush();
    await flush();
    expect(host.chat).toEqual([player]);
    expect(deleteLastMessage).toHaveBeenCalledTimes(4);
    expect(rounds).toEqual(["new round"]);
  });

  it("leaves ST's own behaviour alone for a foreign system row, a solo chat, while generating and when switched off", async () => {
    for (const setup of [
      () => { host.chat = [player, reply(7), foreign]; },
      () => { host.chat = [player, reply(7), note]; host.groupId = null; },
      () => { host.chat = [player, reply(7), note]; host.generating = true; },
      () => { host.chat = [player, reply(7), note]; enabled = false; },
    ]) {
      host.groupId = "g1"; host.generating = false; enabled = true; rounds = []; deleteLastMessage.mockClear();
      setup();
      const before = [...host.chat];
      click();
      await flush();
      expect(host.chat).toEqual(before);
      expect(rounds).toEqual(["new round"]);
    }
  });

  it("our handler runs before ST's even when installed after it", () => {
    const button = document.getElementById("option_regenerate") as HTMLElement;
    expect($._data(button, "events").click.map((entry: Handler) => entry.namespace)).toEqual(["soRegenerate", undefined]);
  });

  it("marks the note row /comment posted, and only system rows from that point", async () => {
    host.chat = [player, reply(7)];
    expect(await postOwnComment("◈ Dawn")).toEqual({ ok: true, marked: 1 });
    expect(isOwnRow(host.chat[2])).toBe(true);
    expect(trailingOwnRows(host.chat)).toBe(1);
    host.posted = false;
    expect(await postOwnComment("◈ Night")).toMatchObject({ ok: false });
    const rows: unknown[] = [foreign, reply(1)];
    expect(markOwnRows(rows, 1, "image")).toBe(0);
    expect(isOwnRow(rows[0])).toBe(false);
  });

  it("refuses to install without ST's handler or delete seam", () => {
    uninstall();
    document.body.innerHTML = "<a id=\"option_regenerate\"></a>";
    expect(installGroupRegenerate(() => true)).toMatchObject({ ok: false, reason: expect.stringContaining("no click handler") });
    document.body.innerHTML = "";
    expect(installGroupRegenerate(() => true)).toMatchObject({ ok: false, reason: expect.stringContaining("missing") });
  });
});
