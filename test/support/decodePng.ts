import { inflateSync } from "node:zlib";
import type { PixelImage } from "../../src/sprites/builder/pixels";

const paeth = (a: number, b: number, c: number): number => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

export function decodePng(file: Uint8Array): PixelImage {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength), chunks: Uint8Array[] = [];
  let width = 0, height = 0, type = 0, offset = 8;
  while (offset < file.length) {
    const length = view.getUint32(offset), name = String.fromCharCode(...file.subarray(offset + 4, offset + 8)), body = file.subarray(offset + 8, offset + 8 + length);
    if (name === "IHDR") {
      width = view.getUint32(offset + 8); height = view.getUint32(offset + 12); type = body[9];
      if (body[8] !== 8 || body[12] !== 0 || (type !== 6 && type !== 2)) throw new Error("decodePng: only 8-bit RGB/RGBA, not interlaced");
    }
    if (name === "IDAT") chunks.push(body);
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(chunks)), channels = type === 6 ? 4 : 3, stride = width * channels;
  const rows = new Uint8Array(stride * height), data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), out = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? rows[out + x - channels] : 0, b = y ? rows[out - stride + x] : 0, c = x >= channels && y ? rows[out - stride + x - channels] : 0;
      rows[out + x] = (line[x] + (filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : filter === 4 ? paeth(a, b, c) : 0)) & 255;
    }
  }
  for (let k = 0; k < width * height; k++) {
    for (let c = 0; c < 3; c++) data[k * 4 + c] = rows[k * channels + c];
    data[k * 4 + 3] = channels === 4 ? rows[k * channels + 3] : 255;
  }
  return { width, height, data };
}
