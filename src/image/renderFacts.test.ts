import { renderFacts, renderKey } from "./renderFacts";
import { CHECKPOINTS, FAMILIES, JANKU, WAI } from "./catalog";

const checkpoint = (file: string) => CHECKPOINTS.find((row) => row.file === file)!;
const facts = (over: Partial<Parameters<typeof renderFacts>[0]> = {}) => renderFacts({
  checkpoint: checkpoint(WAI), loras: [], family: FAMILIES["sdxl-illustrious"], aspect: "wide", quality: "base", ...over,
});

describe("render facts", () => {
  it("uses the base size and flags hires without changing the key", () => {
    const base = facts();
    expect(base).toMatchObject({ width: 1344, height: 768, hires: false, modelFiles: [{ kind: "checkpoints", name: WAI }] });
    const hires = facts({ quality: "hires" });
    expect(hires).toMatchObject({ width: 1344, height: 768, hires: true });
    expect(renderKey(hires)).not.toBe(renderKey(base));
  });

  it("changes the key with the model, the resolution or a lora", () => {
    const base = renderKey(facts());
    expect(renderKey(facts({ checkpoint: checkpoint(JANKU) }))).not.toBe(base);
    expect(renderKey(facts({ aspect: "portrait" }))).not.toBe(base);
    const lora = { entry: { file: "style.safetensors" } } as Parameters<typeof renderFacts>[0]["loras"][number];
    const withLora = facts({ loras: [lora] });
    expect(renderKey(withLora)).not.toBe(base);
    expect(withLora.modelFiles).toContainEqual({ kind: "loras", name: "style.safetensors" });
  });
});
