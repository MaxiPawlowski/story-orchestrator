import type { PixelImage } from "../../builder/pixels";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array): number => {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const u32 = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];

function chunk(type: string, body: Uint8Array): Uint8Array {
  const head = new Uint8Array([...type].map((char) => char.charCodeAt(0)));
  const typed = new Uint8Array(head.length + body.length);
  typed.set(head); typed.set(body, head.length);
  const out = new Uint8Array(12 + body.length);
  out.set(u32(body.length)); out.set(typed, 4); out.set(u32(crc32(typed)), 8 + body.length);
  return out;
}

function storedZlib(raw: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(raw.length / 65535)), out = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  out[0] = 0x78; out[1] = 0x01;
  let at = 2, a = 1, b = 0;
  for (let i = 0; i < blocks; i++) {
    const start = i * 65535, size = Math.min(65535, raw.length - start);
    out[at++] = i === blocks - 1 ? 1 : 0;
    out[at++] = size & 0xff; out[at++] = size >>> 8; out[at++] = ~size & 0xff; out[at++] = (~size >>> 8) & 0xff;
    out.set(raw.subarray(start, start + size), at); at += size;
  }
  for (const byte of raw) { a = (a + byte) % 65521; b = (b + a) % 65521; }
  out.set(u32(((b << 16) | a) >>> 0), at);
  return out;
}

export function encodePngStored(image: PixelImage): Uint8Array {
  const { width, height } = image, raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) raw.set(image.data.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  const header = new Uint8Array([...u32(width), ...u32(height), 8, 6, 0, 0, 0]);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", storedZlib(raw)), chunk("IEND", new Uint8Array())];
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}

export function base64(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}
