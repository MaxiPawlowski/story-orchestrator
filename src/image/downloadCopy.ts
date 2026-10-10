import type { DownloadCard, DownloadJob, ModelProvider, ModelRef } from "@services/stHost/modelDownloads";

export const gib = (bytes: number | null): string => (bytes === null ? "unknown size" : `${(bytes / 1024 ** 3).toFixed(2)} GiB`);

export function readModelRef(provider: ModelProvider, fields: { version: string; repo: string; file: string; revision: string }): ModelRef | string {
  if (provider === "civitai") {
    const text = fields.version.trim();
    const id = Number(/modelVersionId=(\d+)/.exec(text)?.[1] ?? /^\d+$/.exec(text)?.[0]);
    return Number.isInteger(id) && id > 0 ? { versionId: id } : "Enter the Civitai model version id (the number after modelVersionId=).";
  }
  const repo = fields.repo.trim();
  const file = fields.file.trim();
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) return "Enter the Hugging Face repository as owner/name.";
  if (!file) return "Enter the file path inside the repository.";
  return { repo, file, ...(fields.revision.trim() ? { revision: fields.revision.trim() } : {}) };
}

export function cardLines(card: DownloadCard): string[] {
  return [
    `${card.name} · ${gib(card.sizeBytes)}`,
    card.source,
    `Into ${card.root} (${card.kind})`,
    card.present ? "Already installed (same SHA256)." : card.fits
      ? `Free there: ${gib(card.freeBytes)}; it keeps ${gib(card.marginBytes)} spare.`
      : `Not enough space there: ${gib(card.freeBytes)} free, the file plus a ${gib(card.marginBytes)} margin is needed.`,
    ...(card.resumeFromBytes ? [`Resumes from ${gib(card.resumeFromBytes)} already downloaded.`] : []),
    ...(card.nsfw ? ["The source marks this model as adult content."] : []),
    ...(card.warning ? [card.warning] : []),
  ];
}

export const jobLine = (job: DownloadJob): string => {
  const progress = job.total ? ` ${Math.floor((100 * job.bytes) / job.total)}%` : "";
  if (job.state === "failed") return `${job.name}: failed. ${job.error ?? ""}`.trim();
  if (job.state === "done") return `${job.name}: verified and installed.`;
  if (job.state === "cancelled") return `${job.name}: stopped; the partial file is kept and resumes next time.`;
  return `${job.name}: ${job.state}${progress}`;
};
