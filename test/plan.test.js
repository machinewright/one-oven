import test from 'node:test';
import assert from 'node:assert/strict';
import { solve, bruteForce, verify } from '../src/plan.js';

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

function randomProblem(r) {
  const nd = 2 + Math.floor(r() * 3);
  const temps = [160, 180, 200, 220];
  const dishes = [];
  for (let i = 0; i < nd; i++) {
    const steps = [];
    const ns = 1 + Math.floor(r() * 3);
    for (let k = 0; k < ns; k++) {
      const kind = ['oven', 'oven', 'hob', 'prep', 'rest'][Math.floor(r() * 5)];
      const st = { kind, min: 5 * (1 + Math.floor(r() * 6)), wait: r() < 0.3 ? 10 : 0, hands: kind === 'prep' || (kind === 'hob' && r() < 0.3) };
      if (kind === 'oven') { const t = temps[Math.floor(r() * 4)]; st.temp = r() < 0.4 ? [t - 20, t] : t; st.shelves = 1 + Math.floor(r() * 2); }
      if (kind === 'rest' && r() < 0.5) st.max = st.min + 15;
      steps.push(st);
    }
    dishes.push({ name: 'd' + i, hold: 5 * Math.floor(r() * 4), steps, serveAt: r() < 0.15 ? 15 : 0 });
  }
  return { startBefore: 90, ovens: r() < 0.3 ? [{ shelves: 2 }, { shelves: 1 }] : [{ shelves: 2, preheat: 10 }], rings: 1 + Math.floor(r() * 2), cooks: 1, dishes };
}

test('B&B optimum equals brute force on random small problems, plans verify', () => {
  const r = rng(42);
  let feasible = 0, infeasible = 0;
  for (let k = 0; k < 300; k++) {
    const p = randomProblem(r);
    const bf = bruteForce({ ...p, soft: false });
    const res = solve({ ...p, soft: false }, { nodeLimit: 1e7 });
    assert.ok(res.proven);
    if (bf === Infinity) { assert.equal(res.ok, false, `case ${k}`); infeasible++; continue; }
    feasible++;
    assert.ok(res.ok, `case ${k} solvable`);
    assert.ok(Math.abs(res.best.cost - bf) < 1e-6, `case ${k}: ${res.best.cost} vs ${bf}`);
    assert.deepEqual(verify(res), [], `case ${k}`);
  }
  console.log({ feasible, infeasible });
  assert.ok(feasible > 50 && infeasible > 20);
});

test('two temperatures in one oven: turkey rests while potatoes roast', () => {
  const p = {
    startBefore: 300, ovens: [{ shelves: 3 }], rings: 4, cooks: 1,
    dishes: [
      { name: 'Turkey', steps: [{ kind: 'oven', min: 150, temp: 180, shelves: 2 }, { kind: 'rest', min: 30, max: 90 }], hold: 0 },
      { name: 'Potatoes', steps: [{ kind: 'oven', min: 60, temp: 220 }], hold: 0 },
    ],
  };
  const res = solve(p);
  assert.ok(res.ok);
  assert.deepEqual(verify(res), []);
  const t = res.best.chosen[0].steps[0], q = res.best.chosen[1].steps[0];
  assert.ok(t.to <= q.from - 3, 'turkey out before potatoes in (with preheat)');
});

test('with compromises allowed: optimum equals brute force on tiny problems', () => {
  const r = rng(7);
  let drops = 0, widened = 0, extra = 0;
  for (let k = 0; k < 25; k++) {
    const p = randomProblem(r);
    p.dishes = p.dishes.slice(0, 3);
    p.dishes.forEach((d) => { d.steps = d.steps.slice(0, 2); });
    const bf = bruteForce(p);
    const res = solve(p);
    assert.ok(res.ok && res.proven);
    assert.ok(Math.abs(res.best.cost - bf) < 1e-6, `case ${k}: ${res.best.cost} vs ${bf}`);
    assert.deepEqual(verify(res), [], `case ${k}`);
    for (const [i, o] of res.best.chosen.entries()) {
      if (o.dropped) drops++; else { if (o.widen.some((w) => w)) widened++; if (o.h > res.active[i].hold) extra++; }
    }
  }
  console.log({ drops, widened, extra });
  assert.ok(widened > 0 && extra > 0);
});

test('dish weights ("matters most"): optimum still equals brute force', () => {
  const r = rng(11);
  for (let k = 0; k < 20; k++) {
    const p = randomProblem(r);
    p.dishes = p.dishes.slice(0, 3);
    p.dishes.forEach((d) => { d.steps = d.steps.slice(0, 2); });
    p.dishes[Math.floor(r() * p.dishes.length)].weight = 4;
    const bf = bruteForce(p);
    const res = solve(p);
    assert.ok(res.ok && res.proven);
    assert.ok(Math.abs(res.best.cost - bf) < 1e-6, `case ${k}: ${res.best.cost} vs ${bf}`);
    assert.deepEqual(verify(res), [], `case ${k}`);
  }
});

test('marking Yorkshire puddings "matters most" moves their compromise onto other dishes', async () => {
  const { xmas } = await import('../proto/xmas.js');
  const { TOP_WEIGHT } = await import('../src/example.js');
  const yi = xmas.dishes.findIndex((d) => d.name === 'Yorkshire puddings');
  const plain = solve(xmas);
  assert.ok(plain.best.chosen[yi].widen.some((w) => w), 'without the mark they cook at a compromise temperature');
  const top = solve({ ...xmas, dishes: xmas.dishes.map((d, i) => (i === yi ? { ...d, weight: TOP_WEIGHT } : d)) });
  const o = top.best.chosen[yi];
  assert.ok(top.proven && !o.dropped && o.h === 0 && o.widen.every((w) => !w));
  assert.ok(top.best.chosen.every((c) => !c.dropped));
  assert.deepEqual(verify(top), []);
});

test('dishes pinned to one oven: optimum equals brute force, verify checks the pin', () => {
  const r = rng(23);
  let n = 0;
  for (let k = 0; k < 40 && n < 15; k++) {
    const p = randomProblem(r);
    if (p.ovens.length < 2) continue;
    n++;
    p.dishes = p.dishes.slice(0, 3);
    p.dishes.forEach((d) => { d.steps = d.steps.slice(0, 2); });
    const pin = Math.floor(r() * 2);
    p.dishes[0].steps.forEach((s) => { if (s.kind === 'oven') s.ovens = [pin]; });
    const res = solve(p);
    assert.ok(Math.abs(res.best.cost - bruteForce(p)) < 1e-6, `case ${k}`);
    assert.deepEqual(verify(res), []);
    const o = res.best.chosen[0];
    if (!o.dropped) p.dishes[0].steps.forEach((s, j) => { if (s.kind === 'oven') assert.equal(o.steps[j].oven, pin); });
    // tamper: move the pinned dish to the other oven; verify must object
    if (!o.dropped && p.dishes[0].steps.some((s) => s.kind === 'oven')) {
      const t = structuredClone(res.best); t.chosen[0].steps.forEach((st, j) => { if (p.dishes[0].steps[j].kind === 'oven') st.oven = 1 - pin; });
      assert.ok(verify({ ...res, best: t }).some((e) => e.includes("isn't allowed")));
    }
  }
  assert.ok(n >= 5);
});
