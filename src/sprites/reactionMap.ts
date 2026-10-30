const LABEL_REACTION: Readonly<Record<string, string>> = {
  joy: "nod", happy: "nod", love: "nod", approval: "nod", admiration: "nod", gratitude: "nod", caring: "nod",
  amusement: "giggle", surprise: "surprise", surprised: "surprise", fear: "surprise", realization: "surprise", excitement: "surprise",
  sad: "sigh", sadness: "sigh", grief: "sigh", remorse: "sigh", disappointment: "sigh",
  anger: "no", angry: "no", annoyance: "no", disgust: "no", disapproval: "no",
  embarrassment: "shy", nervousness: "shy", curiosity: "tilt", confusion: "tilt", thinking: "think", desire: "shy",
};

export const reactionFor = (label: string): string | undefined => LABEL_REACTION[label.toLowerCase()];
