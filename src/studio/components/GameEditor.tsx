import React from "react";
import QuestsEditor from "./QuestsEditor";
import MilestonesEditor from "./MilestonesEditor";
import WidgetsEditor from "./WidgetsEditor";
import { ChecksEditor, QualityDisplayEditor } from "./ChecksEditor";

const GameEditor: React.FC = () => (
  <div data-so="game-editor" className="flex flex-col gap-3">
    <QuestsEditor />
    <MilestonesEditor />
    <ChecksEditor />
    <QualityDisplayEditor />
    <WidgetsEditor />
  </div>
);

export default GameEditor;
