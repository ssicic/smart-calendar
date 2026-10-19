// Prints the sample planned week to the terminal: `npm run demo`.
import { checkNewItem, planWeek } from "./engine";
import { sampleWeek } from "./sampleWeek";
import { DAY_NAMES, clock, rowsByDay } from "./ui/weekRows";

const plan = planWeek(sampleWeek);

rowsByDay(sampleWeek, plan).forEach((rows, d) => {
  console.log(`\n${DAY_NAMES[d]}`);
  for (const r of rows) console.log(`  ${clock(r.start)}-${clock(r.end)}  ${r.title.padEnd(18)} ${r.kind}`);
});

const { capacity, unplaced } = plan;
console.log(`\nCapacity: ${capacity.freeMinutes} free min, ${capacity.requiredMinutes} needed, budget ${capacity.budgetMinutes}, fits: ${capacity.fits}`);
if (unplaced.length) console.log("Unplaced:", unplaced);

const check = checkNewItem(sampleWeek, { id: "course", title: "Online course", durationMin: 120, timesPerWeek: 5, priority: 3 });
console.log(
  `\nTrying to add "Online course 2h x5": ${check.fits ? "fits" : `over by ${check.overflowMinutes} min, could swap: ${check.swapCandidates.map((i) => i.title).join(", ")}`}`,
);
