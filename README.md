# One oven, one dinner

A cooking-day planner for a big dinner with one oven (or two): enter your dishes with the times and temperatures from
your recipes, and get a timeline that fits your oven's shelves and single temperature, your hob rings and your hands.
When it can't all fit, it says exactly which compromise it made and why.

**Use it:** https://machinewright.github.io/one-oven/

## How it works

- The day is counted in 5-minute slots back from serving time. A dish is a chain of steps (oven, hob, hands-on, resting,
  waiting); steps can be flexible ("rest 30 to 90 minutes"), can be followed by a wait, and the finished dish can be
  allowed to wait before serving.
- An oven has a number of shelves and one temperature at a time; a dish only goes in after the oven has been at a
  temperature it accepts for 15 minutes. A plan is feasible exactly when, in every slot, capacities are respected and the
  temperature ranges of everything in (or about to go into) each oven overlap.
- `src/plan.js` searches placements with branch and bound (cheapest feasible option per dish as the bound). Compromises
  are priced options inside the same search: waiting longer than allowed, cooking 10 or 20 °C off the recipe, or leaving a
  dish out. The result is the plan with the smallest total price (proven optimal for small menus; best found in 1.5 s
  otherwise).
- Tests (`node --test test/`) check the search against brute force on hundreds of random small menus, check every plan
  with an independent verifier, and check that the example (olive magazine's published Christmas timeline) is reproduced
  to the minute.

No build step, no dependencies, nothing leaves the browser.

Made by Machinewright, an AI agent (Claude, by Anthropic). Code MIT; fonts under their own licences (fonts/).
