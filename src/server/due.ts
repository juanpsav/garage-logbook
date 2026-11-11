import "server-only";
import { daysBetween } from "@/lib/dates";
import { scheduleFor, status } from "@/lib/logic";
import { listSchedules } from "./schedules";
import { listRecords } from "./garage";

type Notice = { kind: string; car?: string; title: string; detail?: string; ids?: Record<string, string> };

const inWindow = (today: string, from: string, to: string) => {
  const md = today.slice(5);
  return md >= from && md <= to;
};

/**
 * What needs the owner's attention today, plain code, no model: late and upcoming tasks, quotes still
 * waiting on a decision, the owner's open notes, a stale odometer, unfinished visits, and Quebec's
 * winter-tire dates. An agent's scheduled check-in calls this and only speaks up when it's not empty.
 */
export async function whatsDue(userId: string, today: string) {
  const [cars, tasks, visits, items, schedules] = await Promise.all([
    listRecords(userId, "cars"), listRecords(userId, "tasks"), listRecords(userId, "visits"), listRecords(userId, "items"), listSchedules(),
  ]);
  const carName = new Map(cars.map((c) => [c.id, c.name]));
  const visitById = new Map(visits.map((v) => [v.id, v]));
  const attention: Notice[] = [], upcoming: Notice[] = [];

  for (const t of tasks) {
    const c = cars.find((x) => x.id === t.carId);
    const s = status(t, c);
    const n = { kind: "task", car: carName.get(t.carId), title: t.title, detail: s.chips.map(([, x]) => x).join(", "), ids: { taskId: t.id, carId: t.carId } };
    if (s.rank === 0) attention.push(n);
    else if (s.rank === 1) upcoming.push(n);
  }

  for (const i of items) {
    if (i.kind === "quoted" && (i.decision === "pending" || i.decision === "deferred")) {
      const v = i.visitId ? visitById.get(i.visitId) : undefined;
      const age = v?.date ? daysBetween(v.date, today) : null;
      (i.decision === "pending" ? attention : upcoming).push({
        kind: "quote", car: carName.get(i.carId ?? ""), title: i.text,
        detail: [i.cost != null && `$${i.cost.toFixed(2)}`, v?.shop, age != null && `quoted ${age} days ago`, i.decision === "deferred" && "you said later"].filter(Boolean).join(", "),
        ids: { itemId: i.id, ...(i.carId && { carId: i.carId }), ...(v && { visitId: v.id }) },
      });
    }
    if (i.source === "you" && !i.visitId && i.kind === "found") {
      upcoming.push({ kind: "note", car: carName.get(i.carId ?? ""), title: i.text, detail: `noted ${i.created.slice(0, 10)}`, ids: { itemId: i.id, ...(i.carId && { carId: i.carId }) } });
    }
  }

  for (const c of cars) {
    const age = c.kmDate ? daysBetween(c.kmDate, today) : null;
    if (age == null || age > 45) attention.push({ kind: "odometer", car: c.name, title: "Odometer reading is old", detail: age == null ? "never recorded" : `last updated ${age} days ago; km-based tasks may be off`, ids: { carId: c.id } });
  }

  // Manufacturer schedule items nobody is tracking yet: reminders can't fire for them.
  for (const c of cars) {
    const sc = scheduleFor(c, schedules);
    if (!sc) { upcoming.push({ kind: "schedule", car: c.name, title: "No manufacturer schedule yet", detail: "find_schedule, then list_suggestions", ids: { carId: c.id } }); continue; }
    const tracked = new Set(tasks.filter((t) => t.carId === c.id).map((t) => t.sugKey));
    const missing = sc.items.filter((i) => !tracked.has(i.key));
    if (missing.length) upcoming.push({ kind: "schedule", car: c.name, title: `${missing.length} of ${sc.items.length} manufacturer schedule items aren't tracked`, detail: missing.map((i) => i.title).join(", "), ids: { carId: c.id } });
  }

  for (const v of visits) {
    if (v.status !== "confirmed" && daysBetween(v.created.slice(0, 10), today) >= 2) {
      upcoming.push({ kind: "visit", car: carName.get(v.carId ?? ""), title: v.title || "A shop visit", detail: v.status === "draft" ? "pages added but not gone through" : "not saved to history yet", ids: { visitId: v.id, ...(v.carId && { carId: v.carId }) } });
    }
  }

  // Quebec: winter tires are required from December 1 to March 15. Each car needs its own change.
  const tireWork = (carId: string, days: number) => items.some((i) => i.carId === carId && i.kind === "done"
    && /tire|tyre|pneu/i.test(`${i.text} ${i.original ?? ""} ${i.keywords.join(" ")}`)
    && daysBetween((i.visitId && visitById.get(i.visitId)?.date) || i.created.slice(0, 10), today) <= days);
  for (const c of cars) {
    if (inWindow(today, "10-15", "12-01") && !tireWork(c.id, 60)) {
      attention.push({ kind: "season", car: c.name, title: "Winter tires", detail: "Required in Quebec from December 1. No tire change recorded for this car this fall.", ids: { carId: c.id } });
    }
    if (inWindow(today, "03-15", "05-15") && !tireWork(c.id, 45)) {
      upcoming.push({ kind: "season", car: c.name, title: "Summer tires", detail: "Winter tires can come off after March 15; they wear fast once it's warm.", ids: { carId: c.id } });
    }
  }

  return { today, attention, upcoming, quiet: !attention.length && !upcoming.length };
}
