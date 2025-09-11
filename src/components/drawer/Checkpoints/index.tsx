import React, { useEffect, useMemo, useState } from "react";
import { storyManager } from "@services/StoryService";
import type { StoryFile } from "services/SchemaService/story-schema";
import { getWorldInfoSettings } from "@services/SillyTavernAPI";
import { useStoryContext } from "@components/context/StoryContext";

type Row = { status: "pending" | "current" | "complete" | "failed"; objective: string };

type Props = {
  checkpoints?: Row[]; // keep for manual mocking
  autoloadStory?: StoryFile; // if provided, we load it on mount
};

const Checkpoints: React.FC<Props> = ({ autoloadStory }) => {
  const { validate, loadAll } = useStoryContext();
  const [rows, setRows] = useState<Row[]>([]);
  const [checkpoints, setCheckpoints] = useState<Row[]>([]);
  const [title, setTitle] = useState<string>("Story Checkpoints");
  const state = storyManager.getState();

  // Load the story from provided prop (validated) or from bundled checkpoints via context
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 1) If a story is provided, validate+normalize and load it
      if (autoloadStory) {
        const res = validate(autoloadStory);
        if (res.ok) {
          storyManager.load(res.story);
          return;
        } else {
          console.warn("autoloadStory failed validation:", res.errors);
        }
      }

      // 2) Otherwise, try to load the first valid story from the bundled checkpoints
      try {
        const results = await loadAll();
        if (cancelled) return;
        const firstOk = results?.find((r): r is { file: string; ok: true; json: any } => (r as any).ok);
        if (firstOk && (firstOk as any).json) {
          storyManager.load((firstOk as any).json);
        } else {
          console.warn("No valid checkpoint story found in bundle.");
        }
      } catch (e) {
        if (!cancelled) console.error("Failed to load bundled checkpoints:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [autoloadStory, validate, loadAll]);


  useEffect(() => {
    const off = storyManager.onChange((s) => {
      setTitle(s.title || "Story Checkpoints");
      setRows(
        s.checkpoints.map((c) => ({
          status: c.status,
          objective: c.objective,
        }))
      );
    });
    if (checkpoints?.length) {
      setRows(checkpoints);
    } else {
      // fallback demo rows
      setRows([
        { status: "complete", objective: "Prologue: Arrival" },
        { status: "complete", objective: "Checkpoint 1: Meet the Guide" },
        { status: "current", objective: "Checkpoint 2: First Conflict" },
        { status: "pending", objective: "Checkpoint 3: Secret Revealed" },
        { status: "pending", objective: "Checkpoint 4: The Choice" },
        { status: "pending", objective: "Epilogue: Resolution" },
      ]);
    }
    return () => {
      // ensure cleanup returns void: some implementations may return a boolean instead of a function
      if (typeof off === "function") {
        (off as unknown as () => void)();
      }
    };
  }, []);

  const debugActiveWI = useMemo(() => () => {
    const wi = getWorldInfoSettings();
    // this is just a handy console peek button
    console.log("WI settings snapshot:", wi);
  }, []);

  return (
    <div className="checkpoints-wrapper" style={{ padding: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h3 style={{ marginTop: 0 }}>{title}</h3>
      </div>

      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {rows.map((cp, i) => {
          const isCurrent = cp.status === "current";
          const checked = cp.status === "complete" || cp.status === "current";
          const failed = cp.status === "failed";

          return (
            <li
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "6px 0",
                background: failed
                  ? "rgba(255,0,0,0.06)"
                  : isCurrent
                    ? "rgba(0,128,255,0.06)"
                    : "transparent",
                borderRadius: 4,
              }}
            >
              <input type="checkbox" disabled readOnly checked={checked} aria-readonly="true" style={{ marginRight: 10 }} />
              <span style={{ fontWeight: isCurrent ? 600 : 400 }}>
                {cp.objective}
                {isCurrent ? " (current)" : ""}
                {failed ? " (failed)" : ""}
              </span>
            </li>
          );
        })}
      </ul>

      {/* Optional: quick debug controls */}
      <div style={{ marginTop: 8, display: "flex", gap: 6, }}>
        <button
          onClick={() => {
            const s = storyManager.getState();
            const next = s.checkpoints[s.currentIndex + 1];
            if (next) storyManager.jumpTo(next.id);
          }}
          style={{ fontSize: 12, backgroundColor: "transparent", border: "none", cursor: "pointer" }}
        >
          Skip → next
        </button>
        <button onClick={debugActiveWI} style={{ fontSize: 12, backgroundColor: "transparent", border: "none", cursor: "pointer" }}>
          debug WI
        </button>
      </div>
    </div>
  );
};

export default Checkpoints;
