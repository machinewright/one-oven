// One-oven dinner planner: core scheduler.
//
// Time is counted in slots of SLOT minutes. Slot 0 is the earliest moment the kitchen is available; the main
// serving time is slot S. A dish is a chain of steps (prep, oven, hob, rest, other). Its last step ends at its
// "done" slot d, which must lie in [serve - hold, serve] (it can wait, kept warm, at most `hold` minutes).
// Between steps a dish may wait up to step.wait minutes.
//
// Resources: each oven has a number of shelves and ONE temperature at a time. A dish's oven step accepts a range
// of temperatures [lo, hi]; before it goes in, the oven must already have been inside that range for `preheat`
// minutes. The hob has a number of rings. Steps marked `hands` need one cook for their whole duration.
//
// Feasibility of a full assignment is exact: shelves/rings/cooks are capacity sums per slot, and the oven
// temperature in a slot is free to be any value in the intersection of every range that constrains that slot
// (occupants and preheaters), so a plan exists iff every slot's intersection is non-empty.

export const SLOT = 5;

const slots = (min) => Math.ceil(Math.max(0, min) / SLOT);

// ---------------------------------------------------------------------------------------------------------------
// Normalising input

export function normalise(problem) {
  const p = problem;
  const startBefore = slots(p.startBefore ?? 360); // kitchen free this many minutes before serving
  const ovens = (p.ovens ?? [{ name: 'Oven', shelves: 3 }]).map((o, i) => ({
    name: o.name ?? `Oven ${i + 1}`, shelves: o.shelves ?? 3, preheat: slots(o.preheat ?? 15),
  }));
  const S = startBefore;
  const dishes = p.dishes.map((d, di) => {
    const serve = S + Math.round((d.serveAt ?? 0) / SLOT);
    const steps = d.steps.map((s) => {
      const kind = s.kind ?? 'other';
      const len = slots(s.min);
      const st = { kind, len, maxLen: Math.max(len, slots(s.max ?? s.min)), wait: slots(s.wait ?? 0), hands: !!s.hands,
        label: s.label ?? '' };
      if (kind === 'oven') {
        const t = s.temp;
        st.temp = Array.isArray(t) ? [t[0], t[1]] : [t, t];
        st.nominal = s.nominal ?? (Array.isArray(t) ? (t[0] + t[1]) / 2 : t);
        st.shelves = s.shelves ?? 1;
        st.ovens = s.ovens ?? null; // allowed oven indices, null = any
      }
      if (kind === 'hob') st.rings = s.rings ?? 1;
      return st;
    }).filter((s) => s.len > 0);
    const soft = p.soft !== false;
    return { name: d.name ?? `Dish ${di + 1}`, serve, hold: slots(d.hold ?? 0), steps, weight: d.weight ?? 1,
      off: !!d.off, extraHold: soft ? slots(45) : 0, widen: soft && d.exact !== true ? [0, 10, 20] : [0],
      canDrop: soft };
  });
  const end = Math.max(S, ...dishes.map((d) => d.serve)) + 1;
  return { S, end, ovens, rings: p.rings ?? 4, cooks: p.cooks ?? 1, dishes, wChange: p.wChange ?? 3 };
}

// Prices of compromises (in the same units as "one dish waits 5 more minutes" = 1).
export const PRICE = { extraWait: 4, widen: { 10: 6, 20: 15 }, drop: 60 };
function holdCost(dish, h) {
  return dish.weight * (h <= dish.hold ? h : dish.hold + PRICE.extraWait * (h - dish.hold));
}

// ---------------------------------------------------------------------------------------------------------------
// Options: every way to place one dish. An option is { cost, d, steps:[{from,to,oven}], uses:[...] }.
// A use is { r: resource key, from, to, n, lo, hi }  (lo/hi only for oven temperature constraints).

const MAX_OPTIONS = 4000;

export function dishOptions(P, dish) {
  const out = [];
  const nSteps = dish.steps.length;
  const ovenSteps = dish.steps.map((s, i) => (s.kind === 'oven' ? i : -1)).filter((i) => i >= 0);
  // enumerate done slot, waits (coarsened if too many combos), oven choices
  const waitChoices = dish.steps.map((s, i) => {
    if (i === nSteps - 1 || s.wait === 0) return [0];
    const w = []; const stepW = Math.max(1, Math.ceil((s.wait + 1) / 7));
    for (let k = 0; k <= s.wait; k += stepW) w.push(k);
    if (w[w.length - 1] !== s.wait) w.push(s.wait);
    return w;
  });
  const lenChoices = dish.steps.map((s) => {
    if (s.maxLen === s.len) return [s.len];
    const w = []; const st = Math.max(1, Math.ceil((s.maxLen - s.len + 1) / 7));
    for (let k = s.len; k <= s.maxLen; k += st) w.push(k);
    if (w[w.length - 1] !== s.maxLen) w.push(s.maxLen);
    return w;
  });
  const ovenChoices = ovenSteps.map((i) => dish.steps[i].ovens ?? P.ovens.map((_, k) => k));
  for (let h = 0; h <= dish.hold + dish.extraHold; h++) {
    const d = dish.serve - h;
    const waits = new Array(nSteps).fill(0);
    const lens = dish.steps.map((s) => s.len);
    const recL = (i) => { // choose lengths of flexible steps
      if (i < 0) { rec(nSteps - 2); return; }
      for (const l of lenChoices[i]) { lens[i] = l; recL(i - 1); if (out.length >= MAX_OPTIONS) return; }
    };
    const rec = (i) => { // choose waits for steps i..0 backwards (wait after step i-1)
      if (i < 0) { placeOvens(d, h, waits.slice(), lens.slice()); return; }
      for (const w of waitChoices[i]) { waits[i] = w; rec(i - 1); if (out.length >= MAX_OPTIONS) return; }
    };
    recL(nSteps - 1);
    if (out.length >= MAX_OPTIONS) break;
  }
  function placeOvens(d, h, waits, lens) {
    // times backwards from d
    const times = new Array(nSteps);
    let t = d;
    for (let i = nSteps - 1; i >= 0; i--) {
      const s = dish.steps[i];
      if (i < nSteps - 1) t -= waits[i];
      times[i] = { from: t - lens[i], to: t };
      t -= lens[i];
    }
    if (times.length && times[0].from < 0) return;
    const sumWait = waits.reduce((a, b) => a + b, 0);
    const base = holdCost(dish, h) + 0.5 * sumWait * dish.weight;
    const combos = cartesian(ovenChoices);
    const widens = cartesian(ovenSteps.map(() => dish.widen));
    for (const combo of combos) for (const wid of widens) {
      const steps = times.map((x) => ({ ...x, oven: -1 }));
      ovenSteps.forEach((si, k) => { steps[si].oven = combo[k]; });
      const uses = [];
      const ranges = dish.steps.map(() => null);
      let ok = true, wcost = 0;
      ovenSteps.forEach((si, k) => {
        const s = dish.steps[si], w = wid[k];
        ranges[si] = w ? [Math.min(s.temp[0], s.nominal - w), Math.max(s.temp[1], s.nominal + w)] : s.temp;
        if (w) wcost += PRICE.widen[w] * dish.weight;
      });
      dish.steps.forEach((s, i) => {
        const { from, to } = steps[i];
        if (s.kind === 'oven') {
          const o = steps[i].oven;
          // preheat: unless the previous step of this dish was in the same oven ending right now
          const prev = i > 0 ? dish.steps[i - 1] : null;
          const continuing = prev && prev.kind === 'oven' && steps[i - 1].oven === o && steps[i - 1].to === from;
          const ph = continuing ? 0 : P.ovens[o].preheat;
          if (from - ph < 0) ok = false;
          const [lo, hi] = ranges[i];
          uses.push({ r: 'o' + o, from, to, n: s.shelves, lo, hi });
          if (ph > 0) uses.push({ r: 'o' + o, from: from - ph, to: from, n: 0, lo, hi });
        } else if (s.kind === 'hob') {
          uses.push({ r: 'hob', from, to, n: s.rings });
        }
        if (s.hands) uses.push({ r: 'hands', from, to, n: 1 });
      });
      if (!ok) continue;
      out.push({ cost: base + wcost, d, h, steps, uses, ranges, widen: wid });
      if (out.length >= MAX_OPTIONS) return;
    }
  }
  if (dish.canDrop) out.push({ cost: PRICE.drop * dish.weight, dropped: true, d: null, h: 0, steps: [], uses: [], ranges: [] });
  out.sort((a, b) => a.cost - b.cost);
  return out;
}

function cartesian(lists) {
  let acc = [[]];
  for (const l of lists) { const nx = []; for (const a of acc) for (const x of l) nx.push([...a, x]); acc = nx; }
  return acc;
}

// ---------------------------------------------------------------------------------------------------------------
// State: per resource, per slot: used capacity; for ovens also the temperature interval [lo, hi].

class State {
  constructor(P) {
    this.P = P; const T = this.T = P.end;
    this.keys = ['hob', 'hands', ...P.ovens.map((_, i) => 'o' + i)];
    this.ri = Object.fromEntries(this.keys.map((k, i) => [k, i]));
    this.capArr = [P.rings, P.cooks, ...P.ovens.map((o) => o.shelves)];
    const R = this.keys.length;
    this.usedF = new Int32Array(R * T);
    this.loF = new Float64Array(R * T).fill(-Infinity);
    this.hiF = new Float64Array(R * T).fill(Infinity);
    this.lo = {}; this.hi = {};
    P.ovens.forEach((_, i) => { const r = this.ri['o' + i]; this.lo['o' + i] = this.loF.subarray(r * T, r * T + T); this.hi['o' + i] = this.hiF.subarray(r * T, r * T + T); });
    this.trail = [];
  }
  // compile an option into per-cell demands: idx (flat), n, lo, hi, cap. null if it conflicts with itself.
  compile(opt) {
    if (opt._need !== undefined) return opt._need;
    const T = this.T, m = new Map();
    for (const u of opt.uses) {
      const r = this.ri[u.r];
      for (let t = u.from; t < u.to; t++) {
        const k = r * T + t;
        let e = m.get(k);
        if (!e) { e = [k, 0, -Infinity, Infinity, this.capArr[r]]; m.set(k, e); }
        e[1] += u.n;
        if (u.lo !== undefined) { e[2] = Math.max(e[2], u.lo); e[3] = Math.min(e[3], u.hi); }
      }
    }
    let ok = true;
    const idx = [], n = [], lo = [], hi = [], cap = [];
    for (const e of m.values()) {
      if (e[1] > e[4] || e[2] > e[3]) ok = false;
      idx.push(e[0]); n.push(e[1]); lo.push(e[2]); hi.push(e[3]); cap.push(e[4]);
    }
    opt._need = ok ? { idx: Int32Array.from(idx), n: Int32Array.from(n), lo: Float64Array.from(lo), hi: Float64Array.from(hi), cap: Int32Array.from(cap) } : null;
    return opt._need;
  }
  selfFits(opt) { return this.compile(opt) !== null; }
  fitsAll(opt) {
    const c = this.compile(opt);
    if (!c) return false;
    const { idx, n, lo, hi, cap } = c, U = this.usedF, LO = this.loF, HI = this.hiF;
    for (let j = 0; j < idx.length; j++) {
      const k = idx[j];
      if (n[j] && U[k] + n[j] > cap[j]) return false;
      const l = LO[k] > lo[j] ? LO[k] : lo[j], h = HI[k] < hi[j] ? HI[k] : hi[j];
      if (l > h) return false;
    }
    return true;
  }
  apply(opt) {
    const mark = this.trail.length, c = this.compile(opt);
    const { idx, n, lo, hi } = c, U = this.usedF, LO = this.loF, HI = this.hiF;
    for (let j = 0; j < idx.length; j++) {
      const k = idx[j];
      this.trail.push(k, U[k], LO[k], HI[k]);
      U[k] += n[j]; if (lo[j] > LO[k]) LO[k] = lo[j]; if (hi[j] < HI[k]) HI[k] = hi[j];
    }
    return mark;
  }
  undo(mark) {
    const tr = this.trail, U = this.usedF, LO = this.loF, HI = this.hiF;
    while (tr.length > mark) { const h = tr.pop(), l = tr.pop(), u = tr.pop(), k = tr.pop(); U[k] = u; LO[k] = l; HI[k] = h; }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Oven temperature schedule for a finished assignment: fewest changes (greedy interval stabbing is optimal), value
// in each run chosen as close as possible to the nominal temperatures of the dishes in it.

export function tempSchedule(P, state, chosen) {
  const res = [];
  for (let o = 0; o < P.ovens.length; o++) {
    const r = 'o' + o, lo = state.lo[r], hi = state.hi[r];
    const runs = [];
    let cur = null;
    for (let t = 0; t < P.end; t++) {
      if (lo[t] === -Infinity && hi[t] === Infinity) continue; // unconstrained
      if (cur && Math.max(cur.lo, lo[t]) <= Math.min(cur.hi, hi[t])) {
        cur.lo = Math.max(cur.lo, lo[t]); cur.hi = Math.min(cur.hi, hi[t]); cur.to = t + 1;
      } else {
        cur = { from: t, to: t + 1, lo: lo[t], hi: hi[t] }; runs.push(cur);
      }
    }
    // nominal temperatures of oven steps overlapping each run
    for (const run of runs) {
      const noms = [];
      chosen.forEach(({ dish, opt }) => dish.steps.forEach((s, i) => {
        if (!opt.dropped && s.kind === 'oven' && opt.steps[i].oven === o && opt.steps[i].from < run.to && opt.steps[i].to > run.from) noms.push(s.nominal);
      }));
      noms.sort((a, b) => a - b);
      const med = noms.length ? noms[Math.floor((noms.length - 1) / 2)] : run.lo;
      run.temp = Math.min(run.hi, Math.max(run.lo, med));
    }
    // merge runs separated by short unconstrained gaps if same temperature
    const merged = [];
    for (const run of runs) {
      const last = merged[merged.length - 1];
      if (last && last.temp === run.temp && run.from - last.to <= slots(30)) { last.to = run.to; } else merged.push({ ...run });
    }
    res.push(merged);
  }
  return res;
}

function changeCount(sched) {
  // each run start is a "set oven to X" event; the first one in each oven is free (you have to turn it on)
  let c = 0; for (const runs of sched) c += Math.max(0, runs.length - 1); return c;
}

function deviation(P, sched, chosen) {
  let dev = 0;
  chosen.forEach(({ dish, opt }) => !opt.dropped && dish.steps.forEach((s, i) => {
    if (s.kind !== 'oven') return;
    const st = opt.steps[i];
    for (const run of sched[st.oven]) if (run.from < st.to && run.to > st.from) dev += Math.abs(run.temp - s.nominal) / 10;
  }));
  return dev;
}

// ---------------------------------------------------------------------------------------------------------------
// Branch and bound with forward checking and "fewest options first" dish ordering.

export function solve(problem, { nodeLimit = 1e9, timeMs = Infinity } = {}) {
  const P = normalise(problem);
  const active = P.dishes.filter((d) => !d.off && d.steps.length);
  const state = new State(P);
  const lists = active.map((d) => dishOptions(P, d).filter((o) => state.selfFits(o)));
  const n = active.length;
  let best = null, bestCost = Infinity, nodes = 0, exhausted = true;
  const chosen = new Array(n).fill(null);
  const t0 = Date.now();
  if (lists.some((l) => l.length === 0)) return finish();
  const firstFit = new Int32Array(n); // scratch: index of cheapest option that fits now

  function leaf(cost) {
    const c = chosen.map((opt, i) => ({ dish: active[i], opt }));
    const sched = tempSchedule(P, state, c);
    const total = cost + P.wChange * changeCount(sched) + 0.2 * deviation(P, sched, c);
    if (total < bestCost - 1e-9) { bestCost = total; best = { chosen: chosen.slice(), sched, cost: total }; }
  }
  function rec(cost, left) {
    if (++nodes > nodeLimit || ((nodes & 255) === 0 && Date.now() - t0 > timeMs)) { exhausted = false; return; }
    if (left === 0) { leaf(cost); return; }
    // bound: every remaining dish pays at least its cheapest option that still fits; pick the dish whose cheapest
    // fitting option is most expensive relative to its unconstrained cheapest (it is the one being squeezed)
    let lb = cost, bi = -1, bScore = -Infinity;
    for (let i = 0; i < n; i++) {
      if (chosen[i]) continue;
      const l = lists[i];
      let j = 0; while (j < l.length && !state.fitsAll(l[j])) j++;
      if (j === l.length) return; // nothing fits (only when dropping is not allowed)
      firstFit[i] = j; lb += l[j].cost;
      const score = l[j].cost - l[0].cost + 1e-3 * (1e4 - l.length);
      if (score > bScore) { bScore = score; bi = i; }
    }
    if (lb >= bestCost - 1e-9) return;
    const l = lists[bi], restLb = lb - cost - l[firstFit[bi]].cost;
    for (let j = firstFit[bi]; j < l.length; j++) {
      const opt = l[j];
      if (cost + opt.cost + restLb >= bestCost - 1e-9) break;
      if (!state.fitsAll(opt)) continue;
      const mark = state.apply(opt); chosen[bi] = opt;
      rec(cost + opt.cost, left - 1);
      chosen[bi] = null; state.undo(mark);
      if (!exhausted) return;
    }
  }
  rec(0, n);
  return finish();

  function finish() {
    return { P, active, ok: !!best, best, nodes, proven: exhausted, ms: Date.now() - t0,
      emptyDishes: lists.map((l, i) => (l.length ? null : active[i].name)).filter(Boolean) };
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Brute force (tests only): every combination of options, same checks, same cost.

export function bruteForce(problem) {
  const P = normalise(problem);
  const active = P.dishes.filter((d) => !d.off && d.steps.length);
  const opts = active.map((d) => dishOptions(P, d));
  const state = new State(P);
  let bestCost = Infinity;
  const chosen = [];
  (function rec(i) {
    if (i === active.length) {
      const c = chosen.map((opt, k) => ({ dish: active[k], opt }));
      const sched = tempSchedule(P, state, c);
      const total = chosen.reduce((a, o) => a + o.cost, 0) + P.wChange * changeCount(sched) + 0.2 * deviation(P, sched, c);
      if (total < bestCost) bestCost = total;
      return;
    }
    for (const o of opts[i]) {
      if (!state.fitsAll(o)) continue;
      const m = state.apply(o); chosen.push(o); rec(i + 1); chosen.pop(); state.undo(m);
    }
  })(0);
  return bestCost;
}

// Independent verifier for a returned plan (tests): recompute every per-slot sum and temperature from scratch.
export function verify(result) {
  const { P, active, best } = result;
  const errs = [];
  const T = P.end;
  const use = {};
  const add = (r, t, n) => { use[r] ??= new Array(T).fill(0); use[r][t] += n; };
  best.chosen.forEach((opt, i) => {
    const dish = active[i];
    if (opt.dropped) return;
    if (opt.d < dish.serve - dish.hold - dish.extraHold) errs.push(`${dish.name}: waits too long`);
    if (opt.d > dish.serve) errs.push(`${dish.name}: done at ${opt.d}, serve ${dish.serve}`);
    opt.steps.forEach((st, k) => {
      const s = dish.steps[k];
      if (st.to - st.from < s.len || st.to - st.from > s.maxLen) errs.push(`${dish.name}: step ${k} length`);
      if (st.from < 0) errs.push(`${dish.name}: starts before the kitchen is free`);
      if (k > 0) { const gap = st.from - opt.steps[k - 1].to; if (gap < 0 || gap > dish.steps[k - 1].wait) errs.push(`${dish.name}: gap ${gap}`); }
      if (k === dish.steps.length - 1 && st.to !== opt.d) errs.push(`${dish.name}: last step end`);
      for (let t = st.from; t < st.to; t++) {
        if (s.kind === 'hob') add('hob', t, s.rings);
        if (s.hands) add('hands', t, 1);
        if (s.kind === 'oven') {
          add('o' + st.oven, t, s.shelves);
          const run = best.sched[st.oven].find((r) => r.from <= t && t < r.to);
          if (!run || run.temp < opt.ranges[k][0] || run.temp > opt.ranges[k][1]) errs.push(`${dish.name}: oven temp at ${t}`);
        }
      }
      if (s.kind === 'oven') {
        const prev = k > 0 ? dish.steps[k - 1] : null;
        const cont = prev && prev.kind === 'oven' && opt.steps[k - 1].oven === st.oven && opt.steps[k - 1].to === st.from;
        if (!cont) for (let t = st.from - P.ovens[st.oven].preheat; t < st.from; t++) {
          const run = best.sched[st.oven].find((r) => r.from <= t && t < r.to);
          if (!run || run.temp < opt.ranges[k][0] || run.temp > opt.ranges[k][1]) errs.push(`${dish.name}: not preheated at ${t}`);
        }
      }
    });
  });
  for (const [r, arr] of Object.entries(use)) {
    const cap = r === 'hob' ? P.rings : r === 'hands' ? P.cooks : P.ovens[+r.slice(1)].shelves;
    arr.forEach((v, t) => { if (v > cap) errs.push(`${r} over capacity at ${t}: ${v}/${cap}`); });
  }
  return errs;
}

// ---------------------------------------------------------------------------------------------------------------
// When nothing fits: try small changes, one at a time (then pairs of the cheapest), and report those that work.
// Each fix is { kind, dish, text-friendly fields, size } applied to a deep copy of the input problem.

function clone(x) { return JSON.parse(JSON.stringify(x)); }

export function candidateFixes(problem) {
  const fx = [];
  problem.dishes.forEach((d, di) => {
    if (d.off) return;
    for (const add of [15, 30, 45]) fx.push({ kind: 'hold', di, add, size: add / 15 });
    d.steps.forEach((s, si) => {
      if (s.kind !== 'oven') return;
      const t = s.temp, nom = Array.isArray(t) ? (t[0] + t[1]) / 2 : t;
      const lo = Array.isArray(t) ? t[0] : t, hi = Array.isArray(t) ? t[1] : t;
      for (const w of [10, 20]) if (lo > nom - w || hi < nom + w) fx.push({ kind: 'temp', di, si, lo: Math.min(lo, nom - w), hi: Math.max(hi, nom + w), size: w === 10 ? 1.5 : 3 });
    });
    fx.push({ kind: 'drop', di, size: 6 });
  });
  fx.push({ kind: 'cook', size: 3 });
  fx.push({ kind: 'earlier', add: 60, size: 2 });
  return fx;
}

export function applyFix(problem, f) {
  const p = clone(problem);
  if (f.kind === 'hold') p.dishes[f.di].hold = (p.dishes[f.di].hold ?? 0) + f.add;
  if (f.kind === 'temp') { const s = p.dishes[f.di].steps[f.si]; const nom = Array.isArray(s.temp) ? (s.temp[0] + s.temp[1]) / 2 : s.temp; s.nominal = s.nominal ?? nom; s.temp = [f.lo, f.hi]; }
  if (f.kind === 'drop') p.dishes[f.di].off = true;
  if (f.kind === 'cook') p.cooks = (p.cooks ?? 1) + 1;
  if (f.kind === 'earlier') p.startBefore = (p.startBefore ?? 360) + f.add;
  return p;
}

export function suggestFixes(problem, { nodeLimit = 20000, max = 5, timeBudgetMs = 4000 } = {}) {
  const t0 = Date.now();
  const cands = candidateFixes(problem).sort((a, b) => a.size - b.size);
  const works = [];
  const tried = [];
  for (const f of cands) {
    if (Date.now() - t0 > timeBudgetMs) break;
    // skip a bigger version of a fix that already works (hold +30 when +15 works, ±20 when ±10 works)
    if (works.some((w) => w.fixes.length === 1 && sameTarget(w.fixes[0], f))) continue;
    const r = solve(applyFix(problem, f), { nodeLimit });
    tried.push(f);
    if (r.ok) works.push({ fixes: [f], size: f.size, result: r });
  }
  if (works.length === 0) {
    const cheap = tried.filter((f) => f.kind !== 'drop').slice(0, 24);
    outer: for (let i = 0; i < cheap.length; i++) for (let j = i + 1; j < cheap.length; j++) {
      if (Date.now() - t0 > timeBudgetMs * 2) break outer;
      const a = cheap[i], b = cheap[j];
      if (sameTarget(a, b)) continue;
      const r = solve(applyFix(applyFix(problem, a), b), { nodeLimit });
      if (r.ok) works.push({ fixes: [a, b], size: a.size + b.size, result: r });
    }
  }
  works.sort((a, b) => a.size - b.size || a.result.best.cost - b.result.best.cost);
  return works.slice(0, max);
}

function sameTarget(a, b) {
  return a.kind === b.kind && a.di === b.di && a.si === b.si;
}
