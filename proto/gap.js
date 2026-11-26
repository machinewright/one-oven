import { solve } from '../src/plan.js';
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
function bigMenu(r, n) {
  const dishes = [];
  for (let i = 0; i < n; i++) {
    const steps = [];
    const ns = 1 + Math.floor(r() * 4);
    for (let k = 0; k < ns; k++) {
      const kind = ['oven', 'oven', 'oven', 'hob', 'prep', 'rest', 'other'][Math.floor(r() * 7)];
      const st = { kind, min: 5 * (2 + Math.floor(r() * 24)), hands: kind === 'hob' && r() < 0.4 };
      if (r() < 0.2) st.max = st.min + 30;
      if (k < ns - 1 && r() < 0.3) st.wait = 30;
      if (kind === 'oven') { st.temp = [160, 180, 190, 200, 220][Math.floor(r() * 5)]; st.shelves = r() < 0.15 ? 2 : 1; }
      steps.push(st);
    }
    dishes.push({ name: 'd' + i, hold: [0, 10, 20, 30, 60][Math.floor(r() * 5)], exact: r() < 0.2, serveAt: r() < 0.1 ? 60 : 0, steps });
  }
  return { startBefore: 480, ovens: r() < 0.3 ? [{ shelves: 3 }, { shelves: 1 }] : [{ shelves: 3 }], rings: Math.floor(r() * 5), cooks: 1 + (r() < 0.3 ? 1 : 0), dishes };
}


const r = rng(99);
for (let k = 0; k < 10; k++) {
  const p = bigMenu(r, 6 + Math.floor(r() * 10));
  const a = solve(p, { timeMs: 1500 }), b = solve(p, { timeMs: 15000 });
  const drops = (x) => x.best.chosen.filter((o) => o.dropped).length;
  console.log(k, p.dishes.length, a.best.cost.toFixed(1), b.best.cost.toFixed(1), b.proven, 'drops', drops(a), drops(b));
}
