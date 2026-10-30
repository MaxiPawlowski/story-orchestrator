export interface ExtensionsBlockProps {
  active: boolean;
  onOpenWorkspace: () => void;
  onOpenSetup: () => void;
}

export const EXTENSIONS_BLOCK_COPY = {
  title: "Story Orchestrator",
  active: "A story is active in this chat.",
  idle: "Open a story to begin.",
  open: "Open Story Orchestrator",
  setup: "Story setup and repair",
};

const ExtensionsBlock = ({ active, onOpenWorkspace, onOpenSetup }: ExtensionsBlockProps) => (
  <div className="inline-drawer">
    <div className="inline-drawer-toggle inline-drawer-header">
      <b>{EXTENSIONS_BLOCK_COPY.title}</b>
      <div className="inline-drawer-icon fa-solid fa-circle-chevron-down down" />
    </div>
    <div className="inline-drawer-content">
      <div data-so="extensions-block" className="flex flex-col gap-2 py-2">
        <span data-so="extensions-status">{active ? EXTENSIONS_BLOCK_COPY.active : EXTENSIONS_BLOCK_COPY.idle}</span>
        <div className="so-actions">
          <button id="so-open-workspace" type="button" className="menu_button" onClick={onOpenWorkspace}>{EXTENSIONS_BLOCK_COPY.open}</button>
          <button id="so-open-setup" type="button" className="menu_button" onClick={onOpenSetup}>{EXTENSIONS_BLOCK_COPY.setup}</button>
        </div>
      </div>
    </div>
  </div>
);

export default ExtensionsBlock;
