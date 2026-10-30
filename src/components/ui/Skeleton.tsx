import { cx } from "./cx";

export interface SkeletonProps {
  lines?: number;
  label?: string;
  className?: string;
}

export const LOADING_LABEL = "Loading…";

export const Skeleton = ({ lines = 3, label = LOADING_LABEL, className }: SkeletonProps) => (
  <div role="status" aria-label={label} aria-busy="true" data-so="skeleton" className={cx("so-skeleton", className)}>
    {Array.from({ length: Math.max(1, lines) }, (_, index) => <span key={index} className="so-skeleton-line" aria-hidden="true" />)}
  </div>
);

export default Skeleton;
