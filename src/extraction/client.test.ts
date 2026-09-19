import { sendConnectionProfileRequest } from "@services/STAPI";
import { callExtractionModel } from "./client";
import { parseSharedReadResponse } from "./parse";

jest.mock("@services/STAPI", () => ({ sendConnectionProfileRequest: jest.fn() }));

const story = { qualityByKey: { door_open: { key: "door_open", type: "bool" as const } } } as unknown as Parameters<typeof parseSharedReadResponse>[1];

describe("callExtractionModel", () => {
  it("strips inline reasoning from a profile reply before any pass parses it", async () => {
    (sendConnectionProfileRequest as jest.Mock).mockResolvedValueOnce("<think>\nDELTA q=door_open value=false evidence=\"guess\"\n</think>\nDELTA q=door_open value=true evidence=\"the door swings open\"");
    const raw = await callExtractionModel("prompt", { profileId: "p1" });
    expect(parseSharedReadResponse(raw, story).deltas.map((entry) => entry.delta.v)).toEqual([true]);
  });

  it("strips debug responses the same way", async () => {
    expect(await callExtractionModel("prompt", { profileId: null, debugResponse: "<think>draft</think>{\"ops\": []}" })).toBe("{\"ops\": []}");
  });

  it("returns an empty reply when the model only reasoned", async () => {
    (sendConnectionProfileRequest as jest.Mock).mockResolvedValueOnce("<think>\nThe scene opens in the ruins and");
    expect(await callExtractionModel("prompt", { profileId: "p1" })).toBe("");
  });
});
