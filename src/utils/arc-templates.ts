export enum PacingPhase {
  Setup = "setup",
  Rising = "rising",
  Climax = "climax",
  Falling = "falling",
  Denouement = "denouement",
}

export type ArcTemplateFn = (progress: number) => number;

type ArcTemplateCheckpointLike = {
  tension_target?: number;
  progress_override?: number;
};

type ArcTemplateOption = {
  id: string;
  label: string;
  description: string;
};

type CurvePoint = {
  progress: number;
  tension: number;
};

type PhaseSegment = {
  end: number;
  phase: PacingPhase;
};

type ArcTemplateDefinition = {
  label: string;
  description: string;
  curve: ArcTemplateFn;
  phases: readonly PhaseSegment[];
};

const DEFAULT_ARC_TEMPLATE_ID = "freytag";

const clampUnit = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
};

const clampProgress = (progress: number): number => clampUnit(progress);

const interpolateLinear = (start: CurvePoint, end: CurvePoint, progress: number): number => {
  if (end.progress <= start.progress) return clampUnit(end.tension);
  const ratio = (progress - start.progress) / (end.progress - start.progress);
  return clampUnit(start.tension + ((end.tension - start.tension) * ratio));
};

const createPiecewiseCurve = (points: readonly CurvePoint[]): ArcTemplateFn => {
  const sortedPoints = [...points].sort((a, b) => a.progress - b.progress);

  return (progress) => {
    const clampedProgress = clampProgress(progress);

    if (sortedPoints.length === 0) return 0;
    if (clampedProgress <= sortedPoints[0].progress) return clampUnit(sortedPoints[0].tension);

    for (let i = 1; i < sortedPoints.length; i += 1) {
      const previous = sortedPoints[i - 1];
      const current = sortedPoints[i];
      if (clampedProgress <= current.progress) {
        return interpolateLinear(previous, current, clampedProgress);
      }
    }

    return clampUnit(sortedPoints[sortedPoints.length - 1].tension);
  };
};

const ARC_TEMPLATE_REGISTRY: Record<string, ArcTemplateDefinition> = {
  freytag: {
    label: "Freytag Pyramid",
    description: "Steady rise to a late climax, then release into resolution.",
    curve: createPiecewiseCurve([
      { progress: 0, tension: 0.08 },
      { progress: 0.2, tension: 0.22 },
      { progress: 0.6, tension: 1 },
      { progress: 0.85, tension: 0.38 },
      { progress: 1, tension: 0.12 },
    ]),
    phases: [
      { end: 0.2, phase: PacingPhase.Setup },
      { end: 0.55, phase: PacingPhase.Rising },
      { end: 0.65, phase: PacingPhase.Climax },
      { end: 0.85, phase: PacingPhase.Falling },
      { end: 1, phase: PacingPhase.Denouement },
    ],
  },
  vonnegut_man_in_hole: {
    label: "Vonnegut: Man in Hole",
    description: "Early descent into trouble, recovery to a strong high, then landing.",
    curve: createPiecewiseCurve([
      { progress: 0, tension: 0.58 },
      { progress: 0.3, tension: 0.12 },
      { progress: 0.8, tension: 1 },
      { progress: 1, tension: 0.68 },
    ]),
    phases: [
      { end: 0.15, phase: PacingPhase.Setup },
      { end: 0.35, phase: PacingPhase.Falling },
      { end: 0.75, phase: PacingPhase.Rising },
      { end: 0.9, phase: PacingPhase.Climax },
      { end: 1, phase: PacingPhase.Denouement },
    ],
  },
  vonnegut_icarus: {
    label: "Vonnegut: Icarus",
    description: "Rapid ascent to a bright peak, followed by a steep collapse.",
    curve: createPiecewiseCurve([
      { progress: 0, tension: 0.12 },
      { progress: 0.55, tension: 1 },
      { progress: 0.9, tension: 0.18 },
      { progress: 1, tension: 0.06 },
    ]),
    phases: [
      { end: 0.2, phase: PacingPhase.Setup },
      { end: 0.5, phase: PacingPhase.Rising },
      { end: 0.65, phase: PacingPhase.Climax },
      { end: 0.9, phase: PacingPhase.Falling },
      { end: 1, phase: PacingPhase.Denouement },
    ],
  },
  three_act: {
    label: "Three Act",
    description: "Measured setup, long escalation, decisive climax, then short unwind.",
    curve: createPiecewiseCurve([
      { progress: 0, tension: 0.1 },
      { progress: 1 / 3, tension: 0.3 },
      { progress: 2 / 3, tension: 0.72 },
      { progress: 0.82, tension: 1 },
      { progress: 1, tension: 0.18 },
    ]),
    phases: [
      { end: 1 / 3, phase: PacingPhase.Setup },
      { end: 0.75, phase: PacingPhase.Rising },
      { end: 0.85, phase: PacingPhase.Climax },
      { end: 0.95, phase: PacingPhase.Falling },
      { end: 1, phase: PacingPhase.Denouement },
    ],
  },
};

export const ARC_TEMPLATE_OPTIONS: ArcTemplateOption[] = Object.entries(ARC_TEMPLATE_REGISTRY).map(([id, template]) => ({
  id,
  label: template.label,
  description: template.description,
}));

const resolveTemplate = (templateId?: string | null): ArcTemplateDefinition => {
  return ARC_TEMPLATE_REGISTRY[templateId ?? ""] ?? ARC_TEMPLATE_REGISTRY[DEFAULT_ARC_TEMPLATE_ID];
};

const resolveCheckpointProgress = (checkpoints: readonly ArcTemplateCheckpointLike[], index: number): number => {
  const checkpoint = checkpoints[index];
  if (checkpoint && Number.isFinite(checkpoint.progress_override)) {
    return clampProgress(checkpoint.progress_override as number);
  }

  if (checkpoints.length <= 0) return 0;
  return clampProgress(index / Math.max(checkpoints.length, 1));
};

const resolveAnchor = (
  checkpoints: readonly ArcTemplateCheckpointLike[],
  startIndex: number,
  step: -1 | 1,
): { progress: number; tension: number } | null => {
  for (let index = startIndex; index >= 0 && index < checkpoints.length; index += step) {
    const checkpoint = checkpoints[index];
    if (!checkpoint || !Number.isFinite(checkpoint.tension_target)) continue;
    return {
      progress: resolveCheckpointProgress(checkpoints, index),
      tension: clampUnit(checkpoint.tension_target as number),
    };
  }

  return null;
};

export const ARC_TEMPLATE_CURVES: Record<string, ArcTemplateFn> = Object.fromEntries(
  Object.entries(ARC_TEMPLATE_REGISTRY).map(([id, template]) => [id, template.curve]),
);

export const computeExpectedTension = (templateId: string | null | undefined, progress: number): number => {
  return resolveTemplate(templateId).curve(progress);
};

export const derivePacingPhase = (progress: number, templateId: string | null | undefined): PacingPhase => {
  const clampedProgress = clampProgress(progress);
  const template = resolveTemplate(templateId);

  for (const segment of template.phases) {
    if (clampedProgress <= segment.end) return segment.phase;
  }

  return PacingPhase.Denouement;
};

export const interpolateTensionTarget = (
  checkpoints: readonly ArcTemplateCheckpointLike[],
  currentIndex: number,
  arcTemplate: string | null | undefined,
): number => {
  if (checkpoints.length === 0) return computeExpectedTension(arcTemplate, 0);

  const safeIndex = Math.max(0, Math.min(Math.floor(currentIndex), checkpoints.length - 1));
  const checkpoint = checkpoints[safeIndex];
  if (checkpoint && Number.isFinite(checkpoint.tension_target)) {
    return clampUnit(checkpoint.tension_target as number);
  }

  const progress = resolveCheckpointProgress(checkpoints, safeIndex);
  const previousAnchor = resolveAnchor(checkpoints, safeIndex - 1, -1);
  const nextAnchor = resolveAnchor(checkpoints, safeIndex + 1, 1);

  if (previousAnchor && nextAnchor && nextAnchor.progress > previousAnchor.progress) {
    const curveStart = computeExpectedTension(arcTemplate, previousAnchor.progress);
    const curveEnd = computeExpectedTension(arcTemplate, nextAnchor.progress);
    const curveCurrent = computeExpectedTension(arcTemplate, progress);
    const denominator = curveEnd - curveStart;

    if (Math.abs(denominator) < 1e-6) {
      const ratio = (progress - previousAnchor.progress) / (nextAnchor.progress - previousAnchor.progress);
      return clampUnit(previousAnchor.tension + ((nextAnchor.tension - previousAnchor.tension) * ratio));
    }

    const ratio = (curveCurrent - curveStart) / denominator;
    return clampUnit(previousAnchor.tension + ((nextAnchor.tension - previousAnchor.tension) * ratio));
  }

  return computeExpectedTension(arcTemplate, progress);
};
