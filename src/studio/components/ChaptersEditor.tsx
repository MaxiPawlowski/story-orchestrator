import React, { useState } from "react";
import {
  CHAPTER_KINDS, OPEN_THREAD_POLICIES, RECORD_STYLES, type Chapter, type ChapterKind, type ChapterSealPolicy, type IllustrationLook, type OpenThreadPolicy, type RecordStyle,
} from "@engine/index";
import HelpTooltip from "@components/studio/HelpTooltip";
import { useDraftStore } from "../draft";
import BriefingEditor from "./BriefingEditor";
import { composeChapterBriefing } from "@engine/index";
import { requestBriefing } from "@runtime/briefingRequest";
import { addChapter, removeChapter, setChapterPolicy, setCheckpointChapter, updateChapter } from "../mutations";

const KIND_LABELS: Record<ChapterKind, string> = { chapter: "Chapter", interlude: "Interlude (seals with the next chapter)" };
const THREAD_LABELS: Record<OpenThreadPolicy, string> = { carry: "Carry into the next chapter", close: "Close them", decide: "Let the record decide" };
const STYLE_LABELS: Record<RecordStyle, string> = { prose: "Prose", chronicle: "Chronicle" };

const HELP = "Chapters group checkpoints into acts. When play leaves a chapter, its memories can be sealed into one written record that stands in for them in later prompts. "
  + "Once one chapter is declared, every checkpoint needs one.";

const withPolicy = (seal: ChapterSealPolicy | undefined, patch: Partial<ChapterSealPolicy>): ChapterSealPolicy =>
  Object.fromEntries(Object.entries({ ...seal, ...patch }).filter(([, value]) => value !== undefined)) as ChapterSealPolicy;

const textOrUndefined = (value: string) => (value.trim() ? value : undefined);

const LOOK_HELP = "Replaces the story's visual direction for pictures while play is in this chapter. "
  + "Per-character looks for a chapter go in chapters[].illustrations.appearances.";

const withStyle = (look: IllustrationLook | undefined, style: string): IllustrationLook | undefined => {
  const { style: _old, ...rest } = look ?? {};
  const next = style ? { ...rest, style } : rest;
  return Object.keys(next).length ? next : undefined;
};

const CHAPTER_BRIEFING_HINT = "Shown when this chapter opens: what the player may know at that point, never what is still ahead in it.";

const ChapterRow = ({ chapter }: { chapter: Chapter }) => {
  const mutate = useDraftStore((state) => state.mutate);
  const draft = useDraftStore((state) => state.draft);
  const update = (patch: Partial<Omit<Chapter, "id">>) => mutate((current) => updateChapter(current, chapter.id, patch));
  const policy = (patch: Partial<ChapterSealPolicy>) => mutate((current) => setChapterPolicy(current, chapter.id, withPolicy(chapter.seal, patch)));
  const seal = chapter.seal ?? {};
  const name = chapter.id;
  return (
    <div data-so="chapter-row" data-chapter={chapter.id} className="st-subpanel flex flex-col gap-2 p-2">
      <div className="flex flex-wrap items-end gap-2">
        <span className="st-pill px-2 py-0.5 text-[11px]">{chapter.id}</span>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="text-xs st-muted">Title</span>
          <input className="text_pole st-input" aria-label={`${name} title`} value={chapter.title} onChange={(event) => update({ title: event.target.value })} />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="text-xs st-muted">Player title</span>
          <input className="text_pole st-input" aria-label={`${name} player title`} placeholder={chapter.title} value={chapter.player_title ?? ""}
            onChange={(event) => update({ player_title: textOrUndefined(event.target.value) })} />
        </label>
        <button type="button" className="st-button danger" aria-label={`Remove chapter ${name}`} onClick={() => mutate((current) => removeChapter(current, chapter.id))}>×</button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs st-muted">Kind</span>
          <select className="text_pole st-input" aria-label={`${name} kind`} value={chapter.kind ?? "chapter"}
            onChange={(event) => update({ kind: event.target.value === "interlude" ? "interlude" : undefined })}>
            {CHAPTER_KINDS.map((kind) => <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" aria-label={`${name} ends the story`} checked={chapter.final === true} onChange={(event) => update({ final: event.target.checked || undefined })} />
          Ends the story
        </label>
        <label className="flex flex-1 flex-col gap-1 text-sm">
          <span className="text-xs st-muted">Visual direction<HelpTooltip title={LOOK_HELP} /></span>
          <input className="text_pole st-input" aria-label={`${name} visual direction`} placeholder="Story default" value={chapter.illustrations?.style ?? ""}
            onChange={(event) => update({ illustrations: withStyle(chapter.illustrations, event.target.value) })} />
        </label>
      </div>
      <fieldset data-so="chapter-policy" className="flex flex-wrap items-end gap-2 border-0 p-0">
        <legend className="text-xs st-muted">When it seals</legend>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs st-muted">Open threads</span>
          <select className="text_pole st-input" aria-label={`${name} open threads`} value={seal.open_threads ?? ""}
            onChange={(event) => policy({ open_threads: (OPEN_THREAD_POLICIES as readonly string[]).includes(event.target.value) ? event.target.value as OpenThreadPolicy : undefined })}>
            <option value="">Default (carry)</option>
            {OPEN_THREAD_POLICIES.map((value) => <option key={value} value={value}>{THREAD_LABELS[value]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs st-muted">Messages kept verbatim</span>
          <input type="number" min={0} className="text_pole st-input w-24" aria-label={`${name} messages kept verbatim`} placeholder="6" value={seal.keep_tail ?? ""}
            onChange={(event) => policy({ keep_tail: event.target.value === "" ? undefined : Math.max(0, Math.floor(Number(event.target.value) || 0)) })} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs st-muted">Record style</span>
          <select className="text_pole st-input" aria-label={`${name} record style`} value={seal.record_style ?? ""}
            onChange={(event) => policy({ record_style: (RECORD_STYLES as readonly string[]).includes(event.target.value) ? event.target.value as RecordStyle : undefined })}>
            <option value="">Default (prose)</option>
            {RECORD_STYLES.map((value) => <option key={value} value={value}>{STYLE_LABELS[value]}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" aria-label={`${name} leaves the prompt once sealed`} checked={seal.fold_messages !== false}
            onChange={(event) => policy({ fold_messages: event.target.checked ? undefined : false })} />
          Leaves the prompt once sealed
        </label>
      </fieldset>
      <details data-so="chapter-briefing" open={Boolean(chapter.briefing)}>
        <summary className="text-xs st-muted cursor-pointer">Chapter briefing</summary>
        <BriefingEditor name={`${name} briefing`} hint={CHAPTER_BRIEFING_HINT} briefing={chapter.briefing}
          onChange={(briefing) => update({ briefing })}
          onPreview={() => requestBriefing({ kind: "preview", view: null, chapter: composeChapterBriefing(draft, chapter.id) })} />
      </details>
    </div>
  );
};

const CheckpointAssignment = () => {
  const draft = useDraftStore((state) => state.draft);
  const mutate = useDraftStore((state) => state.mutate);
  const chapters = draft.chapters ?? [];
  return (
    <div data-so="chapter-assignment" className="flex flex-col gap-1">
      <span className="text-xs st-muted">Checkpoints</span>
      {draft.checkpoints.map((checkpoint) => (
        <label key={checkpoint.id} className="flex items-center gap-2 text-sm">
          <span className="flex-1 truncate">{checkpoint.name || checkpoint.id}</span>
          <select className="text_pole st-input" aria-label={`Chapter of ${checkpoint.name || checkpoint.id}`} value={checkpoint.chapter ?? ""}
            onChange={(event) => mutate((current) => setCheckpointChapter(current, checkpoint.id, event.target.value))}>
            <option value="">— none —</option>
            {chapters.map((chapter) => <option key={chapter.id} value={chapter.id}>{chapter.title || chapter.id}</option>)}
            {checkpoint.chapter && !chapters.some((chapter) => chapter.id === checkpoint.chapter) ? <option value={checkpoint.chapter}>{checkpoint.chapter} (unknown)</option> : null}
          </select>
        </label>
      ))}
    </div>
  );
};

const ChaptersEditor: React.FC = () => {
  const declared = useDraftStore((state) => state.draft.chapters);
  const chapters = declared ?? [];
  const mutate = useDraftStore((state) => state.mutate);
  const [newId, setNewId] = useState("");
  const taken = chapters.some((chapter) => chapter.id === newId.trim());
  const add = () => {
    const id = newId.trim();
    mutate((current) => addChapter(current, id ? { id, title: id } : undefined));
    setNewId("");
  };
  return (
    <div data-so="chapters" className="st-subpanel flex flex-col gap-3 p-3">
      <div className="text-sm font-medium">Chapters <span className="st-muted font-normal">— acts the story is sealed in</span><HelpTooltip title={HELP} /></div>
      {chapters.length === 0 ? <div className="text-xs st-muted">None. A story without chapters is played as one long act.</div> : null}
      {chapters.map((chapter) => <ChapterRow key={chapter.id} chapter={chapter} />)}
      <div className="flex items-center gap-2">
        <input className="text_pole st-input w-40" aria-label="New chapter id" placeholder="chapter id" value={newId} onChange={(event) => setNewId(event.target.value)} />
        <button type="button" className="st-button secondary" disabled={taken} onClick={add}>+ Chapter</button>
      </div>
      {chapters.length ? <CheckpointAssignment /> : null}
    </div>
  );
};

export default ChaptersEditor;
