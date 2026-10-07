import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatedFace } from '../../../src/sprites/AnimatedFace';
import { StreamActivity } from '../../../src/sprites/animation';

const bundle = JSON.parse(document.getElementById('pack-data').textContent);
const pack = bundle.samples;
const storage = `saga-sprite-review:${bundle.id}`;
function App() {
  const [at, setAt] = useState(0), [paused, setPaused] = useState(false), [zoom, setZoom] = useState(2.5);
  const [activity] = useState(() => new StreamActivity());
  const [votes, setVotes] = useState(() => { try { return JSON.parse(localStorage.getItem(storage)) ?? {}; } catch { return {}; } });
  const sample = pack[at];
  useEffect(() => { try { localStorage.setItem(storage, JSON.stringify(votes)); } catch {} }, [votes]);
  useEffect(() => {
    if (paused) { activity.stop(); return; }
    let ticks = 0;
    const timer = setInterval(() => { if (ticks++ % 24 < 18) activity.pulse(sample.name); else activity.stop(); }, 240);
    return () => { clearInterval(timer); activity.stop(); };
  }, [at, paused, activity]);
  return <main><h1>The Saga — protagonistas</h1><p>Normal y talking usan la misma imagen de reposo. Belle neutral usa el candidato 3 elegido.</p>
    <label>Personaje<select aria-label="Personaje" value={sample.name} onChange={(event) => setAt(pack.findIndex((row) => row.name === event.target.value))}>
      {[...new Set(pack.map((row) => row.name))].map((name) => <option key={name}>{name}</option>)}</select></label>
    <label>Expresión<select aria-label="Expresión" value={at} onChange={(event) => setAt(Number(event.target.value))}>
      {pack.map((row, index) => row.name === sample.name && <option value={index} key={row.id}>{row.label}</option>)}</select></label>
    <label>Encuadre<select aria-label="Encuadre" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}>
      <option value={1}>Cuerpo completo</option><option value={2.5}>Cara</option></select></label>
    <div className="panels">{[false, true].map((animated) => <section key={`${sample.id}/${animated}`}><h2>{animated ? 'Talking — dos fotogramas' : 'Normal'}</h2>
      <div className="portrait"><div className="zoom" style={{ transform: `scale(${zoom})` }}><img src={sample.base} alt={`${sample.name} ${sample.label}`} />
        {animated && <AnimatedFace frames={{ blink: sample.blink, talk: sample.talk }} activity={activity} name={sample.name}
          seed={sample.id} blink mouth="simple" paused={paused} />}</div></div></section>)}</div>
    <button onClick={() => setPaused((value) => !value)}>{paused ? 'Reproducir' : 'Pausar'}</button>
    <label>¿Conserva la expresión y no tiene saltos/boca doble?<select value={votes[sample.id] ?? ''} onChange={(event) => setVotes({ ...votes, [sample.id]: event.target.value })}>
      <option value="">Sin revisar</option><option value="approved">Sí</option><option value="repair">Necesita corrección</option></select></label>
    <button onClick={() => { const url = URL.createObjectURL(new Blob([JSON.stringify({ pack: bundle.id, presentation: 'labeled-normal-talking', votes }, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'saga-sprite-review.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>Descargar revisión</button>
    <p>La revisión se guarda en este navegador. Descargala para compartirla.</p>
  </main>;
}
createRoot(document.getElementById('root')).render(<App />);
