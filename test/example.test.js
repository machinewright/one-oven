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
