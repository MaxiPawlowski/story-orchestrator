import React from "react";
import QuestsEditor from "./QuestsEditor";
import MilestonesEditor from "./MilestonesEditor";
import WidgetsEditor from "./WidgetsEditor";
import { ChecksEditor, QualityDisplayEditor } from "./ChecksEditor";
import RumorsEditor from "./RumorsEditor";
import PatternsEditor from "./PatternsEditor";

const GameEditor: React.FC = () => (
  <div data-so="game-editor" className="flex flex-col gap-3">
    <QuestsEditor />
    <MilestonesEditor />
    <ChecksEditor />
    <QualityDisplayEditor />
    <WidgetsEditor />
    <RumorsEditor />
    <PatternsEditor />
  </div>
);

export default GameEditor;
