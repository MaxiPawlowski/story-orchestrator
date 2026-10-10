import type { NormalizedStoryV2 } from "@engine/index";
import type { SchedulerJob } from "@extraction/index";
import type { DirectorProposal } from "@generation/living/types";
import type { LivingCoordinator, LivingCoordinatorDeps, LivingDecision, LivingSaveOutcome } from "./coordinators/livingCoordinator";
import { installLivingAuthorView } from "./livingSnapshot";

type LivingCoordinatorModule = typeof import("./coordinators/livingCoordinator");

export const LIVING_NOT_LOADED = "the living story's history is still loading; try the update again in a moment";

export interface LivingBoundary {
  boundary: number;
  messageId: number;
  fired: boolean;
}

const hasAccepted = (deps: LivingCoordinatorDeps): boolean => (deps.getLiving()?.proposals ?? []).some((proposal) => proposal.status === "accepted");

export class LivingPort {
  private impl: LivingCoordinator | null = null;
  private loading: Promise<LivingCoordinator> | null = null;

  constructor(private readonly deps: LivingCoordinatorDeps, private readonly importer: () => Promise<LivingCoordinatorModule> = () => import("./coordinators/livingCoordinator")) {}

  private load(): Promise<LivingCoordinator> {
    this.loading ??= this.importer().then((module) => {
      this.impl = new module.LivingCoordinator(this.deps);
      installLivingAuthorView(module.livingAuthorView);
      this.deps.notify();
      return this.impl;
    });
    return this.loading;
  }

  loaded(): boolean {
    return this.impl !== null;
  }

  tracks(): boolean {
    return Boolean(this.deps.getLiving()?.authored);
  }

  relevant(): boolean {
    const story: NormalizedStoryV2 | null = this.deps.getStory();
    return Boolean(story && (story.living || this.tracks() || this.deps.branching()));
  }

  adopt(mode: "activate" | "hydrate") {
    if (!this.relevant()) return;
    if (this.impl) return void this.impl.adopt(mode);
    void this.load().then((coordinator) => coordinator.adopt(mode));
  }

  async applyAccepted(at: { boundary: number; messageId: number }): Promise<number> {
    if (!hasAccepted(this.deps)) return 0;
    return (await this.load()).applyAccepted(at);
  }

  compact() {
    this.impl?.compact();
  }

  restoreAfterRollback(boundary: number): number {
    if (this.impl) return this.impl.restoreAfterRollback(boundary);
    if (this.tracks()) void this.load().then((coordinator) => coordinator.restoreAfterRollback(boundary));
    return 0;
  }

  refold(authored: { raw: Record<string, unknown>; hash: string }): ReturnType<LivingCoordinator["refold"]> {
    return this.impl ? this.impl.refold(authored) : { broken: [LIVING_NOT_LOADED] };
  }

  commitAuthored(authored: { raw: Record<string, unknown>; hash: string }) {
    this.impl?.commitAuthored(authored);
  }

  async afterBoundary(at: LivingBoundary, place: (job: SchedulerJob) => unknown): Promise<void> {
    if (!this.relevant()) return;
    const coordinator = await this.load();
    coordinator.schedule(place);
    if (!at.fired) await coordinator.checkDivergence({ boundary: at.boundary, messageId: at.messageId }, place);
    coordinator.prefetch(place);
  }

  async propose(): Promise<DirectorProposal | null> {
    return (await this.load()).propose();
  }

  async decide(id: string, status: LivingDecision, edit?: { name?: string; objective?: string }): Promise<boolean> {
    return (await this.load()).decide(id, status, edit);
  }

  async regenerate(id: string): Promise<DirectorProposal | null> {
    return (await this.load()).regenerate(id);
  }

  async saveAsStory(options: { includeUnreached: boolean; title?: string }): Promise<LivingSaveOutcome> {
    return (await this.load()).saveAsStory(options);
  }
}
