export const DIM_MIN = 0.18;
export const DIM_MAX = 0.6;
export const DIM_FALLBACK = 0.32;
export const TEXT_CONTRAST = 4.5;

const channel = (value: number): number => {
  const unit = value / 255;
  return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
};

export const relativeLuminance = (red: number, green: number, blue: number): number => 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);

export const parseCssColor = (value: string): [number, number, number] | null => {
  const match = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(value);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
};

export const contrastRatio = (a: number, b: number): number => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

export const dimForContrast = (backdrop: number | null, text: number | null): number => {
  if (backdrop === null || text === null) return DIM_FALLBACK;
  if (text < 0.5 || contrastRatio(backdrop, text) >= TEXT_CONTRAST) return DIM_MIN;
  const target = (text + 0.05) / TEXT_CONTRAST - 0.05;
  if (backdrop <= 0) return DIM_MIN;
  return Math.min(DIM_MAX, Math.max(DIM_MIN, 1 - (target / backdrop) ** (1 / 2.2)));
};

export const meanLuminance = (pixels: ArrayLike<number>): number | null => {
  let sum = 0, count = 0;
  for (let index = 0; index + 2 < pixels.length; index += 4) { sum += relativeLuminance(pixels[index], pixels[index + 1], pixels[index + 2]); count += 1; }
  return count ? sum / count : null;
};

export const BRIGHT_SHARE = 0.25;

export const brightLuminance = (pixels: ArrayLike<number>): number | null => {
  const values: number[] = [];
  for (let index = 0; index + 2 < pixels.length; index += 4) values.push(relativeLuminance(pixels[index], pixels[index + 1], pixels[index + 2]));
  if (!values.length) return null;
  values.sort((left, right) => right - left);
  const top = values.slice(0, Math.max(1, Math.round(values.length * BRIGHT_SHARE)));
  return (top.reduce((sum, value) => sum + value, 0) / top.length + (meanLuminance(pixels) ?? 0)) / 2;
};
