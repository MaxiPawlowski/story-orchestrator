import type { Checkpoint, ValidationError } from "../schema";
import { addError } from "./common";

export const LEADS_MAX = 4;
export const LEAD_MAX_CHARS = 240;
export const STUCK_AFTER_MAX = 20;

export const readLeads = (value: Record<string, unknown>, path: string, errors: ValidationError[]): Pick<Checkpoint, "leads" | "stuck_after"> => {
  const out: Pick<Checkpoint, "leads" | "stuck_after"> = {};
  if (value.leads !== undefined) {
    const leads = value.leads;
    if (!Array.isArray(leads) || leads.some((lead) => typeof lead !== "string")) addError(errors, `${path}.leads`, "leads must be a list of short texts");
    else {
      const kept = leads.map((lead: string) => lead.trim()).filter(Boolean);
      if (kept.length > LEADS_MAX) addError(errors, `${path}.leads`, `at most ${LEADS_MAX} leads`);
      else if (kept.some((lead) => lead.length > LEAD_MAX_CHARS)) addError(errors, `${path}.leads`, `each lead must be at most ${LEAD_MAX_CHARS} characters`);
      else if (kept.length) out.leads = kept;
    }
  }
  if (value.stuck_after !== undefined) {
    const turns = value.stuck_after;
    if (typeof turns !== "number" || !Number.isInteger(turns) || turns < 1 || turns > STUCK_AFTER_MAX) {
      addError(errors, `${path}.stuck_after`, `stuck_after must be a whole number from 1 to ${STUCK_AFTER_MAX}`);
    }
    else out.stuck_after = turns;
  }
  if ((out.leads || out.stuck_after !== undefined) && isRecordStretch(value.stretch) && value.type !== "anchor") {
    addError(errors, `${path}.leads`, "leads and stuck_after do not apply to an open stretch; its pace and encounters help there");
    return {};
  }
  return out;
};

const isRecordStretch = (stretch: unknown): boolean =>
  typeof stretch === "object" && stretch !== null && (stretch as { mode?: unknown }).mode === "open";
