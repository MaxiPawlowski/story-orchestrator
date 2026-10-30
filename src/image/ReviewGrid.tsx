import { useState } from "react";
import ReactDOM from "react-dom/client";
import { imageReview } from "@services/stHost/image";
import type { ImageCandidate, ImagePlan, ImageReviewer } from "./runtime";
import "./styles.css";

const Grid = ({ plan, initial, rerender, choose }: { plan: ImagePlan; initial: ImageCandidate[]; rerender: (index: number) => Promise<ImageCandidate>; choose: (index: number) => void }) => {
  const [candidates, setCandidates] = useState(initial);
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  return (
    <div id="so-image-review" className="so-image-review">
      <h3>{plan.caption}</h3>
      <div className="so-image-review-grid">
        {candidates.map((candidate, index) => (
          <figure key={candidate.path} className={index === selected ? "so-image-selected" : ""}>
             <button type="button" aria-label={`Choose image ${index + 1}`} aria-pressed={index === selected} onClick={() => { setSelected(index); choose(index); }}>
               <img src={candidate.path} alt={`Candidate ${index + 1}`} />
             </button>
            <figcaption>
              seed {candidate.seed}
              <button type="button" className="menu_button" aria-label={`Redo image ${index + 1}`} disabled={busy} onClick={() => {
                setBusy(true);
                void rerender(index).then((fresh) => setCandidates((items) => items.map((item, at) => at === index ? fresh : item))).finally(() => setBusy(false));
              }}>Redo</button>
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
};

export const reviewImages: ImageReviewer = async (plan, candidates, rerender) => {
  const container = document.createElement("div");
  const root = ReactDOM.createRoot(container);
  let selected = 0;
  root.render(<Grid plan={plan} initial={candidates} rerender={rerender} choose={(index) => { selected = index; }} />);
  try {
    const choice = await imageReview(container);
    return choice.ok && choice.accepted ? selected : null;
  }
  finally { root.unmount(); }
};
