import { cardLines, jobLine, readModelRef } from "./downloadCopy";

const card = {
  id: "p1", provider: "civitai" as const, name: "ink.safetensors", sha256: "a".repeat(64), sizeBytes: 228 * 1024 ** 2, kind: "loras", baseModel: "Illustrious", nsfw: true,
  termsUrl: "https://civitai.com/models/1", source: "Civitai Ink · v1", root: "/models/loras", folders: ["/models/loras"], present: false,
  freeBytes: 1024 ** 3, marginBytes: 2 * 1024 ** 3, fits: false, resumeFromBytes: 0,
};

describe("v2.8 30: model download cards", () => {
  it("reads a version id from a number or a Civitai link, and a Hugging Face repo and file", () => {
    expect(readModelRef("civitai", { version: "https://civitai.com/models/1?modelVersionId=4242", repo: "", file: "", revision: "" })).toEqual({ versionId: 4242 });
    expect(readModelRef("civitai", { version: "4242", repo: "", file: "", revision: "" })).toEqual({ versionId: 4242 });
    expect(readModelRef("civitai", { version: "abc", repo: "", file: "", revision: "" })).toMatch(/version id/);
    expect(readModelRef("huggingface", { version: "", repo: "org/model", file: "m.safetensors", revision: "" })).toEqual({ repo: "org/model", file: "m.safetensors" });
    expect(readModelRef("huggingface", { version: "", repo: "https://huggingface.co/org/model", file: "m", revision: "" })).toMatch(/owner\/name/);
  });

  it("states size, source, folder, the space shortfall and an adult-content flag", () => {
    const lines = cardLines(card);
    expect(lines[0]).toBe("ink.safetensors · 0.22 GiB");
    expect(lines).toContain("Into /models/loras (loras)");
    expect(lines.join("\n")).toMatch(/Not enough space there: 1.00 GiB free/);
    expect(lines).toContain("The source marks this model as adult content.");
    expect(cardLines({ ...card, fits: true, nsfw: false }).join("\n")).toMatch(/Free there/);
  });

  it("says what happened to a download", () => {
    const job = { id: "j", planId: "p1", name: "ink.safetensors", root: "/m", state: "running", bytes: 50, total: 200, error: null };
    expect(jobLine(job)).toBe("ink.safetensors: running 25%");
    expect(jobLine({ ...job, state: "cancelled" })).toMatch(/resumes next time/);
    expect(jobLine({ ...job, state: "failed", error: "did not match its SHA256" })).toMatch(/failed. did not match/);
  });
});
