import { estimateTokens } from "@extraction/callBudget";
import { isRecord } from "@utils/guards";
import { lorebookFileId } from "@utils/string";

export interface BudgetCut {
  book: string;
  uid: number;
  comment: string;
  via: "forced" | "story";
}

export interface BudgetScan {
  chatId: string;
  overflowed: boolean;
  cut: BudgetCut[];
  consumer: string | null;
}

export interface LoreBudgetView {
  chatId: string;
  scans: number;
  starved: Array<BudgetCut & { count: number }>;
  consumer: string | null;
  lastCut: BudgetCut[];
  cap: number | null;
  storyTokens: number;
}

export const LORE_BUDGET_RING = 10;
export const LORE_BUDGET_STARVED = 2;
export const LORE_BUDGET_UNCAPPED_TOKENS = 2500;

interface ScanEntry {
  world: string;
  uid: number;
  comment: string;
  content: string;
  disable: boolean;
}

const asEntry = (value: unknown): ScanEntry | null => (isRecord(value) && typeof value.world === "string" && typeof value.uid === "number"
  ? { world: value.world, uid: value.uid, comment: typeof value.comment === "string" ? value.comment : "", content: typeof value.content === "string" ? value.content : "",
    disable: value.disable === true }
  : null);

const entries = (value: unknown): ScanEntry[] => {
  const list = value instanceof Map ? [...value.values()] : Array.isArray(value) ? value : [];
  return list.map(asEntry).filter((entry): entry is ScanEntry => entry !== null);
};

const sameBook = (books: readonly string[], world: string) => books.some((book) => lorebookFileId(book).toLowerCase() === lorebookFileId(world).toLowerCase());

export interface ScanDoneRead {
  loop: number;
  overflowed: boolean;
  cut: ScanEntry[];
  activated: ScanEntry[];
  sorted: ScanEntry[];
}

export const readScanDone = (args: unknown): ScanDoneRead | null => {
  if (!isRecord(args)) return null;
  const state = isRecord(args.state) ? args.state : {};
  const fresh = isRecord(args.new) ? args.new : {};
  const activated = isRecord(args.activated) ? entries(args.activated.entries) : [];
  const budget = isRecord(args.budget) ? args.budget : {};
  const overflowed = budget.overflowed === true;
  const on = new Set(activated.map((entry) => `${entry.world}.${entry.uid}`));
  const cut = overflowed ? entries(fresh.successful).filter((entry) => !on.has(`${entry.world}.${entry.uid}`)) : [];
  return { loop: typeof state.loopCount === "number" ? state.loopCount : 0, overflowed, cut, activated, sorted: entries(args.sortedEntries) };
};

export const storyBookTokens = (sorted: readonly ScanEntry[], books: readonly string[]): number =>
  sorted.filter((entry) => !entry.disable && sameBook(books, entry.world)).reduce((sum, entry) => sum + estimateTokens(entry.content), 0);

const consumerOf = (activated: readonly ScanEntry[]): string | null => {
  const sizes = new Map<string, number>();
  for (const entry of activated) sizes.set(entry.world, (sizes.get(entry.world) ?? 0) + estimateTokens(entry.content));
  return [...sizes.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? null;
};

export const scanCuts = (read: ScanDoneRead, books: readonly string[], forced: ReadonlySet<string>): BudgetCut[] => read.cut
  .filter((entry) => sameBook(books, entry.world))
  .map((entry) => ({ book: entry.world, uid: entry.uid, comment: entry.comment, via: forced.has(`${entry.world}.${entry.uid}`) ? "forced" as const : "story" as const }));

export class LoreBudgetLedger {
  private scans: BudgetScan[] = [];
  private current: BudgetScan | null = null;
  private cap: number | null = null;
  private storyTokens = 0;
  private chat: string | null = null;

  note(chatId: string, read: ScanDoneRead, books: readonly string[], forced: ReadonlySet<string>, cap: number | null) {
    if (this.chat !== chatId) {
      this.scans = [];
      this.current = null;
      this.chat = chatId;
    }
    this.cap = cap;
    this.storyTokens = storyBookTokens(read.sorted, books);
    if (!this.current || read.loop <= 1) {
      this.current = { chatId, overflowed: false, cut: [], consumer: null };
      this.scans.push(this.current);
      if (this.scans.length > LORE_BUDGET_RING) this.scans.shift();
    }
    const scan = this.current;
    scan.overflowed ||= read.overflowed;
    const seen = new Set(scan.cut.map((cut) => `${cut.book}.${cut.uid}`));
    for (const cut of scanCuts(read, books, forced)) if (!seen.has(`${cut.book}.${cut.uid}`)) scan.cut.push(cut);
    if (read.activated.length) scan.consumer = consumerOf(read.activated);
  }

  view(chatId: string | null): LoreBudgetView | null {
    if (chatId === null || this.chat !== chatId) return null;
    const counts = new Map<string, BudgetCut & { count: number }>();
    for (const scan of this.scans) {
      for (const cut of scan.cut) {
        const key = `${cut.book}.${cut.uid}`;
        const row = counts.get(key);
        counts.set(key, row ? { ...row, via: row.via === "forced" ? "forced" : cut.via, count: row.count + 1 } : { ...cut, count: 1 });
      }
    }
    const starved = [...counts.values()].filter((row) => row.count >= LORE_BUDGET_STARVED).sort((left, right) => right.count - left.count || left.uid - right.uid);
    const consumers = this.scans.filter((scan) => scan.cut.length).map((scan) => scan.consumer).filter((book): book is string => book !== null);
    const consumer = consumers.length ? consumers[consumers.length - 1] : null;
    return { chatId, scans: this.scans.length, starved, consumer, lastCut: this.scans.at(-1)?.cut ?? [], cap: this.cap, storyTokens: this.storyTokens };
  }
}

export const loreBudgetLedger = new LoreBudgetLedger();

export const loreBudgetView = (chatId: string | null): LoreBudgetView | undefined => loreBudgetLedger.view(chatId) ?? undefined;

export const uncappedFinding = (view: LoreBudgetView | undefined): { cap: number; tokens: number } | null =>
  view && view.cap === 0 && view.storyTokens > LORE_BUDGET_UNCAPPED_TOKENS ? { cap: view.cap, tokens: view.storyTokens } : null;
