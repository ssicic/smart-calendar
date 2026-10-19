// Hard-coded example week, used by the demo script and the app until we
// have a database and an add screen.
import { DAY, type FixedEvent, type WeekInput } from "./engine";

const h = (hours: number) => hours * 60;
const at = (day: number, hour: number) => day * DAY + h(hour);

const work: FixedEvent[] = [0, 1, 2, 3, 4].map((d) => ({
  id: `work${d}`,
  title: "Work",
  start: at(d, 9),
  end: at(d, 17),
}));

export const sampleWeek: WeekInput = {
  fixed: work,
  rest: [{ id: "chill", title: "Chill (protected)", start: at(5, 14), end: at(5, 22) }],
  items: [
    { id: "gym", title: "Gym", durationMin: 60, timesPerWeek: 3, priority: 5, preferredWindows: [{ start: h(17), end: h(20) }] },
    { id: "spanish", title: "Spanish", durationMin: 30, timesPerWeek: 4, priority: 4 },
    { id: "guitar", title: "Guitar", durationMin: 45, timesPerWeek: 3, priority: 3, preferredWindows: [{ start: h(19), end: h(22) }] },
    { id: "walk", title: "Walk", durationMin: 30, timesPerWeek: 5, priority: 2 },
  ],
  placements: [],
  settings: { dayStart: h(8), dayEnd: h(22), bufferMin: 15, minFreeMinutes: h(10) },
};
