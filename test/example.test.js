import test from 'node:test';
import assert from 'node:assert/strict';
import { solve, verify } from '../src/plan.js';
import { EXAMPLE, toProblem } from '../src/example.js';

test("reproduces olive magazine's oven times", () => {
  const r = solve(toProblem(EXAMPLE), { timeMs: 5000 });
  assert.ok(r.ok); assert.deepEqual(verify(r), []);
  const at = (slot) => { const m = 15 * 60 + (slot - r.P.S) * 5; return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`; };
  const byName = Object.fromEntries(r.active.map((d, i) => [d.name, r.best.chosen[i]]));
  const T = byName['Turkey (5 kg)'].steps;
  assert.equal(at(T[0].from), '9:30'); assert.equal(at(T[1].from), '10:30'); assert.equal(at(T[2].from), '11:00');
  assert.equal(at(T[3].from), '12:30'); assert.equal(at(T[3].to), '13:30'); assert.equal(at(T[5].from), '14:30');
  assert.equal(at(byName['Roast potatoes'].steps[0].from), '13:15');
  assert.equal(at(byName['Roast potatoes'].steps[1].from), '13:30');
  assert.equal(at(byName['Carrots and parsnips'].steps[0].from), '13:30');
  assert.equal(at(byName['Pigs in blankets'].steps[0].from), '14:00');
  const runs = r.best.sched[0].map((x) => [at(x.from), at(x.to), x.temp]);
  assert.deepEqual(runs, [['10:15', '11:00', 220], ['11:00', '15:00', 200]]);
  assert.ok(r.best.chosen.every((o) => !o.dropped && o.widen.every((w) => !w)));
});

test('one cook never does two hands-on things at once in the example', () => {
  const r = solve(toProblem(EXAMPLE), { timeMs: 5000 });
  const busy = new Map();
  r.active.forEach((d, i) => d.steps.forEach((s, k) => {
    if (!s.hands) return;
    const st = r.best.chosen[i].steps[k];
    for (let t = st.from; t < st.to; t++) { assert.ok(!busy.has(t), `${d.name} overlaps ${busy.get(t)}`); busy.set(t, d.name); }
  }));
  assert.ok(busy.size >= 6 + 3 + 2);
});

test('made-ahead pie is baked before its ready-by time, in the idle second oven', () => {
  const menu = {
    serve: '16:00', from: '08:00', ovens: [{ shelves: 3 }, { shelves: 1 }], rings: 4, cooks: 2,
    dishes: [
      { name: 'Turkey', steps: [{ kind: 'oven', min: 210, temp: 163, shelves: 2 }, { kind: 'rest', min: 30, max: 60 }] },
      { name: 'Rolls', steps: [{ kind: 'oven', min: 15, temp: 204 }], hold: 0 },
      { name: 'Pumpkin pie', readyBy: '12:00', exact: true, steps: [{ kind: 'oven', min: 15, temp: 218 }, { kind: 'oven', min: 45, temp: 177 }] },
    ],
  };
  const r = solve(toProblem(menu), { nodeLimit: 60000 });
  assert.ok(r.ok); assert.deepEqual(verify(r), []);
  const i = r.active.findIndex((d) => d.name === 'Pumpkin pie');
  const pie = r.best.chosen[i];
  assert.ok(!pie.dropped);
  assert.ok(pie.d <= r.P.S - 48, 'done by 12:00 (4 h before serving)');
  assert.equal(pie.steps[0].oven, pie.steps[1].oven);
  assert.equal(r.best.chosen.filter((o) => o.widen && o.widen.some((w) => w)).length, 0);
});

test('same menu, same plan (node limit, not time)', () => {
  const a = solve(toProblem(EXAMPLE), { nodeLimit: 3000 }), b = solve(toProblem(EXAMPLE), { nodeLimit: 3000 });
  assert.equal(JSON.stringify(a.best.chosen.map((o) => o.steps)), JSON.stringify(b.best.chosen.map((o) => o.steps)));
});
