import type { ConnectionProfileSummary } from "@services/STAPI";
import { settingHelp } from "@features/settingsCopy";
import { FieldLabel } from "./Field";

export interface FallbackProfileFieldProps {
  value: string | null;
  primary: string | null;
  profiles: ConnectionProfileSummary[];
  onChange: (profileId: string | null) => void;
}

export const FALLBACK_HELP = settingHelp("extraction.fallbackProfileId");

export const FallbackProfileField = ({ value, primary, profiles, onChange }: FallbackProfileFieldProps) => {
  const choices = profiles.filter((profile) => profile.id !== primary);
  const missing = value !== null && !profiles.some((profile) => profile.id === value);
  return (
    <div className="flex flex-col gap-1 text-sm">
      <FieldLabel htmlFor="so-extraction-fallback" setting="extraction.fallbackProfileId" />
      <select id="so-extraction-fallback" value={value ?? ""} disabled={!primary} onChange={(event) => onChange(event.target.value || null)}>
        <option value="">No fallback</option>
        {missing && <option value={value ?? ""}>{value} (no longer exists)</option>}
        {choices.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}{profile.model ? ` (${profile.model})` : ""}</option>)}
      </select>
    </div>
  );
};
