jest.mock("@services/STAPI", () => ({ loadLorebook: jest.fn(), profileExists: () => true }));

import { curatorDigestRunner } from "./liveSuite";
import { recordingModel } from "../../test/support/modelCall";
import type { CuratorCalibrationCase } from "./roleCalibration";

const padBook = { entries: Object.fromEntries(Array.from({ length: 60 }, (_, uid) => [uid, { uid, comment: `Pad ${uid}`, content: `Filler text ${uid}.`, key: [`pad${uid}`], disable: false }])) };

const entry: CuratorCalibrationCase = {
  id: "x01", lang: "en", label: "change",
  scope: { storyTitle: "S", checkpointName: "The Tunnel", objective: "Cross the tunnel.", canon: "They entered the tunnel.", openArcs: [],
    entries: [{ lorebook: "Hills Lore", comment: "The Old Tunnel", keys: ["tunnel"], content: "A collapsed tunnel.", disabled: true }] },
  required: [{ comment: "The Old Tunnel", kinds: ["enable"] }], forbidden: [],
};

describe("v2.5 plan 09 SP8 W4 (b) harness: a calibration case padded with a real book and prompted through the digest", () => {
  it("pads, digests, prompts the curator role and scores with the title-only refusal", async () => {
    const model = recordingModel(() => "[enable] The Old Tunnel\n[rewrite] #7 || New text.\n[why] they went in");
    const record = await curatorDigestRunner(model, async () => padBook as never)(entry, "Pads");
    expect(model.calls[0].ask.role).toBe("curator");
    expect(model.calls[0].prompt).toContain("OTHER ENTRIES (title only");
    expect(record.digest).toMatchObject({ padBook: "Pads", entries: 61, full: 1, titleOnly: 60 });
    expect(record.digest.ratio).toBeLessThan(1);
    expect(record.score).toMatchObject({ valid: true, opLines: 2, survived: 1, decision: true });
    expect(record.score.dropped.some((reason) => reason.includes("only the title of this entry was shown"))).toBe(true);
  });

  it("refuses a pad book that does not exist or does not reach the digest threshold", async () => {
    const model = recordingModel(() => "NONE");
    await expect(curatorDigestRunner(model, async () => null)(entry, "Missing")).rejects.toThrow('no lorebook named "Missing"');
    await expect(curatorDigestRunner(model, async () => ({ entries: {} }) as never)(entry, "Tiny")).rejects.toThrow("below the digest threshold");
  });
});
