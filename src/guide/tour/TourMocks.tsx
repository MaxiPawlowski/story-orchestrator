import { useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import { FEATURE_CONTROLS } from "@runtime/featureControls";
import type { StoryFeatureId } from "@engine/featurePolicy";
import { TOUR_COPY } from "@features/tourCopy";
import type { TourChipTone, TourMockId, TourSettingMock } from "./tourTypes";

const Chip = ({ tone = "plain", children }: { tone?: TourChipTone; children: ReactNode }) => <span className={`so-tour-chip so-tour-chip-${tone}`}>{children}</span>;

const Frame = ({ caption, onReset, children }: { caption: string; onReset?: () => void; children: ReactNode }) => (
  <figure className="so-tour-mock" data-so="tour-mock" aria-label={caption}>
    <figcaption className="so-tour-mock-cap"><span>{caption}</span><b>{TOUR_COPY.tryIt}</b></figcaption>
    {children}
    <div className="so-tour-mock-foot"><span>{TOUR_COPY.example}</span>
      {onReset && <button type="button" className="menu_button" data-so="tour-mock-reset" onClick={onReset}>{TOUR_COPY.reset}</button>}</div>
  </figure>
);

const Avatar = ({ who }: { who: "narrator" | "guide" | "you" }) => <span className={`so-tour-ava so-tour-ava-${who}`}
  aria-hidden="true">{who === "narrator" ? "N" : who === "guide" ? "G" : "Y"}</span>;

const Message = ({ who, name, children, notes }: { who: "narrator" | "guide" | "you"; name: string; children: ReactNode; notes?: string[] }) => (
  <div className={`so-tour-mes${who === "you" ? " so-tour-mes-user" : ""}`}>
    <Avatar who={who} />
    <div><div className="so-tour-mes-name">{name}</div><div>{children}</div>
      {notes && <div className="so-tour-notes">{notes.map((note) => <span key={note}>{note}</span>)}</div>}</div>
  </div>
);

const Strip = ({ scene, chip }: { scene: string; chip?: { text: string; tone: TourChipTone } }) => (
  <div className="so-tour-strip" role="status"><span className="so-tour-scene">{scene}</span>{chip && <Chip tone={chip.tone}>{chip.text}</Chip>}</div>
);

const SettingsMock = () => {
  const id = useId();
  const [profile, setProfile] = useState("");
  return <Frame caption="Orchestrator › Connections" onReset={() => setProfile("")}>
    <div className="so-tour-pane">
      <label className="so-tour-row" htmlFor={id}><span>Memory model <Chip tone="warn">required</Chip></span>
        <select id={id} value={profile} onChange={(event) => setProfile(event.target.value)}>
          <option value="">No profile selected</option><option>A local model</option><option>A cloud model</option>
        </select></label>
      <div className="so-tour-row"><span>Judge</span><Chip>optional</Chip></div>
      <div className="so-tour-row"><span>Pictures</span><Chip>optional</Chip></div>
    </div>
    <Strip scene={profile ? "Ready" : "No story yet"} chip={profile ? { text: "memory model set", tone: "good" } : { text: "fix setup (1)", tone: "bad" }} />
  </Frame>;
};

const StartMock = () => {
  const [chosen, setChosen] = useState(false);
  return <Frame caption="Orchestrator › Library" onReset={() => setChosen(false)}>
    <div className="so-tour-pane">
      <div className="so-tour-card"><strong>Start</strong><span>New story · Import a story</span></div>
      <div className="so-tour-card so-tour-card-focus"><strong>Continue</strong><span>{chosen ? "Plays “The Sunken Ruins”." : "This chat plays nothing yet."}</span>
        {!chosen && <button type="button" className="menu_button so-tour-primary" onClick={() => setChosen(true)}>Choose a story</button>}</div>
      <div className="so-tour-card"><strong>Repair</strong><span>{chosen ? "This story still needs: the lorebook “Ruins lore”." : "Nothing missing."}</span></div>
    </div>
    <Strip scene={chosen ? "The Ruined Gate · calm" : "No story yet"} chip={chosen ? { text: "check setup (1)", tone: "warn" } : undefined} />
  </Frame>;
};

const BriefMock = () => {
  const [begun, setBegun] = useState(false);
  const [who, setWho] = useState("current");
  return <Frame caption="Before you start" onReset={() => setBegun(false)}>
    {begun ? <div className="so-tour-chat" role="log" aria-label="Example chat" tabIndex={0}>
      <Message who="narrator" name="Narrator">Rain hammers the ruined gate. <q>Stay close,</q> the guide says.</Message>
      <p className="so-tour-hint">Your persona now stays with this chat. <code>/story intro</code> opens the briefing again.</p>
    </div> : <div className="so-tour-pane so-tour-sheet">
      <strong>Before you start</strong>
      <p>A flooded ruin, a guide who knows the way in, and a gate that opens only from inside.</p>
      <fieldset className="so-tour-choice"><legend>Who you are in this story</legend>
        {[["current", "Play as my current persona"], ["other", "Choose another persona"], ["new", "Create a persona for this story"]].map(([value, label]) => (
          <label key={value}><input type="radio" name="so-tour-who" checked={who === value} onChange={() => setWho(value)} /> {label}</label>
        ))}
      </fieldset>
      <button type="button" className="menu_button so-tour-primary" onClick={() => setBegun(true)}>Begin</button>
    </div>}
  </Frame>;
};

const TurnMock = () => {
  const [turns, setTurns] = useState(0);
  const [lines, setLines] = useState<ReactNode[]>([]);
  const [chip, setChip] = useState<{ text: string; tone: TourChipTone } | undefined>(undefined);
  const chat = useRef<HTMLDivElement>(null);
  useEffect(() => { chat.current?.scrollTo?.(0, chat.current.scrollHeight); }, [lines]);
  const reset = () => { setTurns(0); setLines([]); setChip(undefined); };
  const send = () => {
    const next = turns + 1;
    setTurns(next);
    setLines((current) => [...current,
      <Message key={`u${next}`} who="you" name="You">I wade in and raise the torch.</Message>,
      <Message key={`g${next}`} who="guide" name="The Guide" notes={["noticed: torch raised"]}><q>Careful, the floor drops past the arch.</q></Message>]);
    setChip(next < 2 ? { text: "1 update next turn", tone: "plain" } : { text: "moved on", tone: "good" });
  };
  return <Frame caption="A group chat with a story running" onReset={reset}>
    <div ref={chat} className="so-tour-chat" role="log" aria-label="Example chat" tabIndex={0}>
      <Message who="narrator" name="Narrator" notes={["reached: The Ruined Gate"]}>The gate groans open onto a flooded hall.</Message>
      {lines}
    </div>
    <Strip scene={turns >= 2 ? "The Flooded Hall · tense" : "The Ruined Gate · tension rising"} chip={chip} />
    <div className="so-tour-input"><span className="so-tour-box">I wade in and raise the torch.</span>
      <button type="button" className="menu_button fa-solid fa-paper-plane" aria-label="Send" onClick={send} /></div>
    <div className="so-tour-try"><span>Try:</span>
      <button type="button" className="menu_button" onClick={() => { setTurns(0); setLines((current) => current.slice(0, -1)); setChip({ text: "stepped back", tone: "warn" }); }}>
        Swipe the reply</button>
      <button type="button" className="menu_button" onClick={() => setLines((current) => [...current,
        <Message key={`o${current.length}`} who="you" name="You" notes={["out of character: not read"]}>((back in two minutes))</Message>])}>Send ((brb))</button>
    </div>
  </Frame>;
};

const StoryMock = () => {
  const [tab, setTab] = useState<"overview" | "memory">("overview");
  const [pinned, setPinned] = useState(false);
  return <Frame caption="This story › Play" onReset={() => { setTab("overview"); setPinned(false); }}>
    <div className="so-tour-tabs" role="tablist" aria-label="Story page">
      <button type="button" role="tab" aria-selected={tab === "overview"} onClick={() => setTab("overview")}>Overview</button>
      <button type="button" role="tab" aria-selected={tab === "memory"} onClick={() => setTab("memory")}>What the story remembers</button>
    </div>
    {tab === "overview" ? <div className="so-tour-pane" role="tabpanel" aria-label="Overview">
      <section><h4>Where you are</h4><p>The Flooded Hall. The guide is uneasy.</p><p className="so-tour-hint">The scene is tense. What happens next is yours to decide.</p></section>
      <section><h4>What changed</h4><p>Because you raised the torch, the guide trusts you a little more.</p></section>
      <section><h4>Open threads</h4><p>Who sealed the gate from inside?</p></section>
    </div> : <div className="so-tour-pane" role="tabpanel" aria-label="What the story remembers">
      <div className="so-tour-row"><span>The guide fears deep water.</span><Chip tone="good">pinned</Chip></div>
      <div className="so-tour-row"><span>You promised to bring the guide back out.</span><Chip tone="warn">promise</Chip></div>
      <div className="so-tour-row"><span>The gate opens only from inside.</span>{pinned ? <Chip tone="good">pinned</Chip>
        : <button type="button" className="menu_button" onClick={() => setPinned(true)}>Pin</button>}</div>
    </div>}
  </Frame>;
};

const PeopleMock = () => <Frame caption="Journal · People and Places">
  <div className="so-tour-pane">
    <section><h4>Here now</h4><div className="so-tour-row"><span><Avatar who="guide" /> The Guide</span><span className="so-tour-hint">trusts you · Ruin Keepers: wary</span></div>
      <p className="so-tour-hint">Someone you have not met is not listed at all.</p></section>
    <section><h4>The Guide</h4><div className="so-tour-row"><span>Promised you: a way past the arch.</span><Chip>open</Chip></div>
      <div className="so-tour-row"><span>Learned: once kept the gate.</span><Chip tone="warn">revealed</Chip></div></section>
    <section><h4>Places</h4><div className="so-tour-row"><span>The Ruined Gate</span><span className="so-tour-hint">Back here: the water has risen since you left.</span></div></section>
  </div>
</Frame>;

const StuckMock = () => {
  const [ideas, setIdeas] = useState<string[] | null>(null);
  const [typed, setTyped] = useState("");
  return <Frame caption="What could I do?" onReset={() => { setIdeas(null); setTyped(""); }}>
    <div className="so-tour-pane">
      <div className="so-tour-row"><span>What could I do?</span>
        <button type="button" className="menu_button fa-solid fa-lightbulb" aria-label="What could I do?"
          onClick={() => setIdeas(["Ask the guide about the arch", "Search the flooded hall", "Listen at the gate", "Go back outside"])} /></div>
      {ideas ? <div className="so-tour-ideas">{ideas.map((idea) => <button key={idea} type="button" className="menu_button" onClick={() => setTyped(idea)}>{idea}</button>)}
        <p className="so-tour-hint">Built only from what you have already seen.</p></div> : <p className="so-tour-hint">Press the lightbulb.</p>}
    </div>
    <div className="so-tour-input"><span className="so-tour-box" data-filled={Boolean(typed)}>{typed || "Type a message…"}</span></div>
  </Frame>;
};

const FlagMock = () => {
  const [flagged, setFlagged] = useState(false);
  return <Frame caption="Flag this moment" onReset={() => setFlagged(false)}>
    <div className="so-tour-chat" role="log" aria-label="Example chat" tabIndex={0}><Message who="guide" name="The Guide">You already know the gate's old name, don't you?</Message></div>
    <div className="so-tour-input"><span className="so-tour-box">/story flag the guide knew something I never said</span>
      <button type="button" className="menu_button fa-solid fa-paper-plane" aria-label="Send" onClick={() => setFlagged(true)} /></div>
    {flagged && <div className="so-tour-toast" role="status">Flagged this moment. Nothing in the story changed.</div>}
  </Frame>;
};

const ChoiceSheet = ({ caption, title, text, choices }: { caption: string; title: string; text: string; choices: Array<[string, string]> }) => {
  const [result, setResult] = useState<string | null>(null);
  return <Frame caption={caption} onReset={() => setResult(null)}>
    <div className="so-tour-pane so-tour-sheet"><strong>{title}</strong><p className="so-tour-hint">{text}</p>
      <div className="so-tour-actions">{choices.map(([label, outcome], index) => (
        <button key={label} type="button" className={`menu_button${index === 0 ? " so-tour-primary" : ""}`} onClick={() => setResult(outcome)}>{label}</button>
      ))}</div>
      {result && <p role="status">{result}</p>}</div>
  </Frame>;
};

const RestartMock = () => <ChoiceSheet caption="This story › Play" title="Restart this story?" text="Messages stay. Progress and what the story remembers start again."
  choices={[["Restart story", "Story restarted. Messages stay; progress and memory start again."], ["Keep playing", "Nothing changed."]]} />;

const LibraryMock = () => <ChoiceSheet caption="A newer copy is in the library" title="A newer version of this story is in your library"
  text="This chat keeps its own copy. A small change applies in place; this one changes a scene you have passed."
  choices={[["Keep playing", "Applied to this chat: values the new version no longer has were removed, and your progress stays."],
    ["Restart story", "Story restarted. Messages stay; progress and memory start again."], ["Cancel", "Nothing changed."]]} />;

const AuthorViewMock = () => {
  const [stage, setStage] = useState<"off" | "confirm" | "on">("off");
  return <Frame caption="This story › Author" onReset={() => setStage("off")}>
    <div className="so-tour-pane">
      {stage === "off" && <><p>This area can reveal private character knowledge, lore and future routes.</p>
        <button type="button" className="menu_button so-tour-primary" onClick={() => setStage("confirm")}>Show author view</button></>}
      {stage === "confirm" && <div className="so-tour-sheet"><strong>Show author view?</strong>
        <p className="so-tour-hint">It shows gates, upcoming turning points and what characters are hiding. This chat only.</p>
        <div className="so-tour-actions"><button type="button" className="menu_button so-tour-primary" onClick={() => setStage("on")}>Show author view</button>
          <button type="button" className="menu_button" onClick={() => setStage("off")}>Keep playing</button></div></div>}
      {stage === "on" && <><div className="so-tour-tabs" aria-label="Author tabs"><span>Overview</span><span>Blackboard</span><span>Memory</span><span>Scheduler</span><span>Payload</span></div>
        <div className="so-tour-row"><span>trust_guide</span><code>2 → 3</code></div>
        <div className="so-tour-row"><span>torch_raised</span><code>true</code></div>
        <p className="so-tour-hint">“I raise the torch” quoted as evidence, applied at the end of the reply.</p></>}
    </div>
  </Frame>;
};

const NODES = [
  { id: "gate", label: "The Ruined Gate", x: 20, y: 40, gate: null },
  { id: "hall", label: "Flooded Hall", x: 200, y: 40, gate: "torch_raised == true" },
  { id: "bell", label: "The Bell Room", x: 380, y: 10, gate: "trust_guide >= 3" },
  { id: "well", label: "The Old Well", x: 380, y: 90, gate: "took_left_passage == true" },
] as const;

const GraphMock = () => {
  const [active, setActive] = useState<string>("hall");
  const node = NODES.find((entry) => entry.id === active) ?? NODES[1];
  return <Frame caption="Studio › Flow" onReset={() => setActive("hall")}>
    <div className="so-tour-pane">
      <svg className="so-tour-graph" viewBox="0 0 500 140" role="group" aria-label="Story graph">
        <path className="so-tour-edge" d="M120 58 L198 58" /><path className="so-tour-edge" d="M300 52 C340 40 350 30 378 28" /><path className="so-tour-edge" d="M300 64 C340 80 350 100 378 108" />
        {NODES.map((entry) => <g key={entry.id} className={`so-tour-node${entry.id === active ? " so-tour-node-active" : ""}`} role="button" tabIndex={0}
          aria-label={entry.label} aria-pressed={entry.id === active}
          onClick={() => setActive(entry.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActive(entry.id); } }}>
          <rect x={entry.x} y={entry.y} rx="8" width="100" height="36" /><text x={entry.x + 50} y={entry.y + 22} textAnchor="middle">{entry.label}</text>
        </g>)}
      </svg>
      <div className="so-tour-card" role="status"><strong>{node.label}</strong>
        <span>{node.gate ? <>Opens when <code>{node.gate}</code>. The chat must show it, or it never opens.</> : "The start beat."}</span></div>
    </div>
  </Frame>;
};

const WizardMock = () => {
  const [edit, setEdit] = useState<string | null>(null);
  const [card, setCard] = useState<string | null>(null);
  return <Frame caption="Studio › Wizard" onReset={() => { setEdit(null); setCard(null); }}>
    <div className="so-tour-pane">
      <p className="so-tour-hint">Premise → Turning points → <strong>Characters</strong> → Setup</p>
      <div className="so-tour-card"><strong>Edit: add the guide to the cast</strong><span>role: knows the way in · aliases: guide</span>
        {edit ? <Chip tone={edit === "applied" ? "good" : "plain"}>{edit === "applied" ? "applied to draft" : "rejected"}</Chip> : <div className="so-tour-actions">
          <button type="button" className="menu_button so-tour-primary" onClick={() => setEdit("applied")}>Accept</button>
          <button type="button" className="menu_button" onClick={() => setEdit("rejected")}>Reject</button></div>}</div>
      <div className="so-tour-card"><strong>Create card: The Guide</strong><span>Waits for you. Checked: 1 note (no trait shown in action). One revision allowed.</span>
        {card ? <Chip tone="good">{card}</Chip> : <div className="so-tour-actions">
          <button type="button" className="menu_button so-tour-primary" onClick={() => setCard("created · read back: stored")}>Create</button></div>}</div>
    </div>
  </Frame>;
};

const ValidateMock = () => <Frame caption="Studio › Validation">
  <div className="so-tour-pane">
    <div className="so-tour-diag"><span className="so-tour-sev so-tour-sev-error">error</span>
      <span><strong>hall → bell</strong>: the gate reads <code>trust</code>, which no quality declares. Did you mean <code>trust_guide</code>?</span></div>
    <div className="so-tour-diag"><span className="so-tour-sev so-tour-sev-warn">warning</span><span><strong>codex: the bell room</strong>: the text names someone the player has not met.</span></div>
    <div className="so-tour-diag"><span className="so-tour-sev so-tour-sev-info">info</span>
      <span><strong>the old well</strong>: no player-facing name; the story page will say "a new scene".</span></div>
    <p className="so-tour-hint">Every finding says what goes wrong in play.</p>
  </div>
</Frame>;

const LoreMock = () => {
  const [result, setResult] = useState<string | null>(null);
  return <Frame caption="This story › Review" onReset={() => setResult(null)}>
    <div className="so-tour-pane">
      <div className="so-tour-card"><strong>Proposed: update “The Ruined Gate”</strong><span>Add: “The water has risen to the second step.” · Book: Ruins lore</span>
        {result ? <p role="status">{result}</p> : <div className="so-tour-actions">
          <button type="button" className="menu_button so-tour-primary" onClick={() => setResult("Accepted. It applies at the end of the next reply; a rollback reverts it.")}>Accept</button>
          <button type="button" className="menu_button" onClick={() => setResult("Rejected. Nothing written.")}>Reject</button></div>}</div>
      <div className="so-tour-card"><strong>Protected</strong><code>{"{{// so:protect}} … {{// so:end}}"}</code><span>A curator can never write inside this span.</span></div>
    </div>
  </Frame>;
};

const LAYER: Array<[string, string]> = [
  ["People and Places", "pages that open as the story shows them, with return visits"], ["Relationship labels", "public and secret, shown once both sides are known"],
  ["Factions", "standing in words, moved only by what the player did"], ["Quests and checks", "seeded dice; a check can wait for the attempt"],
  ["Story time", "parts of the day that never go back"], ["Promises", "the player's exact words"], ["Rumors", "news that travels as hearsay"],
  ["Scene card", "who is here, for characters the player knows"], ["New Game+", "a sequel carries what the player visibly achieved"],
];

const LayerMock = () => <Frame caption="Studio › Story features">
  <ul className="so-tour-pane so-tour-list">{LAYER.map(([name, line]) => <li key={name} className="so-tour-row">
    <span><strong>{name}</strong> <span className="so-tour-hint">· {line}</span></span><Chip tone="good">on</Chip></li>)}</ul>
</Frame>;

const PreviewMock = () => <Frame caption="This story › Author › Payload">
  <div className="so-tour-pane"><pre className="so-tour-prompt">{"[Character card: The Guide]\n[Lore: The Ruined Gate]\n"}<mark>{"[story scene] The Flooded Hall. The guide is uneasy.\n"}</mark>
    <mark>{"[private: The Guide] You promised the player a way past the arch.\n"}</mark>
      {"… chat history …\n"}<mark>{"[story guidance] Let the player choose the passage.\n"}</mark>{"Player: I wade in and raise the torch."}</pre>
    <p className="so-tour-hint">Highlighted lines are what the story adds, in SillyTavern's own order.</p></div>
</Frame>;

export const SettingMock = ({ setting }: { setting: TourSettingMock }) => {
  const id = useId();
  const [changed, setChanged] = useState(false);
  const [value, setValue] = useState(setting.options?.[0] ?? "");
  const [key, setKey] = useState("");
  const chip = changed ? setting.after : setting.before;
  const story = ["Play", "Features", "Review", "Author"].includes(setting.page);
  const pages = setting.page === "Studio" ? ["Story setup", "Flow", "Story features", "Validation"]
    : story ? ["Play", "Features", "Review", "Author"] : ["Library", "Defaults", "Connections", "Interface", "Help"];
  const current = setting.page === "Studio" ? "Story features" : setting.page;
  return <Frame caption={`${setting.page === "Studio" ? "Studio" : story ? "This story" : "Orchestrator"} › ${setting.page} › ${setting.label}`}
    onReset={() => { setChanged(false); setValue(setting.options?.[0] ?? ""); setKey(""); }}>
    <div className="so-tour-mini" data-context={story ? "story" : "orchestrator"}>
      <nav className="so-tour-mini-nav" aria-label="Example pages">{pages.map((page) => <span key={page} aria-current={page === current ? "page" : undefined}>{page}</span>)}</nav>
      <div className="so-tour-pane">
        {setting.kind === "select" && <label className="so-tour-row" htmlFor={`${id}-select`}><span>{setting.label}</span>
          <select id={`${id}-select`} value={value} onChange={(event) => { setValue(event.target.value); setChanged(event.target.value !== setting.options?.[0]); }}>
            {setting.options?.map((option) => <option key={option}>{option}</option>)}</select></label>}
        {setting.kind === "toggle" && <label className="so-tour-row" htmlFor={`${id}-toggle`}><span>{setting.label}</span>
          <input id={`${id}-toggle`} type="checkbox" checked={changed !== (setting.before.tone === "good")} onChange={() => setChanged(!changed)} /></label>}
        {setting.kind === "key" && <div className="so-tour-row"><label htmlFor={`${id}-key`}>{setting.label}</label>
          <span className="so-tour-actions"><input id={`${id}-key`} type="password" autoComplete="off" value={key} placeholder="Example only" onChange={(event) => setKey(event.target.value)} />
            <button type="button" className="menu_button" disabled={!key.trim()} onClick={() => { setKey(""); setChanged(true); }}>Save key</button></span></div>}
        {setting.kind === "button" && <div className="so-tour-row"><span>{setting.label}</span>
          <button type="button" className="menu_button so-tour-primary" onClick={() => setChanged(true)}>Check</button></div>}
      </div>
    </div>
    <Strip scene={setting.label} chip={chip} />
  </Frame>;
};

export const PoliciesMock = ({ features }: { features: readonly StoryFeatureId[] }) => {
  const [off, setOff] = useState<readonly StoryFeatureId[]>([]);
  return <Frame caption="Orchestrator › Defaults" onReset={() => setOff([])}>
    <div className="so-tour-pane so-tour-policy-grid">{features.map((id) => {
      const on = !off.includes(id);
      return <label key={id} className="so-tour-card" htmlFor={`so-tour-mock-${id}`}><strong>{FEATURE_CONTROLS[id].name}</strong>
        <span>{FEATURE_CONTROLS[id].description}</span>
        <span className="so-tour-actions"><input id={`so-tour-mock-${id}`} type="checkbox" checked={on} onChange={() => setOff(on ? [...off, id] : off.filter((entry) => entry !== id))} />
          <Chip tone={on ? "good" : "plain"}>{on ? id === "sprites" ? "Automatic" : "Enabled" : "Off on this install"}</Chip></span></label>;
    })}</div>
  </Frame>;
};

const SIMPLE: Partial<Record<TourMockId, () => ReactElement>> = {
  settings: SettingsMock, start: StartMock, brief: BriefMock, turn: TurnMock, story: StoryMock, people: PeopleMock, stuck: StuckMock, flag: FlagMock,
  restart: RestartMock, authorview: AuthorViewMock, graph: GraphMock, wizard: WizardMock, validate: ValidateMock, lore: LoreMock, layer: LayerMock,
  preview: PreviewMock, library: LibraryMock,
};

export const TOUR_MOCK_IDS = Object.keys(SIMPLE) as TourMockId[];

export const TourMock = ({ mock, setting, features }: { mock: TourMockId; setting?: TourSettingMock; features?: readonly StoryFeatureId[] }) => {
  if (mock === "setting" && setting) return <SettingMock setting={setting} />;
  if (mock === "policies" && features) return <PoliciesMock features={features} />;
  const Mock = SIMPLE[mock];
  return Mock ? <Mock /> : null;
};
