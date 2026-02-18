import React from "react";

type Feedback = { type: "success" | "error"; message: string };

type Props = { feedback: Feedback | null };

const FeedbackAlert: React.FC<Props> = ({ feedback }) => {
  if (!feedback) return null;
  return (
    <div
      className={`rounded border px-3 py-2 text-sm shadow-sm ${
        feedback.type === "success"
          ? "st-alert-success"
          : "st-alert-error"
      }`}
    >
      {feedback.message}
    </div>
  );
};

export default FeedbackAlert;

