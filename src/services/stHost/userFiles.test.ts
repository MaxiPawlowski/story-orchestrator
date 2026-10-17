jest.mock("./context", () => ({ getContext: () => ({ getRequestHeaders: () => ({ "X-CSRF-Token": "t" }) }) }));

import { readUserJson, writeUserJson } from "./userFiles";

const respond = (status: number, body: string) => ({ ok: status >= 200 && status < 300, status, text: async () => body, json: async () => JSON.parse(body) });

describe("stHost userFiles (plan 69 K3)", () => {
  afterEach(() => { delete (globalThis as { fetch?: unknown }).fetch; });

  it("a missing file reads as null, an error as a refusal", async () => {
    (globalThis as { fetch?: unknown }).fetch = jest.fn(async () => respond(404, "Not found"));
    expect(await readUserJson("so-library-index.json")).toEqual({ ok: true, value: null });
    (globalThis as { fetch?: unknown }).fetch = jest.fn(async () => respond(500, ""));
    expect((await readUserJson("so-library-index.json")).ok).toBe(false);
  });

  it("writes UTF-8 JSON as base64 through the files upload and answers where it landed", async () => {
    const fetch = jest.fn(async (_url: string, _init?: { body?: string }) => respond(200, JSON.stringify({ path: "user/files/so-library-index.json" })));
    (globalThis as { fetch?: unknown }).fetch = fetch;
    expect(await writeUserJson("so-library-index.json", { title: "Café — ☕" })).toEqual({ ok: true, path: "user/files/so-library-index.json" });
    const body = JSON.parse(String(fetch.mock.calls[0][1]?.body)) as { name: string; data: string };
    expect(fetch.mock.calls[0][0]).toBe("/api/files/upload");
    expect(body.name).toBe("so-library-index.json");
    expect(JSON.parse(Buffer.from(body.data, "base64").toString("utf8"))).toEqual({ title: "Café — ☕" });
  });

  it("a refused upload is a refused write", async () => {
    (globalThis as { fetch?: unknown }).fetch = jest.fn(async () => respond(400, "Illegal"));
    expect((await writeUserJson("x.json", {})).ok).toBe(false);
  });
});
