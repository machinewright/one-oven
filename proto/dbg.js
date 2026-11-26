import { solve } from '../src/plan.js';
import { xmas } from './xmas.js';
const names = xmas.dishes.map((d) => d.name);
for (const drop of [['Yorkshire puddings', 'Stuffing'], ['Yorkshire puddings', 'Pigs in blankets'], ['Yorkshire puddings','Stuffing','Pigs in blankets'], names.filter(n=>n!=='Turkey'), names.filter(n=>!['Turkey','Roast potatoes'].includes(n))]) {
  const p = { ...xmas, dishes: xmas.dishes.map((d) => ({ ...d, off: drop.includes(d.name) })) };
  const r = solve(p); console.log(drop.join(','), r.ok, r.nodes, r.emptyDishes);
}
