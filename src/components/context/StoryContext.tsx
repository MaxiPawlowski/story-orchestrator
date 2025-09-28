import React, { createContext, useCallback, useContext, useState } from "react";
import { parseAndNormalizeStory, formatZodError, type NormalizedStory, type CheckpointResult } from "@services/SchemaService/story-validator";
import { loadCheckpointBundle, type CheckpointBundle } from "@services/StoryService/story-loader";

type ValidationResult =
  | { ok: true; story: NormalizedStory }
  | { ok: false; errors: string[] };

type LoadOptions = { force?: boolean };

export interface StoryContextValue {
  validate: (input: unknown) => ValidationResult;
  lastResult: ValidationResult | null;
  loadBundle: (options?: LoadOptions) => Promise<CheckpointBundle | null>;
  loadAll: (options?: LoadOptions) => Promise<CheckpointResult[] | null>;
  bundle: CheckpointBundle | null;
  loading: boolean;
  loadedResults: Array<{ file: string; ok: boolean; json?: NormalizedStory; error?: unknown }> | null;
  okCount: number;
  failCount: number;
}

const StoryContext = createContext<StoryContextValue | undefined>(undefined);

export const StoryProvider: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
  const [lastResult, setLastResult] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [bundle, setBundle] = useState<CheckpointBundle | null>(null);
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

  const loadBundle = useCallback(async (options?: LoadOptions): Promise<CheckpointBundle | null> => {
    setLoading(true);
    try {
      const res = await loadCheckpointBundle(options ?? {});
      if (res) {
        setBundle(res);
        setLoadedResults(res.results.map((r) => (r.ok ? { file: r.file, ok: true, json: r.json } : { file: r.file, ok: false, error: r.error })));
        setOkCount(res.okCount ?? 0);
        setFailCount(res.failCount ?? 0);
      } else {
        setBundle(null);
        setLoadedResults(null);
        setOkCount(0);
        setFailCount(0);
      }
      return res ?? null;
    } catch (e) {
      setBundle(null);
      setLoadedResults(null);
      setOkCount(0);
      setFailCount(0);
      console.error("[StoryContext] loadBundle failed:", e);
    } finally {
      setLoading(false);
    }
    return null;
  }, []);

  const loadAll = useCallback(async (options?: LoadOptions): Promise<CheckpointResult[] | null> => {
    const res = await loadBundle(options);
    return res?.results ?? null;
  }, [loadBundle]);

  return (
    <StoryContext.Provider value={{ validate, lastResult, loadBundle, loadAll, bundle, loading, loadedResults, okCount, failCount }}>
      {children}
    </StoryContext.Provider>
  );
};



export default StoryContext;
