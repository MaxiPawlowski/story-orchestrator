import React from "react";

type Props = {
  title: string;
  i18nKey?: string;
  className?: string;
};

const HelpTooltip: React.FC<Props> = ({ title, i18nKey, className }) => (
  <span
    className={[
      "fa-solid fa-circle-question text-[11px] text-slate-400",
      className ?? "",
    ].join(" ").trim()}
    title={title}
    data-i18n={i18nKey ? `[title]${i18nKey}` : undefined}
    role="img"
    aria-label={title}
  />
);

export default HelpTooltip;
