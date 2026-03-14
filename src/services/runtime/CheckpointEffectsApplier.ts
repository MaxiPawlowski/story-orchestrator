import type { PresetService } from "@services/PresetService";
import { disableWIEntry, enableWIEntry, executeSlashCommands } from "@services/STAPI";
import type { DeferredCheckpointEffectsPolicy, CheckpointActivationPolicy } from "./checkpointActivationPolicy";
import type { NormalizedCheckpoint, NormalizedStory } from "@utils/story-validator";

interface PendingRequirementsEffects {
  activationKey: string;
  checkpointId: string | null;
  effects: DeferredCheckpointEffectsPolicy;
}

interface CheckpointEffectsApplierOptions {
  story: NormalizedStory;
  presetService: Pick<PresetService, "applyBasePreset">;
  isRequirementsReady: () => boolean;
  getActivationContextKey: () => string;
}

export class CheckpointEffectsApplier {
  private readonly story: NormalizedStory;
  private readonly presetService: Pick<PresetService, "applyBasePreset">;
  private readonly isRequirementsReady: () => boolean;
  private readonly getActivationContextKey: () => string;
  private activationSequence = 0;
  private pendingRequirementsEffects: PendingRequirementsEffects | null = null;

  constructor(options: CheckpointEffectsApplierOptions) {
    this.story = options.story;
    this.presetService = options.presetService;
    this.isRequirementsReady = options.isRequirementsReady;
    this.getActivationContextKey = options.getActivationContextKey;
  }

  reset() {
    this.activationSequence = 0;
    this.pendingRequirementsEffects = null;
  }

  clearPending() {
    this.pendingRequirementsEffects = null;
  }

  private createActivationKey(checkpointId: string | null) {
    this.activationSequence += 1;
    return `${this.getActivationContextKey()}::${checkpointId ?? "none"}::${this.activationSequence}`;
  }

  updatePlan(checkpointId: string | null, policy: CheckpointActivationPolicy) {
    if (!policy.deferredEffects || !checkpointId) {
      this.pendingRequirementsEffects = null;
      return;
    }

    this.pendingRequirementsEffects = {
      activationKey: this.createActivationKey(checkpointId),
      checkpointId,
      effects: policy.deferredEffects,
    };
  }

  async applyActivationEffects(checkpoint: NormalizedCheckpoint | undefined, policy: CheckpointActivationPolicy) {
    this.updatePlan(checkpoint?.id ?? null, policy);
    if (!checkpoint) return;
    if (policy.applyWorldInfoImmediately) {
      await this.applyWorldInfoForCheckpoint(checkpoint);
    }
    if (policy.applyAutomationsImmediately) {
      await this.applyAutomationsForCheckpoint(checkpoint);
    }
  }

  async flush(checkpoint: NormalizedCheckpoint | undefined) {
    const pending = this.pendingRequirementsEffects;
    if (!pending || !checkpoint || checkpoint.id !== pending.checkpointId || !this.isRequirementsReady()) return;

    if (pending.effects.applyBasePreset) {
      this.presetService.applyBasePreset();
    }
    if (pending.effects.applyWorldInfo) {
      await this.applyWorldInfoForCheckpoint(checkpoint);
    }
    if (pending.effects.applyAutomations) {
      await this.applyAutomationsForCheckpoint(checkpoint);
    }

    this.pendingRequirementsEffects = null;
  }

  private async applyWorldInfoForCheckpoint(checkpoint?: NormalizedCheckpoint) {
    if (!this.isRequirementsReady()) return;

    const lorebook = this.story.global_lorebook;
    if (!checkpoint || !lorebook) return;

    const worldInfo = checkpoint.world_info;
    if (!worldInfo) return;

    const activateList = Array.isArray(worldInfo.activate) ? worldInfo.activate : [];
    const deactivateList = Array.isArray(worldInfo.deactivate) ? worldInfo.deactivate : [];

    if (activateList.length) {
      await enableWIEntry(lorebook, activateList);
    }

    if (deactivateList.length) {
      await disableWIEntry(lorebook, deactivateList);
    }
  }

  private async applyAutomationsForCheckpoint(checkpoint?: NormalizedCheckpoint) {
    if (!this.isRequirementsReady() || !checkpoint) return;

    const automations = checkpoint.automations;
    if (!Array.isArray(automations) || !automations.length) return;

    const commands = automations.map((cmd) => (typeof cmd === "string" ? cmd.trim() : "")).filter(Boolean);
    if (!commands.length) return;

    console.log("[StoryOrch] automations run", { cp: checkpoint.name, commands });

    try {
      const ok = await executeSlashCommands(commands, { silent: true, delayMs: 150 });
      if (!ok) {
        console.warn("[StoryOrch] automations reported failure", { cp: checkpoint.name, commands });
      }
    } catch (err) {
      console.warn("[StoryOrch] automations failed", { cp: checkpoint.name, err });
    }
  }
}
