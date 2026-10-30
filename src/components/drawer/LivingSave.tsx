import { useState } from "react";
import { Button } from "@components/ui/Button";
import { StatusText } from "@components/ui/StatusText";

export interface LivingSaveResult {
  ok: boolean;
  title?: string;
  excluded?: number;
  reason?: string;
}

export const savedLine = (result: LivingSaveResult): string => (result.ok
  ? `Saved “${result.title ?? ""}” to the library.${result.excluded ? ` ${result.excluded} turning point(s) you never reached were left out.` : ""}`
  : `Not saved: ${result.reason ?? "unknown reason"}.`);

export const LivingSave = ({ onSave }: { onSave: () => Promise<LivingSaveResult> }) => {
  const [result, setResult] = useState<LivingSaveResult | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      setResult(await onSave());
    } finally {
      setSaving(false);
    }
  };
  return (
    <div data-so="living-save" className="flex flex-col gap-1 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Button id="so-living-save" type="button" disabled={saving} onClick={() => void save()}>Save this run as a story</Button>
      </div>
      <div className="opacity-70">Keeps what you played as a story you can start again.</div>
      {result && <StatusText as="div" data-so="living-save-result" tone={result.ok ? "neutral" : "warn"}>{savedLine(result)}</StatusText>}
    </div>
  );
};

export default LivingSave;
