export type Cover = [number, number, number, number];

export const coverTransform = (imageWidth: number, imageHeight: number, viewWidth: number, viewHeight: number): Cover => {
  if (imageWidth <= 0 || imageHeight <= 0 || viewWidth <= 0 || viewHeight <= 0) return [1, 1, 0, 0];
  const image = imageWidth / imageHeight, view = viewWidth / viewHeight;
  if (image > view) {
    const scale = view / image;
    return [scale, 1, (1 - scale) / 2, 0];
  }
  const scale = image / view;
  return [1, scale, 0, (1 - scale) / 2];
};

export const TINTS: Record<string, [number, number, number]> = {
  dawn: [1.04, 0.95, 0.92], day: [1, 1, 1], dusk: [1.05, 0.88, 0.78], night: [0.62, 0.7, 0.92],
};

export const tintFor = (time: string | null, weather: string | null): [number, number, number] => {
  const base = TINTS[time ?? "day"] ?? TINTS.day;
  const grey = weather === "storm" ? 0.74 : weather === "rain" || weather === "fog" || weather === "snow" ? 0.9 : 1;
  return [base[0] * grey, base[1] * grey, base[2] * (grey < 1 ? Math.min(1, grey + 0.04) : 1)];
};

export type Grade = [number, number, number];

export const gradeFor = (time: string | null, weather: string | null): Grade => {
  const light = time === "night" ? { saturation: 0.72, keep: 1 } : time === "dusk" ? { saturation: 0.92, keep: 0.5 } : { saturation: 1, keep: 0 };
  const wet = weather === "rain" || weather === "fog" || weather === "snow";
  const sky = weather === "storm" ? { saturation: 0.62, contrast: 0.88 } : wet ? { saturation: 0.8, contrast: 0.93 } : { saturation: 1, contrast: 1 };
  return [light.saturation * sky.saturation, sky.contrast, light.keep];
};

export const renderScale = (dpr: number): number => Math.min(Math.max(dpr, 1), 1.5);
