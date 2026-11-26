// An oracle written from the problem definition, sharing nothing with the solver's option generator or state:
// enumerate every start slot of every step of every dish, check every rule directly, and find the cheapest feasible
// plan in strict mode (no compromises). Only the feasibility verdict and the waiting cost are compared.
import test from 'node:test';
import assert from 'node:assert/strict';
import { solve } from '../src/plan.js';

const S5 = (m) => Math.ceil(m / 5);
function oracle(p) {
  const S = Math.floor(p.startBefore / 5), P = p.ovens.map((o) => ({ shelves: o.shelves, pre: S5(o.preheat ?? 15) }));
  // every placement of one dish: list of {from,to,oven} per step
  const placements = p.dishes.map((d) => {
    const out = [];
    const serve = S + Math.floor((d.serveAt ?? 0) / 5), hold = S5(d.hold ?? 0);
    const rec = (k, from, acc) => {
      if (k === d.steps.length) {
        const done = acc[acc.length - 1].to;
        if (done <= serve && done >= serve - hold) out.push({ steps: acc, h: serve - done });
        return;
      }
      const s = d.steps[k];
      const lens = []; for (let L = S5(s.min); L <= S5(s.max ?? s.min); L++) lens.push(L);
      const starts = k === 0 ? [...Array(serve + 1).keys()] : Array.from({ length: S5(d.steps[k - 1].wait ?? 0) + 1 }, (_, g) => from + g);
      const ovens = s.kind === 'oven' ? P.map((_, i) => i) : [-1];
      for (const st of starts) for (const L of lens) for (const o of ovens) {
        if (s.kind === 'oven' && k > 0 && acc.some((x, j) => d.steps[j].kind === 'oven' && x.oven !== o)) continue; // one oven per dish
        rec(k + 1, st + L, [...acc, { from: st, to: st + L, oven: o }]);
      }
    };
    rec(0, 0, []);
    return out;
  });
  let best = Infinity;
  const pick = [];
  (function go(i) {
    if (i === p.dishes.length) {
      if (ok()) best = Math.min(best, pick.reduce((a, x) => a + x.h, 0));
      return;
    }
    for (const x of placements[i]) { pick.push(x); go(i + 1); pick.pop(); }
  })(0);
  function ok() {
    const T = S + 200;
    for (let t = 0; t < T; t++) {
      let hob = 0, hands = 0;
      const shelves = P.map(() => 0), lo = P.map(() => -Infinity), hi = P.map(() => Infinity);
      pick.forEach((x, i) => p.dishes[i].steps.forEach((s, k) => {
        const st = x.steps[k];
        const inStep = st.from <= t && t < st.to;
        if (inStep && s.kind === 'hob') hob += s.rings ?? 1;
        if (inStep && (s.kind === 'prep' || (s.kind === 'hob' && s.hands))) hands++;
        if (s.kind === 'oven') {
          const prev = k > 0 ? x.steps[k - 1] : null;
          const cont = prev && p.dishes[i].steps[k - 1].kind === 'oven' && prev.oven === st.oven && prev.to === st.from;
          const pre = cont ? 0 : P[st.oven].pre;
          if (st.from - pre < 0) { lo[0] = Infinity; return; }
          if (inStep) shelves[st.oven] += s.shelves ?? 1;
          if (st.from - pre <= t && t < st.to) { lo[st.oven] = Math.max(lo[st.oven], s.temp); hi[st.oven] = Math.min(hi[st.oven], s.temp); }
        }
        if (st.from < 0) lo[0] = Infinity;
      }));
      if (hob > p.rings || hands > p.cooks) return false;
      for (let o = 0; o < P.length; o++) if (shelves[o] > P[o].shelves || lo[o] > hi[o]) return false;
    }
    return true;
  }
  return best;
}

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
test('solver agrees with an independent oracle on tiny strict menus (feasibility and waiting)', () => {
  const r = rng(2024);
  let feas = 0, infeas = 0;
  for (let k = 0; k < 150; k++) {
    const dishes = [];
    const nd = 2 + Math.floor(r() * 2);
    for (let i = 0; i < nd; i++) {
      const steps = [];
      const ns = 1 + Math.floor(r() * 2);
      for (let j = 0; j < ns; j++) {
        const kind = ['oven', 'oven', 'hob', 'prep', 'rest'][Math.floor(r() * 5)];
        const s = { kind, min: 5 * (1 + Math.floor(r() * 3)) };
        if (r() < 0.3) s.max = s.min + 10;
        if (j < ns - 1 && r() < 0.3) s.wait = 10;
        if (kind === 'oven') { s.temp = [180, 200, 220][Math.floor(r() * 3)]; s.shelves = 1 + Math.floor(r() * 2); }
        if (kind === 'hob') s.hands = r() < 0.5;
        steps.push(s);
      }
      dishes.push({ name: 'd' + i, hold: 5 * Math.floor(r() * 3), serveAt: r() < 0.15 ? 10 : 0, steps });
    }
    const p = { startBefore: 60, ovens: r() < 0.3 ? [{ shelves: 2, preheat: 10 }, { shelves: 1, preheat: 10 }] : [{ shelves: 2, preheat: 10 }], rings: 1, cooks: 1, dishes, soft: false, wChange: 0 };
    const want = oracle(p);
    const got = solve(p);
    assert.equal(got.ok, want !== Infinity, `case ${k} feasibility`);
    if (got.ok) feas++; else infeas++;
    if (got.ok) {
      // with wChange 0 the solver minimises waiting (+ in-step waits at half weight + tiny deviation); its waiting can't beat the oracle's optimum
      assert.ok(got.best.chosen.reduce((a, o) => a + o.h, 0) >= want - 1e-9, `case ${k}: solver waits less than the optimum?`);
    }
  }
  console.log({ feas, infeas });
  assert.ok(feas > 30 && infeas > 20);
});
