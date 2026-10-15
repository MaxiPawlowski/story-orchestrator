import { headArtHash } from "@services/stHost/liveHeadAssets";
import { INSECURE_PAGE_MESSAGE, sha256Hex } from "./sha256";

const ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

describe("sha256Hex (B9)", () => {
  it("hashes bytes and buffers to lowercase hex", async () => {
    const bytes = new TextEncoder().encode("abc");
    expect(await sha256Hex(bytes)).toBe(ABC);
    expect(await sha256Hex(bytes.buffer.slice(0))).toBe(ABC);
  });

  it("on a page without crypto.subtle says to open a secure page instead of throwing a TypeError", async () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");
    Object.defineProperty(globalThis, "crypto", { value: {}, configurable: true });
    try {
      await expect(sha256Hex(new Uint8Array([1]))).rejects.toThrow(INSECURE_PAGE_MESSAGE);
      await expect(headArtHash(new Uint8Array([1]).buffer)).rejects.toThrow(INSECURE_PAGE_MESSAGE);
    } finally {
      if (descriptor) Object.defineProperty(globalThis, "crypto", descriptor);
    }
  });
});
