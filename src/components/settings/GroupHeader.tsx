const SCOPE_COPY = {
  install: { label: "this install", note: "Changes here affect every chat." },
  chat: { label: "this chat", note: null },
  story: { label: "this story", note: null },
} as const;

export const GroupHeader = ({ title, scope, id }: { title: string; scope: keyof typeof SCOPE_COPY; id?: string }) => (
  <div className="flex flex-col gap-1">
    <div id={id} className="font-medium text-sm">
      {title} <span className="opacity-60 font-normal">— {SCOPE_COPY[scope].label}</span>
    </div>
    {SCOPE_COPY[scope].note && <div className="text-xs opacity-60">{SCOPE_COPY[scope].note}</div>}
  </div>
);
