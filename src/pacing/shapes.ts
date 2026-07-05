import { ARC_TEMPLATE_NAMES, type ArcTemplate, type ArcTemplateName } from "@engine/index";

type Point = { at: number; tension: number };

const BUILTIN_CURVES: Record<ArcTemplateName, Point[]> = {
  rising: [{ at: 0, tension: 0 }, { at: 1, tension: 1 }],
  fall_recovery: [{ at: 0, tension: 0.75 }, { at: 0.5, tension: 0.3 }, { at: 1, tension: 1 }],
  three_act: [{ at: 0, tension: 0.25 }, { at: 0.33, tension: 0.5 }, { at: 0.66, tension: 0.4 }, { at: 1, tension: 1 }],
};

export const isArcTemplateName = (value: unknown): value is ArcTemplateName =>
  typeof value === "string" && (ARC_TEMPLATE_NAMES as readonly string[]).includes(value);

const interpolate = (points: Point[], progress: number): number => {
  const sorted = [...points].sort((left, right) => left.at - right.at);
  if (!sorted.length) return 0;
  if (progress <= sorted[0].at) return sorted[0].tension;
  const last = sorted[sorted.length - 1];
  if (progress >= last.at) return last.tension;
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (progress <= current.at) {
      const span = current.at - previous.at;
      const ratio = span === 0 ? 0 : (progress - previous.at) / span;
      return previous.tension + ratio * (current.tension - previous.tension);
    }
  }
  return last.tension;
};

// progress = visited anchors / total anchors, clamped to [0,1]
export const expectedTension = (template: ArcTemplate, progress: number): number => {
  const clamped = Math.min(1, Math.max(0, progress));
  const points = isArcTemplateName(template) ? BUILTIN_CURVES[template] : template.points;
  return interpolate(points, clamped);
};
