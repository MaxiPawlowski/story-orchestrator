import React, { createContext, useCallback, useContext, useState } from "react";
import { parseAndNormalizeStory, formatZodError, type NormalizedStory, CheckpointResult } from "../../services/SchemaService/story-validator";
import loadJsons from "@services/StoryService/story-loader";

type ValidationResult =
  | { ok: true; story: NormalizedStory }
  | { ok: false; errors: string[] };

interface StoryContextValue {
  validate: (input: unknown) => ValidationResult;
  lastResult: ValidationResult | null;
  // load checkpoint bundle from dist/checkpoints or manifest
  loadAll: () => Promise<CheckpointResult[] | null>;
  loading: boolean;
  loadedResults: Array<{ file: string; ok: boolean; json?: NormalizedStory; error?: unknown }> | null;
  okCount: number;
  failCount: number;
}

const StoryContext = createContext<StoryContextValue | undefined>(undefined);

export const StoryProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  const [lastResult, setLastResult] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadedResults, setLoadedResults] = useState<Array<{ file: string; ok: boolean; json?: NormalizedStory; error?: unknown }> | null>(null);
  const [okCount, setOkCount] = useState(0);
  const [failCount, setFailCount] = useState(0);

  const validate = useCallback((input: unknown): ValidationResult => {
    try {
      const normalized = parseAndNormalizeStory(input);
      const res: ValidationResult = { ok: true, story: normalized };
      setLastResult(res);
      return res;
    } catch (e) {
      const errors = formatZodError(e);
      const res: ValidationResult = { ok: false, errors };
      setLastResult(res);
      return res;
    }
  }, []);

  const loadAll = useCallback(async (): Promise<CheckpointResult[] | null> => {
    setLoading(true);
    try {
      const res = await loadJsons();
      if (res) {
        setLoadedResults(res.results as any);
        setOkCount(res.okCount ?? 0);
        setFailCount(res.failCount ?? 0);
      } else {
        setLoadedResults(null);
        setOkCount(0);
        setFailCount(0);
      }
      return res.results;
    } catch (e) {
      setLoadedResults(null);
      setOkCount(0);
      setFailCount(0);
      // keep error silent here; consumer can check loadedResults
      console.error("loadAll failed:", e);
    } finally {
      setLoading(false);
    }
    return null;
  }, []);

  return (
    <StoryContext.Provider value={{ validate, lastResult, loadAll, loading, loadedResults, okCount, failCount }}>
      {children}
    </StoryContext.Provider>
  );
};

export function useStoryContext(): StoryContextValue {
  const ctx = useContext(StoryContext);
  if (!ctx) throw new Error("useStoryContext must be used within a StoryProvider");
  return ctx;
}

export default StoryContext;