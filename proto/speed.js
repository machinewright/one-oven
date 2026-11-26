import { solve, verify } from '../src/plan.js';
import { xmas } from './xmas.js';
for (const nl of [2000, 20000, 200000]) {
  const t0 = performance.now(); const r = solve(xmas, { nodeLimit: nl });
  console.log(nl, Math.round(performance.now() - t0) + 'ms', r.ok, r.best && r.best.cost, r.proven, r.nodes);
  if (nl === 200000) { console.log(verify(r)); r.best.chosen.forEach((o, i) => console.log(r.active[i].name.padEnd(22), o.dropped ? 'DROPPED' : o.steps.map((s) => `${(s.from - r.P.S) * 5}..${(s.to - r.P.S) * 5}`).join(' | '), 'h', o.h, 'widen', JSON.stringify(o.widen))); console.log(JSON.stringify(r.best.sched[0].map((x) => [(x.from - r.P.S) * 5, (x.to - r.P.S) * 5, x.temp]))); }
}
