import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const source = process.argv[2] ?? "C:/dev/SillyTavern-MainBranch/data/default-user/worlds/Adolion World.json";
const bytes = readFileSync(source);
const book = JSON.parse(bytes.toString("utf8"));
const entries = Object.values(book.entries ?? {});

const profile = {
  _about: "v2.5 plan 09 SP8 W4 book profile: the SIZE shape of the Adolion World lorebook (entry count, per-entry title/content/key lengths, initial letter, switch state) with no text. The deterministic W4 ratio is measured on a book synthesised from these numbers; the live W4 leg pads with the real book on a lane. Regenerate with scripts/spike/v25-09/adolion-profile.mjs <book.json>.",
  source: { name: "Adolion World", sha256: createHash("sha256").update(bytes).digest("hex"), entries: entries.length },
  entries: entries.map((entry) => ({
    initial: (String(entry.comment ?? "").trim()[0] ?? "#").toUpperCase(),
    title: String(entry.comment ?? "").trim().length,
    content: String(entry.content ?? "").length,
    keys: (Array.isArray(entry.key) ? entry.key : []).map((key) => String(key).length),
    disabled: entry.disable === true,
  })),
};

const out = join(ROOT, "test", "fixtures", "spikes", "v25-09", "adolion-world-profile.json");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(profile, null, 1)}\n`.replace(/\r?\n/g, "\r\n"));
