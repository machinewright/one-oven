// UI for the dinner planner. State is a "menu" (see src/example.js); the planner runs in worker.js.
import { EXAMPLE, toProblem } from './src/example.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (x) => JSON.parse(JSON.stringify(x));
const STORE = 'oven-plan-menu-v1';

// ---------------------------------------------------------------------------------------------------------------
// State

function fromHash() {
  const m = location.hash.match(/^#m=([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  try {
    const b = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decodeURIComponent(escape(b)));
  } catch { return null; }
}
function toHash(menu) {
  const b = btoa(unescape(encodeURIComponent(JSON.stringify(strip(menu)))));
  return '#m=' + b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function strip(menu) { const m = clone(menu); delete m.source; return m; }
function valid(m) { return m && Array.isArray(m.dishes) && typeof m.serve === 'string' && Array.isArray(m.ovens); }

let menu = (() => {
  const h = fromHash(); if (valid(h)) return h;
  try { const s = JSON.parse(localStorage.getItem(STORE)); if (valid(s)) return s; } catch { /* ignore */ }
  return clone(EXAMPLE);
})();
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(menu)); } catch { /* private mode */ } };

// ---------------------------------------------------------------------------------------------------------------
// Units and clock

const F = () => menu.unit === 'F';
const showT = (c) => (F() ? `${Math.round((c * 9 / 5 + 32) / 5) * 5}°F` : `${Math.round(c)}°C`);
const toInputT = (c) => (F() ? Math.round((c * 9 / 5 + 32) / 5) * 5 : Math.round(c));
const fromInputT = (v) => (F() ? (v - 32) * 5 / 9 : v);
const toMin = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
let lastP = null;
function clock(slot) {
  const m = ((toMin(menu.serve) + (slot - lastP.S) * 5) % 1440 + 1440) % 1440;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}
const dur = (min) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ' ' + (min % 60) + ' min' : ''}` : `${min} min`);

// ---------------------------------------------------------------------------------------------------------------
// Settings

function renderSettings() {
  $('#serve').value = menu.serve;
  $('#from').value = menu.from;
  $('#unit').value = menu.unit;
  $('#shelves').value = menu.ovens[0].shelves;
  $('#second').checked = menu.ovens.length > 1;
  $('#shelves2wrap').hidden = menu.ovens.length < 2;
  if (menu.ovens[1]) $('#shelves2').value = menu.ovens[1].shelves;
  $('#rings').value = menu.rings;
  $('#cooks').value = menu.cooks;
}
function bindSettings() {
  const on = (id, f) => $(id).addEventListener('change', () => { f($(id)); changed(); });
  on('#serve', (e) => { if (e.value) menu.serve = e.value; });
  on('#from', (e) => { if (e.value) menu.from = e.value; });
  on('#unit', (e) => { menu.unit = e.value; renderDishes(); });
  on('#shelves', (e) => { menu.ovens[0].shelves = clampInt(e.value, 1, 6, 3); });
  on('#second', (e) => {
    if (e.checked && menu.ovens.length < 2) menu.ovens.push({ name: 'Second oven', shelves: 1 });
    if (!e.checked) menu.ovens = menu.ovens.slice(0, 1);
    menu.ovens[0].name = menu.ovens.length > 1 ? 'Main oven' : 'Oven';
    renderSettings();
  });
  on('#shelves2', (e) => { if (menu.ovens[1]) menu.ovens[1].shelves = clampInt(e.value, 1, 6, 1); });
  on('#rings', (e) => { menu.rings = clampInt(e.value, 0, 8, 4); });
  on('#cooks', (e) => { menu.cooks = clampInt(e.value, 1, 6, 1); });
}
function clampInt(v, lo, hi, def) { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; }

// ---------------------------------------------------------------------------------------------------------------
// Dish editor

const KINDS = [
  ['oven', 'In the oven'], ['hob', 'On the hob'], ['prep', 'Hands-on (prep, carving)'],
  ['rest', 'Resting'], ['other', 'Waiting (nothing needed)'],
];
const HOLDS = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120];
const WAITS = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120];
const LATER = [0, 15, 30, 45, 60, 90, 120];
const opts = (vals, cur, fmt) => vals.map((v) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(fmt(v))}</option>`).join('');
const withCur = (vals, cur) => (vals.includes(cur) ? vals : [...vals, cur].sort((a, b) => a - b));

function stepHTML(s, k, last) {
  const kind = s.kind ?? 'other';
  const id = (x) => `${x}-${Math.random().toString(36).slice(2, 8)}`;
  const tId = id('t'), mId = id('m'), xId = id('x');
  return `<li class="step" data-k="${k}">
    <div class="srow">
      <select class="f-kind" aria-label="Where">${KINDS.map(([v, l]) => `<option value="${v}"${v === kind ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <span class="fld"><input id="${mId}" class="f-min" type="number" min="5" max="900" step="5" inputmode="numeric" value="${s.min}"><label for="${mId}">min</label></span>
      <span class="fld"><label for="${xId}">up to</label><input id="${xId}" class="f-max" type="number" min="5" max="900" step="5" inputmode="numeric" value="${s.max ?? ''}" placeholder="–" title="If this step can take longer (a turkey can rest 30 to 90 minutes), the longest it can take"></span>
      ${kind === 'oven' ? `<span class="fld"><label for="${tId}">at</label><input id="${tId}" class="f-temp" type="number" min="50" max="550" step="5" inputmode="numeric" value="${toInputT(Array.isArray(s.temp) ? s.temp[0] : s.temp ?? 180)}"><span class="unit">°${F() ? 'F' : 'C'}</span></span>
        <select class="f-shelves" aria-label="Shelves it takes">${[1, 2, 3].map((n) => `<option value="${n}"${(s.shelves ?? 1) === n ? ' selected' : ''}>${n} shelf${n > 1 ? 's' : ''}</option>`).join('').replace(/shelfs/g, 'shelves')}</select>` : ''}
      ${kind === 'hob' ? `<label class="chk"><input class="f-hands" type="checkbox"${s.hands ? ' checked' : ''}> needs you</label>` : ''}
      <button class="icon f-del" type="button" aria-label="Remove this step" title="Remove this step">×</button>
    </div>
    <div class="srow sub">
      <input class="f-label" type="text" maxlength="80" value="${esc(s.label ?? '')}" placeholder="note, e.g. foil off" aria-label="Note for this step">
      ${last ? '' : `<label class="fld">then it can wait <select class="f-wait">${opts(withCur(WAITS, s.wait ?? 0), s.wait ?? 0, (v) => (v ? `up to ${v} min` : 'no'))}</select></label>`}
    </div>
  </li>`;
}

const openDishes = new Set();
function summaryText(d) {
  const parts = d.steps.map((s) => {
    const m = s.max ? `${dur(s.min)}–${dur(s.max)}` : dur(s.min);
    if (s.kind === 'oven') return `oven ${showT(Array.isArray(s.temp) ? s.temp[0] : s.temp)} ${m}`;
    if (s.kind === 'hob') return `hob ${m}`;
    if (s.kind === 'prep') return `you ${m}`;
    if (s.kind === 'rest') return `rest ${m}`;
    return `wait ${m}`;
  });
  return parts.join(' → ') + (d.hold ? ` · can wait ${d.hold} min` : '') + (d.serveAt ? ` · served +${d.serveAt} min` : '') + (d.off ? ' · left out' : '');
}
function dishHTML(d, i) {
  const later = d.serveAt ?? 0;
  return `<details class="dish${d.off ? ' off' : ''}" data-i="${i}"${openDishes.has(i) ? ' open' : ''}>
    <summary><span class="dn">${esc(d.name)}</span> <span class="ds note">${esc(summaryText(d))}</span><span class="edit note" aria-hidden="true">edit</span></summary>
    <div class="dhead">
      <label class="fld grow">Name <input class="f-name" type="text" maxlength="60" value="${esc(d.name)}"></label>
      <button class="icon f-ddel" type="button" aria-label="Remove ${esc(d.name)}" title="Remove this dish">×</button>
    </div>
    <ol class="steps">${d.steps.map((s, k) => stepHTML(s, k, k === d.steps.length - 1)).join('')}</ol>
    <button class="link f-add" type="button">+ add a step</button>
    <div class="dopts">
      <label class="fld">Once done, it can wait <select class="f-hold">${opts(withCur(HOLDS, d.hold ?? 0), d.hold ?? 0, (v) => (v ? `up to ${v} min` : 'no, serve at once'))}</select></label>
      <label class="fld">Served <select class="f-later">${opts(withCur(LATER, later), later, (v) => (v ? `${v} min after the main course` : 'with the main course'))}</select></label>
      <label class="chk"><input class="f-exact" type="checkbox"${d.exact ? ' checked' : ''}> exact temperature (baking)</label>
      <label class="chk"><input class="f-off" type="checkbox"${d.off ? ' checked' : ''}> leave out</label>
    </div>
  </details>`;
}
function refreshSummary(dEl, d) {
  dEl.querySelector('summary .dn').textContent = d.name;
  dEl.querySelector('summary .ds').textContent = summaryText(d);
}

function renderDishes() {
  $('#dishes').innerHTML = menu.dishes.map(dishHTML).join('') || '<p class="note">No dishes yet.</p>';
  const src = menu.source;
  $('#source').innerHTML = src ? `This example is <a href="${esc(src.url)}">olive magazine's Christmas timeline</a> (5 kg turkey, lunch at 3pm), typed in step by step. Change anything; it replans as you type.` : '';
}

function bindDishes() {
  const root = $('#dishes');
  const where = (el) => {
    const dEl = el.closest('.dish'); if (!dEl || el.closest('summary')) return {};
    const d = menu.dishes[+dEl.dataset.i];
    const sEl = el.closest('.step');
    return { d, dEl, s: sEl ? d.steps[+sEl.dataset.k] : null, k: sEl ? +sEl.dataset.k : -1 };
  };
  const onField = (e) => {
    const el = e.target; const { d, s, dEl } = where(el); if (!d) return;
    const c = el.classList;
    let rerender = false;
    if (c.contains('f-name')) { d.name = el.value || 'Dish'; }
    else if (c.contains('f-hold')) d.hold = +el.value;
    else if (c.contains('f-later')) d.serveAt = +el.value;
    else if (c.contains('f-exact')) d.exact = el.checked;
    else if (c.contains('f-off')) { d.off = el.checked; dEl.classList.toggle('off', d.off); }
    else if (s) {
      if (c.contains('f-kind')) {
        s.kind = el.value;
        if (s.kind === 'oven' && s.temp == null) { s.temp = 180; s.shelves = 1; }
        if (s.kind === 'prep') s.hands = true; else if (s.kind !== 'hob') delete s.hands;
        rerender = true;
      } else if (c.contains('f-min')) { const v = Number(el.value); if (v > 0) s.min = Math.min(900, v); else return; }
      else if (c.contains('f-max')) { const v = Number(el.value); if (el.value === '' || !(v > 0)) delete s.max; else s.max = Math.min(900, v); }
      else if (c.contains('f-temp')) { const v = Number(el.value); if (v > 0) s.temp = fromInputT(v); else return; }
      else if (c.contains('f-shelves')) s.shelves = +el.value;
      else if (c.contains('f-hands')) s.hands = el.checked;
      else if (c.contains('f-label')) s.label = el.value;
      else if (c.contains('f-wait')) s.wait = +el.value;
      delete s.guess;
    } else return;
    if (rerender) renderDishes(); else refreshSummary(dEl, d);
    changed(e.type === 'input' ? 500 : 150);
  };
  root.addEventListener('input', (e) => { if (e.target.matches('input[type=text], input[type=number]')) onField(e); });
  root.addEventListener('change', (e) => { if (!e.target.matches('input[type=text]')) onField(e); });
  root.addEventListener('toggle', (e) => {
    const el = e.target; if (!el.matches('details.dish')) return;
    if (el.open) openDishes.add(+el.dataset.i); else openDishes.delete(+el.dataset.i);
  }, true);
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const { d, k } = where(b); if (!d) return;
    const i = menu.dishes.indexOf(d);
    if (b.classList.contains('f-ddel')) { menu.dishes.splice(i, 1); const o = [...openDishes].filter((x) => x !== i).map((x) => (x > i ? x - 1 : x)); openDishes.clear(); o.forEach((x) => openDishes.add(x)); }
    else if (b.classList.contains('f-del')) { d.steps.splice(k, 1); if (!d.steps.length) menu.dishes.splice(i, 1); }
    else if (b.classList.contains('f-add')) d.steps.push({ kind: 'oven', min: 30, temp: 180, shelves: 1 });
    else return;
    renderDishes(); changed(0);
    if (b.classList.contains('f-add')) $(`.dish[data-i="${i}"] .step:last-child .f-kind`)?.focus();
  });
  $('#adddish').addEventListener('click', () => {
    menu.dishes.push({ name: 'New dish', hold: 10, steps: [{ kind: 'oven', min: 30, temp: 180, shelves: 1 }] });
    openDishes.add(menu.dishes.length - 1);
    delete menu.source; renderDishes(); changed(0);
    const inp = $('#dishes .dish:last-child .f-name'); inp.focus(); inp.select();
  });
  $('#example').addEventListener('click', () => { menu = clone(EXAMPLE); openDishes.clear(); renderSettings(); renderDishes(); changed(0); });
  $('#empty').addEventListener('click', () => {
    if (!confirm('Remove every dish and start an empty menu?')) return;
    menu.dishes = []; openDishes.clear(); delete menu.source; renderDishes(); changed(0);
  });
  $('#share').addEventListener('click', async () => {
    const url = location.href.split('#')[0] + toHash(menu);
    history.replaceState(null, '', url);
    let ok = false; try { await navigator.clipboard.writeText(url); ok = true; } catch { /* no clipboard */ }
    $('#sharemsg').textContent = ok ? 'Link copied. It holds your whole menu.' : 'The address bar now holds your whole menu: bookmark or copy it.';
  });
  $('#print').addEventListener('click', () => window.print());
}

// ---------------------------------------------------------------------------------------------------------------
// Planning

const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
let jobId = 0, timer = 0;
function changed(delay = 150) {
  if (menu.source && JSON.stringify(strip(menu)) !== JSON.stringify(strip(EXAMPLE))) delete menu.source;
  save();
  clearTimeout(timer);
  timer = setTimeout(run, delay);
}
function run() {
  const id = ++jobId;
  $('#status').textContent = 'Planning…';
  worker.postMessage({ id, problem: toProblem(menu), timeMs: 1500 });
}
worker.onmessage = (e) => {
  if (e.data.id !== jobId) return;
  const r = e.data.result;
  $('#status').textContent = '';
  if (r.error) { $('#verdict').innerHTML = `<p class="bad">Something went wrong: ${esc(r.error)}</p>`; return; }
  render(r);
};

// ---------------------------------------------------------------------------------------------------------------
// Output

function ovenName(o) { return lastP.ovens.length > 1 ? (o === 0 ? 'the main oven' : 'the second oven') : 'the oven'; }

function compromises(r) {
  const out = [];
  r.dishes.forEach((d, i) => {
    const o = r.chosen[i], m = menu.dishes[d.index];
    if (o.dropped) { out.push(`<strong>${esc(d.name)}</strong>: no room. ${whyText(r.why && r.why[i])}Make it ahead and reheat it, cook it in another appliance, or change something on the menu.`); return; }
    if (o.h > d.hold) out.push(`<strong>${esc(d.name)}</strong>: has to be ready ${o.h * 5} min before it's served (you said it can wait ${d.hold ? `up to ${d.hold * 5} min` : 'no time at all'}). Keep it covered and warm.`);
    d.steps.forEach((s, k) => {
      if (s.kind !== 'oven') return;
      const st = o.steps[k];
      const temps = new Set();
      for (const run of r.sched[st.oven]) if (run.from < st.to && run.to > st.from) temps.add(run.temp);
      const off = [...temps].filter((t) => t < s.temp[0] - 1e-6 || t > s.temp[1] + 1e-6);
      if (off.length) {
        const recipe = s.temp[0] === s.temp[1] ? showT(s.temp[0]) : `${showT(s.temp[0])}–${showT(s.temp[1])}`;
        const what = d.steps.filter((x) => x.kind === 'oven').length > 1 ? ` (${s.label || `oven step ${k + 1}`})` : '';
        out.push(`<strong>${esc(d.name)}</strong>${esc(what)}: cooks at ${off.map(showT).join(' and ')} instead of ${recipe}. Most roasting copes with that; check on it${m && m.exact ? '' : ', or tick “exact temperature” if it can’t'}.`);
      }
    });
  });
  return out;
}

function whyText(w) {
  if (!w) return '';
  const at = w.t !== undefined ? clock(w.t) : '';
  const them = w.users && w.users.length ? w.users.map(esc).join(', ') : 'other dishes';
  if (w.kind === 'shelves') return `To be ready on time it needs space in ${ovenName(w.oven)} from ${at}, but it's full then (${them}). `;
  if (w.kind === 'temp') return `To be ready on time it needs ${ovenName(w.oven)} at ${showT(w.need)} from ${at} (counting the heating up), but ${them} need it at another temperature then. `;
  if (w.kind === 'hob') return `To be ready on time it needs a hob ring from ${at}, but they're all taken (${them}). `;
  if (w.kind === 'hands') return `To be ready on time it needs you from ${at}, but you're busy with ${them}. `;
  if (w.kind === 'start') return 'It takes longer than the time between “kitchen free from” and serving. ';
  return '';
}

function events(r) {
  const ev = [];
  const add = (t, order, text, cls = '') => ev.push({ t, order, text, cls });
  r.sched.forEach((runs, o) => runs.forEach((run, k) => {
    const prev = runs[k - 1], next = runs[k + 1];
    const verb = !prev || prev.to < run.from ? `Turn ${ovenName(o)} on to` : run.temp > prev.temp ? `Turn ${ovenName(o)} up to` : `Turn ${ovenName(o)} down to`;
    add(run.from, 1, `${verb} <strong>${showT(run.temp)}</strong>`, 'temp');
    if (!next || next.from > run.to) add(run.to, 0, `Turn ${ovenName(o)} off`, 'temp');
  }));
  r.dishes.forEach((d, i) => {
    const o = r.chosen[i]; if (o.dropped) return;
    const N = esc(d.name);
    d.steps.forEach((s, k) => {
      const st = o.steps[k], prevS = d.steps[k - 1], nextS = d.steps[k + 1];
      const L = s.label ? `: ${esc(s.label)}` : '';
      const len = (st.to - st.from) * 5;
      if (s.kind === 'oven') {
        const cont = prevS && prevS.kind === 'oven' && o.steps[k - 1].oven === st.oven && o.steps[k - 1].to === st.from;
        if (!cont) add(st.from, 2, `<strong>${N}</strong> into ${ovenName(st.oven)}${L}${s.shelves > 1 ? ` <span class="note">(${s.shelves} shelves)</span>` : ''} <span class="note">${dur(len)}</span>`);
        else if (s.label) add(st.from, 2, `<strong>${N}</strong>${L} <span class="note">${dur(len)} more</span>`);
        const contNext = nextS && nextS.kind === 'oven' && o.steps[k + 1].oven === st.oven && o.steps[k + 1].from === st.to;
        if (!contNext) add(st.to, 0, `<strong>${N}</strong> out of ${ovenName(st.oven)}`);
      } else if (s.kind === 'hob') {
        add(st.from, 2, `<strong>${N}</strong> on the hob${L} <span class="note">${dur(len)}${s.hands ? ', stay with it' : ''}</span>`);
      } else if (s.kind === 'prep') {
        add(st.from, 3, `<strong>${N}</strong>${L || ': prepare'} <span class="note">${dur(len)}, hands-on</span>`);
      } else if (s.kind === 'rest') {
        add(st.from, 3, `<strong>${N}</strong>${L || ': rest'} <span class="note">${dur(len)}</span>`);
      } else {
        add(st.from, 3, `<strong>${N}</strong>${L || ': wait'} <span class="note">${dur(len)}</span>`);
      }
    });
    if (o.d < d.serve) add(o.d, 4, `<strong>${N}</strong>: done, keep warm <span class="note">${(d.serve - o.d) * 5} min until it's served</span>`);
  });
  const serves = new Set(r.dishes.map((d) => d.serve));
  for (const t of serves) add(t, 5, t === lastP.S ? '<strong>Serve</strong>' : `<strong>Serve</strong> ${esc(r.dishes.filter((d, i) => d.serve === t && !r.chosen[i].dropped).map((d) => d.name).join(', '))}`, 'serve');
  ev.sort((a, b) => a.t - b.t || a.order - b.order);
  return ev;
}

function render(r) {
  lastP = r.P;
  if (!r.dishes.length) { $('#verdict').innerHTML = '<p>Add a dish to get a plan.</p>'; $('#chart').innerHTML = ''; $('#steplist').innerHTML = ''; return; }
  if (!r.chosen) { $('#verdict').innerHTML = '<p class="bad">No plan found. Check that the kitchen opens early enough for the longest dish.</p>'; $('#chart').innerHTML = ''; $('#steplist').innerHTML = ''; return; }
  const comp = compromises(r);
  const firstOn = Math.min(...r.sched.flat().map((x) => x.from), Infinity);
  const changes = r.sched.reduce((a, runs) => a + Math.max(0, runs.length - 1), 0);
  const allStart = Math.min(...r.chosen.flatMap((o) => o.steps.map((s) => s.from)), firstOn);
  const head = comp.length
    ? `<p class="verdict warn">It doesn't all fit as written. The plan below needs ${comp.length === 1 ? 'one compromise' : comp.length + ' compromises'}:</p><ul class="comp">${comp.map((c) => `<li>${c}</li>`).join('')}</ul>`
    : `<p class="verdict good">Everything fits, as written.</p>`;
  const facts = [`Start at <strong>${clock(allStart)}</strong>`];
  if (Number.isFinite(firstOn)) facts.push(`oven on at <strong>${clock(firstOn)}</strong>`, changes ? `${changes} temperature change${changes > 1 ? 's' : ''}` : 'one temperature all day');
  $('#verdict').innerHTML = head + `<p class="facts">${facts.join(' · ')}</p>` +
    (r.proven ? '' : '<p class="note">This is the best plan I found in 1.5 seconds; with this many dishes a slightly better one may exist.</p>');
  renderChart(r);
  const ev = events(r);
  let html = '', lastT = null;
  for (const e of ev) {
    if (e.t !== lastT) { if (lastT !== null) html += '</ul></li>'; html += `<li class="ev${e.cls === 'serve' ? ' serve' : ''}"><time>${clock(e.t)}</time><ul>`; lastT = e.t; }
    html += `<li class="${e.cls}"><label><input type="checkbox"> <span>${e.text}</span></label></li>`;
  }
  if (lastT !== null) html += '</ul></li>';
  $('#steplist').innerHTML = html;
}

const KIND_CLASS = { oven: 'k-oven', hob: 'k-hob', prep: 'k-prep', rest: 'k-rest', other: 'k-other' };
function renderChart(r) {
  const starts = [...r.sched.flat().map((x) => x.from), ...r.chosen.flatMap((o) => o.steps.map((s) => s.from))];
  const t0 = Math.floor(Math.min(...starts) / 6) * 6; // to the half hour before
  const t1 = Math.max(...r.dishes.map((d) => d.serve)) + 1;
  const span = t1 - t0;
  const x = (t) => `${((t - t0) / span) * 100}%`;
  const w = (a, b) => `${((b - a) / span) * 100}%`;
  let ticks = '';
  const serveMin = toMin(menu.serve);
  for (let t = t0; t <= t1; t++) {
    const m = ((serveMin + (t - lastP.S) * 5) % 1440 + 1440) % 1440;
    if (m % 30 === 0) ticks += `<span class="tick${m % 60 ? ' half' : ''}" style="left:${x(t)}">${m % 60 ? '' : `${Math.floor(m / 60)}:00`}</span>`;
  }
  let rows = '';
  r.sched.forEach((runs, o) => {
    rows += `<div class="crow temprow"><div class="cname">${lastP.ovens.length > 1 ? (o ? 'Second oven' : 'Main oven') : 'Oven'}</div><div class="ctrack">${runs.map((run) => `<span class="bar k-temp" style="left:${x(run.from)};width:${w(run.from, run.to)}" title="${showT(run.temp)} from ${clock(run.from)} to ${clock(run.to)}">${showT(run.temp)}</span>`).join('')}</div></div>`;
  });
  r.dishes.forEach((d, i) => {
    const o = r.chosen[i];
    let bars = '';
    if (!o.dropped) {
      o.steps.forEach((st, k) => {
        const s = d.steps[k];
        const tip = `${d.name}: ${KINDS.find((kk) => kk[0] === s.kind)[1].toLowerCase()}${s.label ? ' (' + s.label + ')' : ''}, ${clock(st.from)}–${clock(st.to)}`;
        bars += `<span class="bar ${KIND_CLASS[s.kind]}${s.hands ? ' hands' : ''}" style="left:${x(st.from)};width:${w(st.from, st.to)}" title="${esc(tip)}"></span>`;
      });
      if (o.d < d.serve) bars += `<span class="bar k-hold" style="left:${x(o.d)};width:${w(o.d, d.serve)}" title="${esc(d.name)}: ready, kept warm"></span>`;
    }
    rows += `<div class="crow${o.dropped ? ' dropped' : ''}"><div class="cname">${esc(d.name)}</div><div class="ctrack">${bars}${o.dropped ? '<span class="droptext">doesn\'t fit</span>' : ''}</div></div>`;
  });
  const serveLines = [...new Set(r.dishes.map((d) => d.serve))].map((t) => `<span class="serveline" style="left:${x(t)}"></span>`).join('');
  $('#chart').innerHTML = `<div class="chartin"><div class="crow axis"><div class="cname"></div><div class="ctrack">${ticks}</div></div>${rows}<div class="crow overlay"><div class="cname"></div><div class="ctrack">${serveLines}</div></div></div>`;
}

// ---------------------------------------------------------------------------------------------------------------

renderSettings(); bindSettings(); renderDishes(); bindDishes(); run();
