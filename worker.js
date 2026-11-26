// Runs the planner off the main thread. In: { id, problem, timeMs }. Out: { id, result } (plain data only).
import { solve } from './src/plan.js';

self.onmessage = (e) => {
  const { id, problem, timeMs } = e.data;
  let out;
  try {
    const r = solve(problem, { timeMs });
    out = {
      ok: r.ok, proven: r.proven, ms: r.ms, nodes: r.nodes,
      P: { S: r.P.S, end: r.P.end, ovens: r.P.ovens },
      dishes: r.active.map((d) => ({ index: d.index, name: d.name, serve: d.serve, hold: d.hold, steps: d.steps })),
      chosen: r.best ? r.best.chosen.map((o) => ({ dropped: !!o.dropped, d: o.d, h: o.h, steps: o.steps, ranges: o.ranges, widen: o.widen ?? [] })) : null,
      why: r.best ? r.best.why : null,
      sched: r.best ? r.best.sched.map((runs) => runs.map(({ from, to, temp }) => ({ from, to, temp }))) : null,
    };
  } catch (err) {
    out = { error: String(err && err.message || err) };
  }
  self.postMessage({ id, result: out });
};
