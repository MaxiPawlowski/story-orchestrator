import type { LoreSource, RuntimeSnapshot } from "@runtime/types";
import { provisionableMissing } from "@runtime/repair";
import { competingSummary } from "@runtime/storyScenario";
import { setupFindings } from "@runtime/repair";
import { Button } from "@components/ui/Button";
import { StatusDot } from "@components/ui/StatusDot";

const extractionReady = (snapshot: RuntimeSnapshot): boolean => snapshot.extraction.settings.enabled && Boolean(snapshot.extraction.settings.profileId);
const extractionWord = (snapshot: RuntimeSnapshot): string => {
  if (!snapshot.extraction.settings.enabled) return "off";
  return snapshot.extraction.settings.profileId ? "ready" : "no model";
};

const SOURCE_LABELS: Record<LoreSource, string> = { global: "selected globally", chat: "chat lorebook", persona: "persona lorebook", character: "every member's card",
  story: "loaded with this story" };

const LoreBindings = ({ snapshot }: { snapshot: RuntimeSnapshot }) => {
  const { satisfiedBy = {}, characterGaps = {}, slotConflict = null } = snapshot.requirements;
  const bound = Object.entries(satisfiedBy);
  const gaps = Object.entries(characterGaps);
  if (!bound.length && !gaps.length && !slotConflict) return null;
  return (
    <div className="so-muted so-console-list">
      {bound.map(([book, source]) => <div key={book} data-so="lore-satisfied-by">{book}: {SOURCE_LABELS[source]}</div>)}
      {gaps.map(([book, members]) => <div key={book} data-so="lore-character-gap">{book}: not bound to {members.join(", ")}</div>)}
      {slotConflict && (
        <div data-so="mirror-slot-conflict">
          Memory mirror not scanned in this chat: the chat lorebook slot holds {slotConflict.book}
          {slotConflict.kind === "story-book" ? ", which this story requires" : ""}.
        </div>
      )}
    </div>
  );
};

const CompetingScenarios = ({ names }: { names: string[] }) => (names.length ? (
  <div data-so="scenario-competing" className="so-muted so-console-list">
    <div>{competingSummary(names)}.</div>
    <div>Cards: {names.join(", ")}. Give a checkpoint a scenario to frame the chat with one story text instead.</div>
  </div>
) : null);

// Diagnose-only dots were the half of this panel: the wizard turns them into a next step it can
// actually take — create the missing cards, lorebook and group. Personas stay diagnostic.
const AuthorRequirements = ({ snapshot, onFixWithWizard }: { snapshot: RuntimeSnapshot; onFixWithWizard?: () => void }) => {
  const items = [
    { label: "Persona", missing: snapshot.requirements.missingPersonas },
    { label: "Group", missing: snapshot.requirements.missingMembers },
    { label: "Unmuted cast", missing: snapshot.requirements.mutedMembers ?? [] },
    { label: "Lore", missing: snapshot.requirements.missingLorebooks },
  ];
  const ready = extractionReady(snapshot);
  const missing = provisionableMissing(snapshot.requirements);
  const provisionable = missing.members.length + missing.lorebooks.length > 0;
  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-1">
          <div className="flex items-center gap-2"><StatusDot tone={item.missing.length ? "error" : "ok"} label={item.label} word={item.missing.length ? "missing" : "ready"} /></div>
          {item.missing.length > 0 && <div className="so-muted">Missing: {item.missing.join(", ")}</div>}
        </div>
      ))}
      <LoreBindings snapshot={snapshot} />
      <CompetingScenarios names={snapshot.competingScenarios ?? []} />
      {provisionable && onFixWithWizard && (
        <Button id="so-fix-with-wizard" size="sm" className="self-start" title="Open the wizard on the provisioning step, pre-filled with what this story is missing."
          onClick={onFixWithWizard}>Fix with wizard</Button>
      )}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2"><StatusDot tone={ready ? "ok" : "error"} label="Extraction" word={extractionWord(snapshot)} /></div>
        {!ready && <div className="so-muted">Off — the story will not advance on its own. Enable it and pick a model profile in settings.</div>}
      </div>
    </div>
  );
};

const HistoryFloor = ({ snapshot, onBranchFromOldest }: { snapshot: RuntimeSnapshot; onBranchFromOldest?: (messageId: number) => void }) => {
  const oldest = snapshot.rollbackUnavailable?.oldest;
  if (!oldest || !onBranchFromOldest) return null;
  return (
    <div id="so-history-floor" className="so-console-block">
      <h4>History floor</h4>
      <p>Oldest restorable point: boundary {oldest.boundary}, message {oldest.messageId}</p>
      <Button id="so-branch-from-oldest" size="sm" disabled={oldest.messageId < 0} onClick={() => onBranchFromOldest(oldest.messageId)}>Branch from the oldest restorable point</Button>
    </div>
  );
};

const SetupSummary = ({ snapshot, onOpenRepair }: { snapshot: RuntimeSnapshot; onOpenRepair?: () => void }) => {
  const findings = setupFindings(snapshot);
  const counts = [[findings.blocks.length, "blocking"], [findings.degrades.length, "degrading"], [findings.info.length, "notes"]] as const;
  const total = counts.reduce((sum, [count]) => sum + count, 0);
  return (
    <div data-so="health-setup" className="so-console-block">
      <h4>Setup checks</h4>
      <p>{total ? counts.filter(([count]) => count > 0).map(([count, word]) => `${count} ${word}`).join(" · ") : "Nothing to fix."}</p>
      {total > 0 && onOpenRepair && <Button size="sm" variant="ghost" icon="fa-wrench" data-so="health-open-setup" onClick={onOpenRepair}>Open setup</Button>}
    </div>
  );
};

export const HealthSection = ({ snapshot, onFixWithWizard, onBranchFromOldest, onOpenRepair }: {
  snapshot: RuntimeSnapshot;
  onFixWithWizard?: () => void;
  onBranchFromOldest?: (messageId: number) => void;
  onOpenRepair?: () => void;
}) => (
  <div id="so-author-overview" className="so-console-stack">
    <div className="so-console-block">
      <h4>Requirements</h4>
      <AuthorRequirements snapshot={snapshot} onFixWithWizard={onFixWithWizard} />
    </div>
    <SetupSummary snapshot={snapshot} onOpenRepair={onOpenRepair} />
    <HistoryFloor snapshot={snapshot} onBranchFromOldest={onBranchFromOldest} />
  </div>
);
