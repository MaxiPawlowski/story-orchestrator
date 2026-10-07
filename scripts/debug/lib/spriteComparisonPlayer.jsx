import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatedFace } from '../../../src/sprites/AnimatedFace';
import { StreamActivity } from '../../../src/sprites/animation';

const pack = JSON.parse(document.getElementById('pack-data').textContent);
const store = `sprite-ratings:${pack.id}`;
const modes = ['off', 'simple', 'smooth'];
const lines = {
  neutral: 'The road is clear. We can leave when you are ready.',
  happy: 'That worked! I knew we could find a way through together.',
  angry: 'They broke their word. I will hear their explanation first.',
  worried: 'Something is wrong here. Let us check before we go any farther.',
};

const labels = ['Regular', 'Two-frame', 'Three-frame'];
const ids = ['regular', 'simple', 'smooth'];

function Actor({ sample, variant, activity, zoom, paused }) {
  const source = variant === 2 && sample.previous ? sample.previous : sample;
  const frames = React.useMemo(() => variant === 0 ? {} : { blink: source.blink, talk: source.talk, talk2: source.talk2 }, [source, variant]);
  return <div className="portrait"><div className="zoom" style={{ transform: `scale(${zoom})` }}><img src={source.base} alt={`Belle, ${sample.label}`} />
    <AnimatedFace frames={frames} activity={activity} name="Belle" seed="belle-comparison"
      blink={variant !== 0} mouth={modes[variant]} paused={paused} /></div></div>;
}

function App() {
  const [at, setAt] = useState(0);
  const [votes, setVotes] = useState(() => {
    try { return JSON.parse(localStorage.getItem(store)) ?? pack.votes; } catch { return pack.votes; }
  });
  const [activity] = useState(() => new StreamActivity());
  const [text, setText] = useState('');
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [loop, setLoop] = useState(true);
  const [replay, setReplay] = useState(0);
  const [zoom, setZoom] = useState(2.5);
  const sample = pack.samples[at], vote = votes.find((vote) => vote.label === sample.label);
  useEffect(() => { try { localStorage.setItem(store, JSON.stringify(votes)); } catch {} }, [votes]);
  useEffect(() => {
    if (paused) { activity.stop(); setPlaying(false); return; }
    let index = 0, timer;
    setText(''); setPlaying(true);
    const words = lines[sample.label].split(' ');
    const advance = () => {
      if (index < words.length) {
        activity.pulse('Belle'); setPlaying(true); setText(words.slice(0, ++index).join(' '));
        timer = setTimeout(advance, 240);
      } else {
        activity.stop(); setPlaying(false);
        if (loop) timer = setTimeout(() => { index = 0; setText(''); advance(); }, 1200);
      }
    };
    timer = setTimeout(advance, 500);
    return () => { clearInterval(timer); activity.stop(); };
  }, [at, replay, activity, paused, loop]);
  const edit = (patch) => setVotes((rows) => rows.map((row) => row.label === sample.label ? { ...row, ...patch } : row));
  const select = (field, label, choices, mode = null) => <label>{label}<select aria-label={label} value={(mode ? vote.modes[mode][field] : vote[field]) === null ? '' : String(mode ? vote.modes[mode][field] : vote[field])}
    onChange={(event) => {
      const value = field === 'preferred' ? event.target.value || null : event.target.value === '' ? null : event.target.value === 'true';
      edit(mode ? { modes: { ...vote.modes, [mode]: { ...vote.modes[mode], [field]: value } } } : { [field]: value });
    }}>
    <option value="">Choose…</option>{choices.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>;
  const exported = () => {
    const blob = new Blob([JSON.stringify({ kind: 'labeled-sprite-review', pack: pack.id, rater: 'user', votes }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'belle-sprite-ratings.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const booleans = [['false', 'No'], ['true', 'Yes']];
  return <main><h1>Belle sprite comparison</h1>
    <p>All three options use the same artwork and speech timing. Regular keeps its original mouth;
      the other two add blink and talking frames.</p>
    {sample.previous && <p>Repaired two-frame candidate: {pack.resolution} pixels, {pack.steps} steps.
      Three-frame is the earlier reference, kept for comparison.</p>}
    <div className="controls"><label>Expression<select aria-label="Expression" value={at} onChange={(event) => setAt(Number(event.target.value))}>
      {pack.samples.map((sample, index) => <option key={sample.label} value={index}>{sample.label}</option>)}</select></label>
    <label>Framing<select aria-label="Framing" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>
      <option value={1}>Full figure</option><option value={1.6}>Thigh</option><option value={2.5}>Close — inspect the face</option></select></label></div>
    <div className="panels">{labels.map((label, variant) => <section key={`${sample.label}:${variant}`}><h2>{label}</h2>
      <p>{variant === 0 ? 'Original expression; no mouth animation' : variant === 1 ? 'Original ↔ open mouth' : sample.previous ? 'Previous three-frame reference (unchanged)' : 'Original → half-open → open mouth'}</p>
      <Actor sample={sample} variant={variant} activity={activity} zoom={zoom} paused={paused} /></section>)}</div>
    <p className="speech" aria-live="off">{text || 'Preparing playback…'}</p>
    <button onClick={() => { setPaused(false); setReplay((value) => value + 1); }}>Replay all three</button>
    <button onClick={() => setPaused((value) => !value)}>{paused ? 'Play' : 'Pause'}</button>
    <label className="loop"><input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} />Loop playback</label>
    <p role="status">{paused ? 'Paused' : playing ? 'Speaking' : loop ? 'Brief pause; playback will repeat' : 'Playback finished'}</p>
    <div className="ratings">
      {select('preferred', 'Which option do you prefer?', [...ids.map((id, index) => [id, labels[index]]), ['tie', 'No preference']])}
      {ids.map((id, index) => <fieldset key={id}><legend>{labels[index]}</legend>
        {select('seam', 'Visible seam, flicker or facial pop?', booleans, id)}
        {select('expression', 'Preserves the expression?', [['true', 'Yes'], ['false', 'No']], id)}</fieldset>)}
      <label>Notes<textarea value={vote.note} onChange={(event) => edit({ note: event.target.value })} /></label>
    </div><nav><button disabled={at === 0} onClick={() => setAt(at - 1)}>Previous</button>
      <button disabled={at === pack.samples.length - 1} onClick={() => setAt(at + 1)}>Next expression</button>
      <button onClick={exported}>Download ratings</button></nav>
    <p>Your selections are saved in this browser when local storage is available. Download the ratings file to hand them back.</p>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
