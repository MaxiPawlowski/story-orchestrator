import type { PixelImage } from "../../builder/pixels";

export async function decodeBytes(bytes: Uint8Array, signal: AbortSignal): Promise<PixelImage> {
  signal.throwIfAborted();
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
  try {
    signal.throwIfAborted();
    if (bitmap.width * bitmap.height > 16_777_216) throw new Error("The bust is too large.");
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("This browser cannot read bust pixels.");
    context.drawImage(bitmap, 0, 0);
    return { width: canvas.width, height: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data };
  } finally { bitmap.close(); }
}
