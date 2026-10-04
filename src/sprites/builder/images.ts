import type { PixelImage, HeadBox } from "./pixels";
import { contentHash } from "./recipes";

export async function decodeImage(src: string): Promise<PixelImage> {
  const response = await fetch(src, { cache: "no-store" });
  if (!response.ok) throw new Error("The reference image could not be read.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 32 * 1024 * 1024) throw new Error("The reference image is too large.");
  const sha256 = await contentHash(bytes);
  const url = URL.createObjectURL(new Blob([bytes]));
  const image = new Image();
  image.src = url;
  try { await image.decode(); } finally { URL.revokeObjectURL(url); }
  if (image.naturalWidth * image.naturalHeight > 16_777_216) throw new Error("The reference image is too large.");
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser cannot read sprite pixels.");
  context.drawImage(image, 0, 0);
  return { width: canvas.width, height: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data, sha256 };
}

export function encodeImage(image: PixelImage): string {
  const canvas = document.createElement("canvas");
  canvas.width = image.width; canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot save sprite pixels.");
  context.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  return canvas.toDataURL("image/png").split(",")[1];
}

export async function cropReference(image: PixelImage, box: HeadBox): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = box.width; canvas.height = box.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot crop sprite pixels.");
  context.fillStyle = "white"; context.fillRect(0, 0, box.width, box.height);
  const bitmap = await createImageBitmap(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height));
  try { context.drawImage(bitmap, -box.x, -box.y); } finally { bitmap.close(); }
  return canvas.toDataURL("image/png").split(",")[1];
}

export function resizeEdit(image: PixelImage, box: HeadBox): PixelImage {
  const source = document.createElement("canvas"); source.width = image.width; source.height = image.height;
  source.getContext("2d")?.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  const canvas = document.createElement("canvas"); canvas.width = box.width; canvas.height = box.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser cannot resize sprite pixels.");
  context.drawImage(source, 0, 0, box.width, box.height);
  return { width: box.width, height: box.height, data: context.getImageData(0, 0, box.width, box.height).data };
}
