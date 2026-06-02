import { useState, useSyncExternalStore } from "react";
import { storySessionStore } from "@store/storySessionStore";
import type { NarrativeMemoryState } from "../../../types/narrative-memory";

const subscribe = (onStoreChange: () => void) => storySessionStore.subscribe((state, previousState) => {
  if (state.runtime.memory !== previousState.runtime.memory) {
    onStoreChange();
  }
});

const getSnapshot = () => storySessionStore.getState().runtime.memory;

const hasMemoryContent = (memory: NarrativeMemoryState | undefined) => {
  if (!memory) return false;
  return memory.consequences.length > 0
    || memory.seeds.length > 0
    || Object.keys(memory.roleStates).length > 0
    || memory.sceneMemory.length > 0
    || memory.foregoneTransitions.length > 0;
};

const formatWeight = (weight: number) => `${Math.round(weight * 100)}%`;

const MemoryDebugPanel = () => {
  const [collapsed, setCollapsed] = useState(true);
  const memory = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  if (!hasMemoryContent(memory)) return null;

  const activeMemory = memory!;

  const roleStates = Object.values(activeMemory.roleStates).sort((left, right) => left.role.localeCompare(right.role));
  const recentSceneMemory = activeMemory.sceneMemory.slice(-5).reverse();

  return (
    <div className="st-panel p-2 mt-2 flex flex-col gap-2 text-xs">
      <button
        type="button"
        className="flex items-center justify-between gap-2 text-left"
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed}
      >
        <span className="text-sm font-medium">Narrative Memory</span>
        <span className="opacity-70">{collapsed ? "▸" : "▾"}</span>
      </button>

      {!collapsed && (
        <div className="flex flex-col gap-2 border-t st-border pt-2">
          {activeMemory.consequences.length > 0 && (
            <section className="flex flex-col gap-1">
              <div className="font-medium opacity-80">Consequences</div>
              <div className="flex flex-col gap-1">
                {activeMemory.consequences.map((entry) => (
                  <div key={entry.id} className="rounded border st-border px-2 py-1">
                    <div>{entry.text}</div>
                    <div className="opacity-70">
                      {formatWeight(entry.weight)}
                      {entry.tags.length > 0 ? ` · ${entry.tags.join(", ")}` : ""}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeMemory.seeds.length > 0 && (
            <section className="flex flex-col gap-1">
              <div className="font-medium opacity-80">Seeds</div>
              <div className="flex flex-col gap-1">
                {activeMemory.seeds.map((entry) => (
                  <div key={entry.id} className="rounded border st-border px-2 py-1">
                    <div>{entry.text}</div>
                    <div className="opacity-70">
                      {entry.kind} · {entry.resolved ? "resolved" : "open"}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {roleStates.length > 0 && (
            <section className="flex flex-col gap-1">
              <div className="font-medium opacity-80">Role States</div>
              <div className="flex flex-col gap-1">
                {roleStates.map((entry) => (
                  <div key={entry.role} className="rounded border st-border px-2 py-1">
                    <span className="font-medium">{entry.role}</span>
                    <span className="opacity-70"> {"->"} {entry.summary}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {recentSceneMemory.length > 0 && (
            <section className="flex flex-col gap-1">
              <div className="font-medium opacity-80">Scene Memory</div>
              <div className="flex flex-col gap-1">
                {recentSceneMemory.map((entry, index) => (
                  <div key={`${entry.checkpointId}-${entry.turn}-${index}`} className="rounded border st-border px-2 py-1">
                    <div>{entry.text}</div>
                    <div className="opacity-70">{entry.checkpointId}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeMemory.foregoneTransitions.length > 0 && (
            <section className="flex flex-col gap-1">
              <div className="font-medium opacity-80">Foregone Transitions</div>
              <div className="flex flex-col gap-1">
                {activeMemory.foregoneTransitions.map((entry) => (
                  <div key={`${entry.transitionId}-${entry.turn}`} className="rounded border st-border px-2 py-1">
                    <div>{entry.transitionId}</div>
                    <div className="opacity-70">{entry.reason}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
};

export default MemoryDebugPanel;
