import { applyBackground, applyCharacterAN, clearCharacterAN, getCurrentBackground, setGroupMemberDisabled, setGroupMemberFlags, readGroupMemberDisabled } from "@services/STAPI";
import { reconcileLedger } from "./effectLedger";
import { effectExtension } from "./effectExtensions";
import { samplerOverlay } from "./samplerOverlay";
import type { EffectLedgerRow, EffectTarget } from "./types";

// What the effect ledger asks the host: "what do you hold for this target?", and "put
// this back". It is a module rather than methods on the applier so the applier stays the recorder,
// and it is here rather than in `stHost/` because a target is OUR vocabulary, not ST's.

const AN_FIELD = "#extension_floating_prompt";

/** The chat's Author's Note text, read the way the AN seam writes it (`#extension_floating_prompt`). */
const readAuthorNote = (): Record<string, unknown> | null => {
  const field = globalThis.document?.querySelector<HTMLTextAreaElement>(AN_FIELD);
  return typeof field?.value === "string" ? { text: field.value } : null;
};

export function readEffectTarget(target: EffectTarget): Record<string, unknown> | null {
  switch (target.kind) {
    case "cast": {
      const disabled = readGroupMemberDisabled(target.member, target.group || undefined);
      return disabled === null ? null : { disabled };
    }
    case "background": {
      const current = getCurrentBackground();
      return current.name ? { name: current.name } : null;
    }
    case "an":
      return readAuthorNote();
    case "preset": {
      const armed = samplerOverlay.view();
      return armed ? { name: armed.name } : null;
    }
    // A World Info entry is a shared F ILE entry, and its before-image is captured at the write edge
    // by the stagecraft revert, which has compare-and-set of its own. Nothing here reads one.
    case "wi":
      return null;
    case "extension":
      return effectExtension(target.name)?.read() ?? null;
  }
}

/**
 * A row left `pending` means the process died between the host write and the save that
 * would have reported it. The host's own value answers the only question that matters — did it land?
 * — and leaves one thing for the caller: saying so.
 */
export function reconcileEffectLedger(rows: EffectLedgerRow[]): { rows: EffectLedgerRow[]; notes: string[] } {
  const { rows: next, outcomes } = reconcileLedger(rows, { read: readEffectTarget });
  return { rows: next, notes: outcomes.map(({ row, outcome }) => `host change "${row.effect}" was ${outcome} when this chat reloaded`) };
}

/**
 * Put a recorded value back, for the targets this chat's effects own.
 *
 * A refusal is honest rather than silent: `ok: false` leaves the row `revert-failed` with its
 * before-image, and the author sees which change would not go back.
 */
export async function restoreCastFlags(group: string, flags: Array<{ member: string; disabled: boolean }>): Promise<boolean> {
  return (await setGroupMemberFlags(group, flags)).ok;
}

export async function restoreEffectTarget(row: EffectLedgerRow): Promise<boolean> {
  switch (row.target.kind) {
    case "cast": {
      const disabled = typeof row.before?.disabled === "boolean" ? row.before.disabled : null;
      if (disabled === null) return false;
      const result = await setGroupMemberDisabled(row.target.member, disabled, row.target.group || undefined);
      return result.ok;
    }
    case "background": {
      const name = typeof row.before?.name === "string" ? row.before.name : "";
      if (!name) return false;
      return (await applyBackground(name)).ok;
    }
    case "an": {
      const text = typeof row.before?.text === "string" ? row.before.text : "";
      // An empty before-image means there was no note, and clearing goes through the AN seam's own
      // path: `/note ""` is a no-op in ST (authors-note.js guards `if (text)`).
      return (text ? await applyCharacterAN(text) : await clearCharacterAN()).ok;
    }
    // A preset is a per-request overlay that never wrote the host, so nothing goes back.
    case "preset":
    case "wi":
      return false;
    case "extension": {
      const extension = effectExtension(row.target.name);
      return extension ? extension.restore(row.before) : false;
    }
  }
}
