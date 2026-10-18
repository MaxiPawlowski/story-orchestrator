import type { BusyJob } from "@runtime/busy";
import { busyText } from "@runtime/pipeline";

export default function MediaPending({ jobs }: { jobs: readonly BusyJob[] }) {
  const media = jobs.filter((job) => job.kind === "image" || job.kind === "sprite");
  if (!media.length) return null;
  return <div className="so-media-pending" role="status" aria-busy="true">
    {media.some((job) => job.kind === "sprite") && <span className="so-sprite-pending" aria-hidden="true" />}
    <span>{busyText(media)}</span>
  </div>;
}
