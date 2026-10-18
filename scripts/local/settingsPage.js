const $ = (id) => document.getElementById(id);
let state = null;
let edits = {};
let drawn = '';

const mib = (value) => (Number.isFinite(value) ? `${(value / 1024).toFixed(1)} GiB` : '–');
const title = (name) => name.charAt(0).toUpperCase() + name.slice(1);
const show = (text, kind = '') => { $('msg').textContent = text; $('msg').className = kind; };

async function api(path, body) {
    const options = body ? { method: 'POST', headers: { 'content-type': 'application/json', 'x-so-local-ui': '1' }, body: JSON.stringify(body) } : {};
    const response = await fetch(path, options);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
    return data;
}

function shown(knob, value) {
    if (knob.type === 'bool') return value ? 'on' : 'off';
    return String(value);
}

function renderModes() {
    const box = $('modes');
    box.replaceChildren();
    for (const mode of state.modes) {
        const button = document.createElement('button');
        button.className = `panel mode${state.configMode === mode.name ? ' on' : ''}`;
        button.disabled = Boolean(mode.error);
        const name = document.createElement('strong');
        name.textContent = title(mode.name);
        const note = document.createElement('small');
        note.textContent = mode.error ?? mode.note;
        button.append(name, note);
        button.addEventListener('click', () => change({ mode: mode.name }, `${title(mode.name)} selected.`));
        box.append(button);
    }
}

function control(knob, value) {
    let input;
    if (knob.type === 'bool' || knob.type === 'enum') {
        input = document.createElement('select');
        for (const option of knob.type === 'bool' ? [true, false] : knob.values) {
            const item = document.createElement('option');
            item.value = String(option);
            item.textContent = knob.type === 'bool' ? (option ? 'on' : 'off') : option;
            input.append(item);
        }
        input.value = String(value);
    } else {
        input = document.createElement('input');
        input.type = 'number';
        Object.assign(input, { min: knob.min, max: knob.max, step: knob.step, value });
    }
    input.setAttribute('aria-label', knob.label);
    input.addEventListener('change', () => {
        const raw = input.value;
        const next = knob.type === 'bool' ? raw === 'true' : knob.type === 'enum' ? raw : Number(raw);
        if (next === state.saved[knob.path]) delete edits[knob.path]; else edits[knob.path] = next;
        input.classList.toggle('changed', knob.path in edits);
        refreshButtons();
    });
    return input;
}

function renderKnobs() {
    const body = $('knobs');
    body.replaceChildren();
    const nextLoad = new Set(state.live.atNextTextLoad);
    for (const knob of state.knobs) {
        const row = document.createElement('tr');
        const left = document.createElement('td');
        left.className = 'k';
        const label = document.createElement('div');
        label.textContent = knob.label;
        const about = document.createElement('p');
        about.textContent = knob.about;
        left.append(label, about);
        if (knob.applies !== 'live') {
            const when = document.createElement('em');
            when.textContent = nextLoad.has(knob.path) ? 'Saved; waits for the next text load.' : knob.applies === 'text-load' ? 'Applies at the next text load.' : 'Images: now. Text layout: next text load.';
            left.append(when);
        }
        const right = document.createElement('td');
        const value = knob.path in edits ? edits[knob.path] : state.saved[knob.path];
        const input = control(knob, value);
        if (knob.path in edits) input.classList.add('changed');
        right.append(input);
        const range = document.createElement('span');
        range.className = 'range';
        range.textContent = knob.type === 'int' ? `${knob.min}–${knob.max}` : knob.type === 'enum' ? knob.values.join(' / ') : 'on / off';
        right.append(range);
        row.append(left, right);
        body.append(row);
    }
}

function refreshButtons() {
    const count = Object.keys(edits).length;
    $('save').disabled = count === 0;
    $('reset').disabled = count === 0;
}

function renderStatus() {
    $('gpu').textContent = mib(state.gpuFreeMiB);
    $('ram').textContent = mib(state.ramAvailableMiB);
    const pending = state.live.pending;
    $('mode').textContent = title(pending ? `${pending.mode} (waiting)` : state.live.mode);
    $('health').className = `dot ${pending ? 'pend' : 'up'}`;
    $('status').textContent = pending ? 'Saved; applies when the current text or image job finishes.' : `Controller ${state.phase ?? 'up'}. Saved mode: ${title(state.configMode)}.`;
}

async function load(keepEdits = true) {
    try {
        state = await api('/ui/api/state');
        if (!keepEdits) edits = {};
        renderStatus();
        const signature = JSON.stringify([state.saved, state.live.atNextTextLoad, state.configMode]);
        if (signature !== drawn || !keepEdits) { drawn = signature; renderModes(); renderKnobs(); }
        refreshButtons();
    } catch (error) {
        $('health').className = 'dot';
        $('status').textContent = `Controller not answering: ${error.message}`;
    }
}

async function change(body, done) {
    show('Saving…');
    try {
        const result = await api('/ui/api/change', body);
        const later = result.atNextTextLoad.length ? ` ${result.atNextTextLoad.join(', ')} at the next text load.` : '';
        show(`${done} ${result.applied === 'now' ? 'Applied.' : 'Applies after the current job.'}${later}`, 'ok');
        await load(false);
    } catch (error) { show(error.message, 'err'); }
}

$('save').addEventListener('click', () => change({ values: edits }, 'Saved.'));
$('reset').addEventListener('click', () => { edits = {}; renderKnobs(); refreshButtons(); show(''); });
void load(false);
setInterval(() => { void load(true); }, 3000);
