import type { ScheduleItem } from "./types";

/** Built-in checks with typical intervals. A car's manufacturer schedule wins where it has one. */
export const SUGGESTIONS: ScheduleItem[] = [
  { key: "oil", title: "Oil and filter change", months: 6, km: 8000, why: "The most important one. Many newer cars allow longer intervals; check your manual." },
  { key: "tirepressure", title: "Check tire pressure", months: 1, why: "Pressure drops about 1 PSI for every 5°C. Check monthly, more often in fall." },
  { key: "fluids", title: "Check fluid levels", months: 1, why: "Engine oil, coolant, washer fluid and brake fluid level. Five minutes with the hood up." },
  { key: "lights", title: "Walk-around: lights, wipers, tires", months: 3, why: "Headlights, brake lights, signals, wiper streaks, tire wear and cracks." },
  { key: "rotate", title: "Rotate tires", km: 10000, why: "Evens out wear. Easy to do at each seasonal tire swap." },
  { key: "winteron", title: "Put winter tires on", anchor: "12-01", months: 12, why: "Required in Quebec from December 1 to March 15. Book early; shops fill up in November." },
  { key: "winteroff", title: "Put summer tires back on", anchor: "04-15", months: 12, why: "Once nights stay above about 7°C. Winter tires wear fast on warm pavement." },
  { key: "battery", title: "Battery test", anchor: "10-31", months: 12, why: "Cold starts kill weak batteries. Most shops test for free before winter." },
  { key: "wash", title: "Spring wash, underbody included", anchor: "04-30", months: 12, why: "Rinses off road salt before it turns into rust." },
  { key: "brakes", title: "Brake inspection", months: 12, km: 20000, why: "Pads, rotors and calipers. Salt and slush are hard on brakes." },
  { key: "wipers", title: "Replace wiper blades", months: 12, why: "Do it in the fall so they are fresh for snow and ice." },
  { key: "cabin", title: "Cabin air filter", months: 12, km: 20000, why: "Keeps the windshield from fogging and the air clean." },
  { key: "airfilter", title: "Engine air filter", months: 24, km: 30000, why: "Cheap and quick. A clogged filter costs fuel." },
  { key: "brakefluid", title: "Brake fluid flush", months: 24, why: "Brake fluid absorbs water over time, which lowers braking performance." },
  { key: "transmission", title: "Transmission fluid", km: 60000, why: "Often skipped, expensive if ignored. Interval varies a lot by car." },
  { key: "coolant", title: "Coolant flush", months: 60, km: 100000, why: "Long-life coolant lasts years, but not forever." },
  { key: "plugs", title: "Spark plugs", km: 100000, why: "Iridium plugs last about 100 000 km. Skip for electric cars." },
];

/** Shown next to a manufacturer schedule: seasonal and quick checks manuals don't cover. */
export const GENERAL = ["tirepressure", "fluids", "lights", "winteron", "winteroff", "battery", "wash", "wipers"];
