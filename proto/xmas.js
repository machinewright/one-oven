import { solve, verify } from '../src/plan.js';
export const xmas = {
  startBefore: 420, ovens: [{ shelves: 3, preheat: 15 }], rings: 4, cooks: 1,
  dishes: [
    { name: 'Turkey', steps: [{ kind: 'oven', min: 30, temp: 220, shelves: 2 }, { kind: 'oven', min: 150, temp: 200, shelves: 2 }, { kind: 'rest', min: 30, max: 90 }] },
    { name: 'Roast potatoes', steps: [{ kind: 'hob', min: 10, hands: true }, { kind: 'oven', min: 15, temp: 200, label: 'heat the fat' }, { kind: 'oven', min: 60, max: 75, temp: 200 }], hold: 5 },
    { name: 'Parsnips and carrots', steps: [{ kind: 'oven', min: 45, temp: 200 }], hold: 10 },
    { name: 'Pigs in blankets', steps: [{ kind: 'oven', min: 35, temp: 200 }], hold: 15 },
    { name: 'Stuffing', steps: [{ kind: 'oven', min: 40, temp: 190 }], hold: 20 },
    { name: 'Yorkshire puddings', steps: [{ kind: 'oven', min: 20, temp: 220 }], hold: 0 },
    { name: 'Sprouts', steps: [{ kind: 'hob', min: 10, hands: true }], hold: 5 },
    { name: 'Gravy', steps: [{ kind: 'hob', min: 20, hands: true }], hold: 20 },
    { name: 'Bread sauce', steps: [{ kind: 'hob', min: 15 }], hold: 30 },
    { name: 'Christmas pudding', steps: [{ kind: 'hob', min: 60 }], serveAt: 45, hold: 10 },
  ],
};
if ((process.argv[1] ?? '').endsWith('xmas.js')) {
  for (const drop of [[], ['Yorkshire puddings']]) {
    const p = { ...xmas, dishes: xmas.dishes.map((d) => ({ ...d, off: drop.includes(d.name) })) };
    const t0 = performance.now(); const r = solve(p); const ms = performance.now() - t0;
    console.log(drop, { ok: r.ok, proven: r.proven, nodes: r.nodes, ms: Math.round(ms), cost: r.best?.cost });
    if (r.ok) { console.log(verify(r)); r.best.chosen.forEach((o, i) => console.log(r.active[i].name.padEnd(22), o.steps.map((s) => `${(s.from - r.P.S) * 5}..${(s.to - r.P.S) * 5}${s.oven >= 0 ? '' : ''}`).join(' | '))); console.log(JSON.stringify(r.best.sched[0].map((x) => [(x.from - r.P.S) * 5, (x.to - r.P.S) * 5, x.temp]))); }
  }
}
import { suggestFixes } from '../src/plan.js';
if ((process.argv[1] ?? '').endsWith('xmas.js')) {
  const t0 = performance.now(); const fx = suggestFixes(xmas); console.log('fixes ms', Math.round(performance.now() - t0));
  for (const w of fx) console.log(w.size, JSON.stringify(w.fixes.map((f) => ({ ...f, dish: xmas.dishes[f.di]?.name }))), w.result.best.cost);
}
