import { addMonths, daysBetween, fmtDate, fmtKm, nextAnchor, today, uid, now } from "./dates";
import { SUGGESTIONS } from "./suggestions";
import type { Car, Schedule, ScheduleItem, Task } from "./types";

export type ChipKind = "late" | "soon" | "ok";
export type Status = { rank: 0 | 1 | 2 | 3; chips: [ChipKind, string][]; key: number; cls: ChipKind | "" };

/** rank: 0 late, 1 soon (30 days or 1000 km), 2 later, 3 no due date. `key` sorts within a rank. */
export function status(t: Task, car: Car | undefined): Status {
  const km = car?.km ?? 0, T = today();
  let late = false, soon = false, key = 1e9;
  const chips: [ChipKind, string][] = [];
  if (t.dueDate) {
    const d = daysBetween(T, t.dueDate);
    key = Math.min(key, d);
    if (d < 0) { late = true; chips.push(["late", `${-d} day${d === -1 ? "" : "s"} late`]); }
    else if (d === 0) { late = true; chips.push(["late", "due today"]); }
    else {
      if (d <= 30) soon = true;
      chips.push([d <= 30 ? "soon" : "ok", `${fmtDate(t.dueDate)} · in ${d} day${d === 1 ? "" : "s"}`]);
    }
  }
  if (t.dueKm != null) {
    const left = t.dueKm - km;
    key = Math.min(key, left / 40);
    if (left <= 0) { late = true; chips.push(["late", left === 0 ? `due now (${fmtKm(t.dueKm)})` : `${fmtKm(-left)} overdue`]); }
    else {
      if (left <= 1000) soon = true;
      chips.push([left <= 1000 ? "soon" : "ok", `at ${fmtKm(t.dueKm)} · ${fmtKm(left)} to go`]);
    }
  }
  const rank = late ? 0 : soon ? 1 : chips.length ? 2 : 3;
  return { rank, chips, key, cls: (["late", "soon", "ok", ""] as const)[rank] };
}

export const repeats = (t: Pick<Task, "everyMonths" | "everyKm" | "anchor">) => !!(t.everyMonths || t.everyKm || t.anchor);

export function every(t: Pick<Task, "everyMonths" | "everyKm" | "anchor">) {
  if (t.anchor) return "Every year";
  const p: string[] = [];
  const m = t.everyMonths;
  if (m) p.push(m === 1 ? "every month" : m % 12 === 0 ? `every ${m / 12 === 1 ? "year" : m / 12 + " years"}` : `every ${m} months`);
  if (t.everyKm) p.push(`every ${fmtKm(t.everyKm)}`);
  const s = p.join(" or ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * The task after it was done on `date` at `km`: a repeating task gets its next due date and km,
 * a one-off returns null (remove it).
 */
export function nextAfterDone(t: Task, date: string, km: number | null, car: Car | undefined): Task | null {
  if (!repeats(t)) return null;
  const n = { ...t };
  if (t.anchor) {
    let nd = t.dueDate || nextAnchor(t.anchor, date);
    // Done early (say Nov 20 for a Dec 1 anchor) still counts for this year.
    while (daysBetween(date, nd) < 180) nd = addMonths(nd, 12);
    n.dueDate = nd;
  } else {
    n.dueDate = t.everyMonths ? addMonths(date, t.everyMonths) : null;
    n.dueKm = t.everyKm ? (km ?? car?.km ?? 0) + t.everyKm : null;
  }
  return n;
}

export const scheduleFor = (car: Car | undefined, schedules: Schedule[]) =>
  car?.scheduleId ? schedules.find((s) => s.id === car.scheduleId) ?? null : null;

const words = (s: string) => new Set(s.toLowerCase().replace(/-/g, "").split(/[^a-z0-9.]+/).map((w) => w.replace(/^\.+|\.+$/g, "")).filter(Boolean));

/**
 * Finds a saved schedule for a car name typed by the owner: same model year, and every word they typed
 * appears in the schedule's name ("2015 Forester" matches "2015 Subaru Forester 2.5i"). Prefers the closest name.
 */
export function matchSchedule(name: string, schedules: Schedule[]): Schedule | undefined {
  const want = words(name);
  if (![...want].some((w) => /^(19|20)\d\d$/.test(w))) return undefined;
  return schedules
    .map((s) => ({ s, have: words(s.name) }))
    .filter(({ have }) => [...want].every((w) => have.has(w)))
    .sort((a, b) => a.have.size - b.have.size)[0]?.s;
}

export function findSuggestion(key: string, car: Car | undefined, schedules: Schedule[]): ScheduleItem | undefined {
  return scheduleFor(car, schedules)?.items.find((x) => x.key === key) ?? SUGGESTIONS.find((x) => x.key === key);
}

export type LastDone = { date?: string | null; km?: number | null; never?: boolean };

/** A new task from a suggestion, due based on when it was last done (or due now if unknown). */
export function taskFromSuggestion(s: ScheduleItem, car: Car, sched: Schedule | null, last: LastDone): Task {
  const T = today();
  const t: Task = {
    id: uid(), carId: car.id, title: s.title, sugKey: s.key, notes: s.why || "", created: now(),
    everyMonths: s.months ?? null, everyKm: s.km ?? null, anchor: s.anchor ?? null, dueDate: null, dueKm: null,
  };
  if (s.anchor) t.dueDate = nextAnchor(s.anchor, T);
  else if (last.never && sched?.modelYear) {
    if (s.months) t.dueDate = addMonths(`${sched.modelYear}-01-01`, s.firstMonths || s.months);
    if (s.km) t.dueKm = s.firstKm || s.km;
  } else {
    if (s.months) t.dueDate = last.date ? addMonths(last.date, s.months) : T;
    if (s.km) t.dueKm = last.km != null ? last.km + s.km : car.km ?? 0;
  }
  return t;
}

export function intervalLabel(s: ScheduleItem) {
  let int = s.anchor
    ? `Every year by ${new Date(nextAnchor(s.anchor, today()) + "T12:00").toLocaleDateString("en-CA", { month: "long", day: "numeric" })}`
    : every({ everyMonths: s.months, everyKm: s.km });
  if (s.firstMonths || s.firstKm) {
    const first = [s.firstMonths ? `${s.firstMonths / 12} years` : "", s.firstKm ? fmtKm(s.firstKm) : ""].filter(Boolean).join(" or ");
    int = `First at ${first}, then ${int.toLowerCase()}`;
  }
  return int;
}
