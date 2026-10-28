import { compactHarnessImages } from "./harnessImages";

describe("harness images stay under the transport's message size", () => {
  it("keeps a small image untouched", async () => {
    const encode = jest.fn(async () => "x");
    const image = { data: "a".repeat(10), mime: "image/png", description: "bust" };
    expect(await compactHarnessImages([image], encode, 100)).toEqual([image]);
    expect(encode).not.toHaveBeenCalled();
  });

  it("re-encodes a large image as JPEG, stepping quality down until it fits, and says so", async () => {
    const sizes: Record<number, number> = { 0.92: 300, 0.85: 150, 0.75: 80, 0.6: 40 };
    const encode = jest.fn(async (_image: unknown, quality: number) => "j".repeat(sizes[quality]));
    const [out] = await compactHarnessImages([{ data: "p".repeat(500), mime: "image/png", description: "Accepted bust SHA256 abc" }], encode, 100);
    expect(encode.mock.calls.map((call) => call[1])).toEqual([0.92, 0.85, 0.75]);
    expect(out).toEqual({ data: "j".repeat(80), mime: "image/jpeg", description: "Accepted bust SHA256 abc (re-encoded as JPEG at the same pixel size)" });
  });
});
