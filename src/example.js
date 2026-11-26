// Example menu: olive magazine's "Christmas day timeline" (5 kg turkey for 8-10, lunch at 3pm), read 2026-11-26:
// https://olivemagazine.com/guides/how-to/foolproof-christmas-dinner-time-planner-plus-print-out
// Clock times from the page: turkey out of the fridge 9.30; oven 220C, turkey in (foil on) 10.30; down to 200C 11.00;
// foil off 12.30; turkey out 13.30; fat tray in 13.15; potatoes, carrots and parsnips in 13.30; pigs in blankets in
// and sprouts fried 14.00; carve and heat the gravy 14.30; serve 15.00. Potatoes and sprouts were par-boiled the day
// before. Durations not on the page are marked `guess: true` (frying sprouts, making and reheating gravy), and the
// turkey's two shelves are my assumption.
export const EXAMPLE = {
  serve: '15:00', from: '09:00', unit: 'C', ovens: [{ shelves: 3 }], rings: 4, cooks: 1,
  source: { name: 'olive magazine', url: 'https://olivemagazine.com/guides/how-to/foolproof-christmas-dinner-time-planner-plus-print-out' },
  dishes: [
    { name: 'Turkey (5 kg)', hold: 0, steps: [
      { kind: 'other', min: 60, label: 'out of the fridge to warm up' },
      { kind: 'oven', min: 30, temp: 220, shelves: 2, label: 'covered with foil' },
      { kind: 'oven', min: 90, temp: 200, shelves: 2, label: 'still covered' },
      { kind: 'oven', min: 60, temp: 200, shelves: 2, label: 'foil off' },
      { kind: 'rest', min: 60, label: 'rest, loosely covered with foil' },
      { kind: 'prep', min: 30, label: 'carve' },
    ] },
    { name: 'Roast potatoes', hold: 0, steps: [
      { kind: 'oven', min: 15, temp: 200, label: 'heat the fat in the tray' },
      { kind: 'oven', min: 90, temp: 200, label: 'par-boiled potatoes into the hot fat' },
    ] },
    { name: 'Carrots and parsnips', hold: 0, steps: [{ kind: 'oven', min: 90, temp: 200 }] },
    { name: 'Pigs in blankets', hold: 0, steps: [{ kind: 'oven', min: 60, temp: 200 }] },
    { name: 'Sprouts', hold: 60, steps: [{ kind: 'hob', min: 10, hands: true, label: 'fry the par-boiled sprouts', guess: true }] },
    { name: 'Gravy', hold: 0, steps: [
      { kind: 'hob', min: 15, hands: true, label: 'make the gravy', wait: 60, guess: true },
      { kind: 'hob', min: 10, label: 'heat until piping hot', guess: true },
    ] },
  ],
};

// "Matters most": its compromises cost 4x. At 4x, 20 degC off on that dish (15 x 4) costs the same as leaving another
// dish out (60); 3 was too weak on the Christmas proto menu (Yorkshires still got 10 degC off while four other dishes
// shared compromises), 4 and 5 gave the same plans there.
export const TOP_WEIGHT = 4;

// UI menu (times as clock strings) -> solver problem (minutes before serving).
export function toProblem(m) {
  const toMin = (s) => { const [h, mm] = s.split(':').map(Number); return h * 60 + mm; };
  let before = toMin(m.serve) - toMin(m.from);
  if (before <= 0) before += 24 * 60;
  return {
    startBefore: before, ovens: m.ovens, rings: m.rings, cooks: m.cooks,
    dishes: m.dishes.map((d) => {
      let serveAt = d.serveAt ?? 0, hold = d.hold ?? 0, holdWeight = 1;
      if (d.readyBy) { // made ahead: ready by this clock time, done any time before (it keeps)
        serveAt = toMin(d.readyBy) - toMin(m.serve);
        if (serveAt > 0) serveAt -= 24 * 60;
        hold = Math.max(0, before + serveAt);
        holdWeight = 0.02;
      }
      return { name: d.name, hold, holdWeight, serveAt, exact: !!d.exact, off: !!d.off, weight: d.top ? TOP_WEIGHT : 1, steps: d.steps.map((s) => ({ ...s })) };
    }),
  };
}
