export type CheckpointActivationReason = "manual" | "reset" | "hydrate";

export type CheckpointActivationSource = "runtime" | "stored" | "default";

export type CheckpointRequirementsState = "ready" | "blocked" | "pending";

export interface CheckpointActivationPolicyInput {
  reason: CheckpointActivationReason;
  source: CheckpointActivationSource;
  requirementsState: CheckpointRequirementsState;
}

export interface DeferredCheckpointEffectsPolicy {
  applyBasePreset: boolean;
  applyWorldInfo: boolean;
  applyAutomations: boolean;
}

export interface CheckpointActivationPolicy {
  emitEnter: boolean;
  applyWorldInfoImmediately: boolean;
  applyAutomationsImmediately: boolean;
  deferredEffects: DeferredCheckpointEffectsPolicy | null;
}

const DEFERRED_REQUIREMENTS_EFFECTS: DeferredCheckpointEffectsPolicy = {
  applyBasePreset: true,
  applyWorldInfo: true,
  applyAutomations: true,
};

const NO_DEFERRED_EFFECTS = null;

export const resolveCheckpointActivationPolicy = (
  input: CheckpointActivationPolicyInput,
): CheckpointActivationPolicy => {
  const emitEnter = input.reason !== "hydrate";

  if (input.reason === "hydrate" && input.source === "stored") {
    return {
      emitEnter,
      applyWorldInfoImmediately: false,
      applyAutomationsImmediately: false,
      deferredEffects: DEFERRED_REQUIREMENTS_EFFECTS,
    };
  }

  if (input.requirementsState === "ready") {
    return {
      emitEnter,
      applyWorldInfoImmediately: true,
      applyAutomationsImmediately: true,
      deferredEffects: NO_DEFERRED_EFFECTS,
    };
  }

  return {
    emitEnter,
    applyWorldInfoImmediately: false,
    applyAutomationsImmediately: false,
    deferredEffects: DEFERRED_REQUIREMENTS_EFFECTS,
  };
};
