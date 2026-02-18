import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { StoryGeneratorService, type SeedResult, type GenerationPhase } from "@services/StoryGeneratorService";
import type { Story } from "@utils/story-schema";
import { makeStubCheckpoint } from "@utils/story-schema";
import type { SaveLibraryStoryResult, StoredStoryMeta } from "@utils/story-library";
import { makeDefaultState, persistStoryState } from "@utils/story-state";
import type { NormalizedStory } from "@utils/story-validator";

type WizardStep = "questionnaire" | "premise" | "roles" | "generating" | "done" | "error";

interface StoryQuestionnaire {
  genre: string;
  tone: string;
  length: string;
  focus: string;
}

const PHASE_LABELS: Record<GenerationPhase, string> = {
  roadmap: "Generating narrative roadmap",
  checkpoint: "Defining opening beat",
  transitions: "Planning transitions",
  actions: "Configuring scene actions",
};

const PHASES: GenerationPhase[] = ["roadmap", "checkpoint", "transitions", "actions"];

interface RoleRow {
  roleId: string;
  displayName: string;
}

interface WizardProps {
  onClose: () => void;
  onSaveStory: (story: Story, options?: { name?: string; meta?: StoredStoryMeta }) => Promise<SaveLibraryStoryResult>;
  onSelectKey: (key: string) => void;
  globalLorebook?: string;
  activeChatId?: string | null;
  groupChatSelected?: boolean;
}

const PORTAL_ROOT_ID = "story-wizard-modal-root";

const ensurePortalRoot = (): HTMLElement => {
  if (typeof document === "undefined") return {} as HTMLElement;
  const existing = document.getElementById(PORTAL_ROOT_ID);
  if (existing) return existing;
  const root = document.createElement("div");
  root.id = PORTAL_ROOT_ID;
  root.style.position = "fixed";
  root.style.top = "0";
  root.style.left = "0";
  root.style.width = "100%";
  root.style.height = "100%";
  root.style.zIndex = "9998";
  document.body.appendChild(root);
  return root;
};

const StoryGeneratorWizard: React.FC<WizardProps> = ({ onClose, onSaveStory, onSelectKey, globalLorebook, activeChatId, groupChatSelected }) => {
  const [step, setStep] = useState<WizardStep>("questionnaire");
  const [questionnaire, setQuestionnaire] = useState<StoryQuestionnaire>({
    genre: "",
    tone: "",
    length: "Medium — 10 beats",
    focus: "Player-driven",
  });
  const [premise, setPremise] = useState("");
  const [storyTitle, setStoryTitle] = useState("");
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [phasesDone, setPhasesDone] = useState<Partial<Record<GenerationPhase, boolean>>>({});
  const [currentPhase, setCurrentPhase] = useState<GenerationPhase | null>(null);
  const [checkpointPreview, setCheckpointPreview] = useState<{ name: string; objective: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const serviceRef = useRef(new StoryGeneratorService());

  const characters = useMemo(() => StoryGeneratorService.buildCharacterSummaries(), []);
  const worldInfo = useMemo(() => StoryGeneratorService.buildWorldInfoSummaries(), []);

  useEffect(() => {
    if (characters.length && !roles.length) {
      setRoles(characters.map(c => ({
        roleId: c.name.toLowerCase().replace(/\s+/g, "_"),
        displayName: c.name,
      })));
    }
  }, [characters]);

  const updateRole = useCallback((index: number, field: "roleId" | "displayName", value: string) => {
    setRoles(prev => prev.map((r, i) => i === index ? { ...r, [field]: value } : r));
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!premise.trim()) return;
    setStep("generating");
    setPhasesDone({});
    setCurrentPhase(null);
    setCheckpointPreview(null);
    setErrorMsg(null);

    const service = serviceRef.current;
    service.setPhaseCallback((update) => {
      setCurrentPhase(update.phase);
      if (update.done) {
        setPhasesDone(prev => ({ ...prev, [update.phase]: true }));
      }
      if (update.checkpointName) {
        setCheckpointPreview({ name: update.checkpointName, objective: update.checkpointObjective ?? "" });
      }
    });

    try {
      const title = storyTitle.trim() || `Generated Story — ${new Date().toLocaleDateString()}`;
      const rolesMap: Record<string, string> = {};
      for (const row of roles) {
        if (row.roleId.trim() && row.displayName.trim()) {
          rolesMap[row.roleId.trim()] = row.displayName.trim();
        }
      }

      const seedResult: SeedResult = await service.generateSeed({
        premise: premise.trim(),
        characters,
        worldInfo,
        storyTitle: title,
        globalLorebook: globalLorebook ?? "Story World",
        questionnaire,
      });

      const mergedRoles = { ...rolesMap, ...seedResult.roles };

      const stubCheckpoints = seedResult.transitions.map(t =>
        makeStubCheckpoint(t.to, t.label ?? `Upcoming Beat (${t.to})`)
      );

      const story: Story = {
        title,
        global_lorebook: globalLorebook ?? "Story World",
        roles: Object.keys(mergedRoles).length ? mergedRoles : undefined,
        checkpoints: [seedResult.initialCheckpoint, ...stubCheckpoints],
        transitions: seedResult.transitions,
        talkControl: Object.keys(seedResult.talkControl.checkpoints).length ? seedResult.talkControl : undefined,
      };

      const result = await onSaveStory(story, {
        name: title,
        meta: {
          premise: premise.trim(),
          roadmap: seedResult.roadmap,
          generatedAt: Date.now(),
          isDynamic: true,
          genre: questionnaire.genre,
          tone: questionnaire.tone,
        },
      });

      if (result.ok) {
        onSelectKey(result.key);
        if (activeChatId && groupChatSelected) {
          try {
            const defaultRuntime = makeDefaultState(story as unknown as NormalizedStory);
            persistStoryState({
              chatId: activeChatId,
              story: story as unknown as NormalizedStory,
              state: defaultRuntime,
              storyKey: result.key,
              roadmap: seedResult.roadmap,
            });
          } catch (err) {
            console.warn("[Wizard] Failed to persist story selection for chat", err);
          }
        }
        setStep("done");
        setTimeout(() => onClose(), 1500);
      } else {
        setErrorMsg(result.error ?? "Failed to save story.");
        setStep("error");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generation failed.";
      setErrorMsg(msg);
      setStep("error");
    }
  }, [premise, storyTitle, roles, characters, worldInfo, globalLorebook, onSaveStory, onSelectKey, activeChatId, groupChatSelected, questionnaire]);

  return (
    <div className="flex flex-col gap-4 p-4 max-w-xl w-full mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Generate Story</h2>
        <button type="button" className="text-xl bg-transparent border-none" onClick={onClose} aria-label="Close">×</button>
      </div>

      {step === "questionnaire" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm opacity-70">Tell us about the story you want to create.</p>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Genre</label>
            <select className="text_pole st-input" value={questionnaire.genre} onChange={e => setQuestionnaire(q => ({ ...q, genre: e.target.value }))}>
              <option value="">Select genre…</option>
              {["Fantasy", "Sci-Fi", "Horror", "Mystery", "Romance", "Thriller", "Slice of Life", "Other"].map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Tone</label>
            <select className="text_pole st-input" value={questionnaire.tone} onChange={e => setQuestionnaire(q => ({ ...q, tone: e.target.value }))}>
              <option value="">Select tone…</option>
              {["Dark & Gritty", "Lighthearted & Fun", "Suspenseful", "Romantic", "Comedic", "Dramatic", "Other"].map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Story Length</label>
            <select className="text_pole st-input" value={questionnaire.length} onChange={e => setQuestionnaire(q => ({ ...q, length: e.target.value }))}>
              {["Short — 5 beats", "Medium — 10 beats", "Long — 15 beats", "Epic — 20+ beats"].map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Story Focus</label>
            <select className="text_pole st-input" value={questionnaire.focus} onChange={e => setQuestionnaire(q => ({ ...q, focus: e.target.value }))}>
              {["Player-driven", "NPC-driven", "Ensemble cast", "Mystery/Investigation"].map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" className="st-button secondary" onClick={onClose}>Cancel</button>
            <button
              type="button"
              className="st-button primary"
              disabled={!questionnaire.genre || !questionnaire.tone}
              onClick={() => setStep("premise")}
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {step === "premise" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Story Title (optional)</label>
            <input
              type="text"
              className="text_pole st-input"
              placeholder="Leave blank to auto-name"
              value={storyTitle}
              onChange={e => setStoryTitle(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Opening Scenario</label>
            <textarea
              className="text_pole textarea_compact st-input"
              rows={6}
              placeholder="Describe the setting, who's present, tone, and what's about to happen…"
              value={premise}
              onChange={e => setPremise(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="st-button secondary" onClick={() => setStep("questionnaire")}>← Back</button>
            <button
              type="button"
              className="st-button primary"
              disabled={!premise.trim()}
              onClick={() => setStep("roles")}
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {step === "roles" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm opacity-70">Assign roles to characters. Role IDs are used in author notes and macros.</p>
          <div className="flex flex-col gap-2">
            {roles.map((row, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  type="text"
                  className="text_pole st-input flex-1"
                  placeholder="role_id"
                  value={row.roleId}
                  onChange={e => updateRole(i, "roleId", e.target.value)}
                />
                <span className="opacity-40">→</span>
                <input
                  type="text"
                  className="text_pole st-input flex-1"
                  placeholder="Display Name"
                  value={row.displayName}
                  onChange={e => updateRole(i, "displayName", e.target.value)}
                />
              </div>
            ))}
            {!roles.length && <p className="text-xs opacity-50">No characters found in current group chat.</p>}
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="st-button secondary" onClick={() => setStep("premise")}>← Back</button>
            <button type="button" className="st-button primary" onClick={handleGenerate}>
              Generate ✨
            </button>
          </div>
        </div>
      )}

      {step === "generating" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium mb-1">Building your story…</p>
          {PHASES.map(phase => (
            <div key={phase} className={`flex items-center gap-2 text-sm ${currentPhase === phase && !phasesDone[phase] ? "opacity-100" : phasesDone[phase] ? "opacity-70" : "opacity-30"}`}>
              <span className="w-5 text-center">{phasesDone[phase] ? "✅" : currentPhase === phase ? "⏳" : "○"}</span>
              <span>{PHASE_LABELS[phase]}</span>
            </div>
          ))}
          {checkpointPreview && (
            <div className="mt-3 border-t st-border pt-2 text-xs opacity-80">
              <div className="font-medium">{checkpointPreview.name}</div>
              {checkpointPreview.objective && <div className="opacity-70">{checkpointPreview.objective}</div>}
            </div>
          )}
        </div>
      )}

      {step === "done" && (
        <div className="text-center py-4">
          <div className="text-2xl mb-2">✅</div>
          <p className="text-sm">Story generated and activated!</p>
        </div>
      )}

      {step === "error" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm st-text-error">{errorMsg}</p>
          <div className="flex justify-end gap-2">
            <button type="button" className="st-button secondary" onClick={onClose}>Close</button>
            <button type="button" className="st-button primary" onClick={() => setStep("premise")}>Try Again</button>
          </div>
        </div>
      )}
    </div>
  );
};

interface ModalProps extends WizardProps {
  open: boolean;
}

const StoryGeneratorWizardModal: React.FC<ModalProps> = ({ open, onClose, ...rest }) => {
  const portalContainer = useMemo(() => {
    if (typeof document === "undefined") return null;
    const container = document.createElement("div");
    container.dataset.component = "story-wizard-modal";
    return container;
  }, []);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open || !portalContainer) return undefined;
    const root = ensurePortalRoot();
    root.appendChild(portalContainer);
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      if (portalContainer.parentElement === root) {
        root.removeChild(portalContainer);
        if (!root.childElementCount) root.remove();
      }
    };
  }, [open, portalContainer]);

  if (!open || !portalContainer) return null;

  const handleOverlay: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return createPortal(
    <div
      className="st-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center"
      role="presentation"
      onClick={handleOverlay}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Story Generator"
        className="st-panel shadow-2xl w-full max-w-lg overflow-y-auto max-h-[90vh]"
      >
        <StoryGeneratorWizard onClose={onClose} {...rest} />
      </div>
    </div>,
    portalContainer,
  );
};

export { StoryGeneratorWizard, StoryGeneratorWizardModal };
export default StoryGeneratorWizardModal;
