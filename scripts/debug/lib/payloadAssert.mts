// v2.3 plan 05's live gate is "the pinned fact is in the drafted member's payload, and gone after
// the edit" — a claim about a request that was actually sent. `so-scenario`'s closed vocabulary had
// no verb for it, so the gate could only have been improvised with evals.
//
// The design is shaped by the J5.8 false positive (2026-09-22): a whole-body search PASSES on text
// that is merely in the shared transcript, which every member legitimately receives. So a needle may
// name the BLOCK it must be found in (an injected prompt key — what the extension itself installs)
// or the REGION of a raw request body, and a named scope that is missing is a failure rather than a
// silent fallback to a whole-body search. That is the difference between "the private block carries
// it" and "it appears somewhere in the request".
//
// Two sources, one shape: the runtime's own capture ring (always on, per-block values, `blocks`) and
// the `st-payload` HTTP ring (needs arming, per-member raw bodies, `body`).

export interface PayloadBlockLike {
  key: string;
  value: string;
}

export interface PayloadEntryLike {
  /** `current` (the blocks the next prompt would carry), `capture` (a generation's blocks) or `http` (a raw body). */
  source?: string | null;
  /** The group member whose draft this capture was taken during; null/absent when the source cannot say. */
  member?: string | null;
  capturedAt?: string | null;
  /** Injected prompt blocks, when the source is the runtime's own ring or the current prompts. */
  blocks?: PayloadBlockLike[] | null;
  /** The raw request body, when the source is the `st-payload` ring. */
  body?: string | null;
}

export interface PayloadNeedle {
  /** Only captures taken while this member was drafted. Absent means any capture. */
  member?: string | null;
  /** An injected prompt block key; the search is restricted to that block's value. */
  key?: string | null;
  /** A marker line in a raw body; the search is restricted to the region at its LAST occurrence. */
  within?: string | null;
  text: string;
}

export interface PayloadExpectation {
  payloadContains?: PayloadNeedle[];
  payloadAbsent?: PayloadNeedle[];
}

const asText = (value: unknown): string => (typeof value === "string" ? value : "");

export const memberMatches = (entry: PayloadEntryLike, member?: string | null): boolean => {
  if (!member) return true;
  return String(entry.member ?? "").toLowerCase() === member.toLowerCase();
};

/** The region `within` delimits in a raw body: from its last occurrence to the next blank line. */
export function regionOf(body: string, within?: string | null): { region: string } | { error: string } {
  if (!within) return { region: body };
  const start = body.lastIndexOf(within);
  if (start < 0) return { error: `the region marker ${JSON.stringify(within)} is not in this capture` };
  const rest = body.slice(start + within.length);
  const end = rest.search(/\n\s*\n/);
  return { region: end < 0 ? rest : rest.slice(0, end) };
}

/** What one capture offers the search, given the needle's scope. `error` means the scope is absent. */
function scopeOf(entry: PayloadEntryLike, needle: PayloadNeedle): { text: string } | { error: string } {
  if (needle.key) {
    const block = (entry.blocks ?? []).find((candidate) => candidate.key === needle.key);
    if (!block) {
      const keys = (entry.blocks ?? []).map((candidate) => candidate.key);
      return { error: `no injected block named ${JSON.stringify(needle.key)} in this capture (blocks: ${keys.join(", ") || "none"})` };
    }
    return { text: asText(block.value) };
  }
  if (needle.within) {
    const region = regionOf(asText(entry.body), needle.within);
    return "error" in region ? region : { text: region.region };
  }
  // No scope named: everything the capture holds. Deliberately permissive, and the reason the
  // failure text says which scope was searched, so a loose check is visible in the record.
  const blocks = (entry.blocks ?? []).map((block) => asText(block.value)).join("\n");
  return { text: `${blocks}\n${asText(entry.body)}` };
}

const scopeName = (needle: PayloadNeedle): string =>
  needle.key ? `in block ${JSON.stringify(needle.key)}` : needle.within ? `inside ${JSON.stringify(needle.within)}` : "anywhere in the capture";

const check = (entries: PayloadEntryLike[], needles: PayloadNeedle[], want: boolean, label: string, failures: string[]): void => {
  needles.forEach((needle, index) => {
    const where = `${label}[${index}]`;
    if (!needle || typeof needle.text !== "string" || !needle.text.length) {
      // An empty needle matches everything, so a "contains" built from one is a check that cannot fail.
      failures.push(`${where}: an empty text asserts nothing — remove the expectation or name the text`);
      return;
    }
    const eligible = entries.filter((entry) => memberMatches(entry, needle.member));
    if (!eligible.length) {
      const members = [...new Set(entries.map((entry) => String(entry.member ?? "(unknown)")))];
      failures.push(`${where}: no captured payload for member ${JSON.stringify(needle.member ?? "any")} (captures were taken for: ${members.join(", ") || "none"})`);
      return;
    }
    const scopes: string[] = [];
    for (const entry of eligible) {
      const scope = scopeOf(entry, needle);
      if ("error" in scope) {
        failures.push(`${where}: ${scope.error}`);
        return;
      }
      scopes.push(scope.text);
    }
    const found = scopes.some((scope) => scope.includes(needle.text));
    if (found !== want) {
      // The sources searched are named: `current` is the next prompt's blocks, not a request that was
      // sent, and a reader must be able to tell which claim a green line is making.
      const sources = [...new Set(eligible.map((entry) => String(entry.source ?? "unknown")))];
      failures.push(`${where}: expected ${JSON.stringify(needle.text)} ${want ? "" : "NOT "}present ${scopeName(needle)} for member ${needle.member ?? "any"}, but it was ${found ? "present" : "absent"} (searched: ${sources.join(", ")})`);
    }
  });
};

/** Failures, in the same shape `evaluateExpect` collects: empty means the assertion held. */
export function payloadFailures(entries: PayloadEntryLike[], expected: PayloadExpectation): string[] {
  const failures: string[] = [];
  if (!Array.isArray(entries) || !entries.length) {
    const wants = (expected.payloadContains?.length ?? 0) + (expected.payloadAbsent?.length ?? 0);
    if (wants) failures.push("payload: no generation payload was captured — nothing has generated in this chat yet, or the runtime ring is empty (an empty ring cannot answer a question about a request)");
    return failures;
  }
  check(entries, expected.payloadContains ?? [], true, "payloadContains", failures);
  check(entries, expected.payloadAbsent ?? [], false, "payloadAbsent", failures);
  return failures;
}
