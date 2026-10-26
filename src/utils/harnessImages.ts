export interface CompactableImage { data: string; mime?: string; description?: string }

export const HARNESS_IMAGE_CHARS = 1_400_000;
const JPEG_QUALITIES = [0.92, 0.85, 0.75, 0.6];

export type ImageEncoder = (image: CompactableImage, quality: number) => Promise<string>;

export async function jpegOverWhite(image: CompactableImage, quality: number): Promise<string> {
  const blob = await (await fetch(`data:${image.mime ?? "image/png"};base64,${image.data}`)).blob();
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot re-encode the image.");
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    return canvas.toDataURL("image/jpeg", quality).split(",")[1] ?? "";
  } finally { bitmap.close(); }
}

export async function compactHarnessImages<T extends CompactableImage>(images: T[], encode: ImageEncoder = jpegOverWhite, limit = HARNESS_IMAGE_CHARS): Promise<T[]> {
  return Promise.all(images.map(async (image) => {
    if (image.data.length <= limit) return image;
    let data = image.data;
    for (const quality of JPEG_QUALITIES) {
      data = await encode(image, quality);
      if (data.length <= limit) break;
    }
    const note = "re-encoded as JPEG at the same pixel size";
    return { ...image, data, mime: "image/jpeg", description: image.description ? `${image.description} (${note})` : note };
  }));
}
