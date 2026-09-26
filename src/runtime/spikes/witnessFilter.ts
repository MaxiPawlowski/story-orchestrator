export const IGNORE = Symbol.for("ignore");

export interface WitnessRow {
  name?: unknown;
  is_user?: unknown;
  mes?: unknown;
  extra?: unknown;
  [key: string]: unknown;
}

export interface FilterOutcome {
  hidden: number;
  kept: number;
  unknown: number;
}

export type WitnessesOf = (row: WitnessRow) => readonly string[] | null;

const keyOf = (value: unknown): object | null => (typeof value === "object" && value !== null ? value : null);

export const presenceOf = (enabled: readonly string[], row: WitnessRow): string[] => {
  const speaker = row.is_user !== true && typeof row.name === "string" ? [row.name] : [];
  return [...new Set([...enabled, ...speaker])];
};

export class WitnessBook {
  private authored = new WeakMap<object, readonly string[]>();
  private readonly present = new WeakMap<object, readonly string[]>();

  author(extra: object, names: readonly string[]) {
    this.authored.set(extra, [...names]);
  }

  record(extra: object, names: readonly string[]) {
    this.present.set(extra, [...names]);
  }

  clearAuthored() {
    this.authored = new WeakMap();
  }

  presence(row: WitnessRow): readonly string[] | null {
    const key = keyOf(row.extra);
    return key ? this.present.get(key) ?? null : null;
  }

  readonly lookup: WitnessesOf = (row) => {
    const key = keyOf(row.extra);
    return key ? this.authored.get(key) ?? this.present.get(key) ?? null : null;
  };
}

export const filterUnwitnessed = (chat: WitnessRow[], drafted: string, witnessesOf: WitnessesOf, keepLast: boolean): FilterOutcome => {
  const outcome: FilterOutcome = { hidden: 0, kept: 0, unknown: 0 };
  chat.forEach((row, index) => {
    if ((keepLast && index === chat.length - 1) || (row.is_user !== true && row.name === drafted)) {
      outcome.kept += 1;
      return;
    }
    const witnesses = witnessesOf(row);
    if (witnesses === null) {
      outcome.unknown += 1;
      return;
    }
    if (witnesses.includes(drafted)) {
      outcome.kept += 1;
      return;
    }
    chat[index] = { ...row, extra: { ...(keyOf(row.extra) ?? {}), [IGNORE]: true } };
    outcome.hidden += 1;
  });
  return outcome;
};

export interface WitnessAgreement {
  total: number;
  agree: number;
  rate: number;
  disagreements: number[];
}

const sameSet = (left: readonly string[], right: readonly string[]) => left.length === right.length && [...left].sort().join("\u0000") === [...right].sort().join("\u0000");

export const scoreWitnessAgreement = (presence: Record<number, readonly string[] | null>, labels: Record<number, readonly string[]>): WitnessAgreement => {
  const indexes = Object.keys(labels).map(Number).sort((left, right) => left - right);
  const disagreements = indexes.filter((index) => {
    const recorded = presence[index];
    return !recorded || !sameSet([...new Set(recorded)], [...new Set(labels[index])]);
  });
  const agree = indexes.length - disagreements.length;
  return { total: indexes.length, agree, rate: indexes.length ? agree / indexes.length : 0, disagreements };
};
