import React from "react";

type Feedback = { type: "success" | "error"; message: string };

type Props = { feedback: Feedback | null };

const FeedbackAlert: React.FC<Props> = ({ feedback }) => {
  if (!feedback) return null;
  return (
    <div
      className={`rounded border px-3 py-2 text-sm shadow-sm ${
        feedback.type === "success"
          ? "border-emerald-500 bg-emerald-500/10 text-emerald-200"
          : "border-rose-500 bg-rose-500/10 text-rose-200"
      }`}
    >
      {feedback.message}
    </div>
  );
};

export default FeedbackAlert;

