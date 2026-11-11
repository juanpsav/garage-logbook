import "server-only";
import { every, intervalLabel, repeats, scheduleFor, status } from "@/lib/logic";
import { listSchedules } from "../schedules";
import type { Thread } from "../garage";
import { snapshotData } from "./tools";

/** Today's date where the owner lives. */
export const todayLocal = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto" }).format(new Date());

/** Cars, tasks with due status, recent history and open items; with the visit or car a conversation is about. */
export async function garageSnapshot(userId: string, thread: Thread | null, today: string) {
  const [d, schedules] = await Promise.all([snapshotData(userId), listSchedules()]);
  const carById = new Map(d.cars.map((c) => [c.id, c]));
  const visitById = new Map(d.visits.map((v) => [v.id, v]));
  const snap: Record<string, unknown> = {
    today,
    cars: d.cars.map((c) => {
      // The manufacturer schedule, and which of its items aren't tracked as tasks yet (offer to track them).
      const sc = scheduleFor(c, schedules);
      const tracked = new Set(d.tasks.filter((t) => t.carId === c.id).map((t) => t.sugKey));
      return {
        id: c.id, name: c.name, km: c.km, kmDate: c.kmDate,
        schedule: sc ? { name: sc.name, notTracked: sc.items.filter((i) => !tracked.has(i.key)).map((i) => `${i.title} (${intervalLabel(i).toLowerCase()})`) } : null,
      };
    }),
    tasks: d.tasks.map((t) => ({
      id: t.id, carId: t.carId, car: carById.get(t.carId)?.name, title: t.title,
      due: status(t, carById.get(t.carId)).chips.map(([, x]) => x).join(", ") || "no due date",
      ...(repeats(t) && { repeats: every(t) }), ...(t.notes && { notes: t.notes }),
    })),
    history: d.visits
      .filter((v) => v.status === "confirmed")
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .slice(0, 15)
      .map((v) => ({
        id: v.id, date: v.date, carId: v.carId, car: carById.get(v.carId ?? "")?.name, title: v.title, km: v.km, total: v.total, shop: v.shop,
        done: d.items.filter((i) => i.visitId === v.id && i.kind === "done").map((i) => i.text),
      })),
    openItems: d.items
      .filter((i) => i.kind !== "done" && (i.decision === "pending" || i.decision === "deferred" || i.decision == null) && !(thread && "visitId" in thread && i.visitId === thread.visitId))
      .slice(-25)
      .map((i) => ({
        id: i.id, carId: i.carId, car: carById.get(i.carId ?? "")?.name, kind: i.kind, from: i.source === "you" ? "owner" : visitById.get(i.visitId ?? "")?.title ?? "shop",
        date: (i.visitId && visitById.get(i.visitId)?.date) || i.created.slice(0, 10), text: i.text,
        ...(i.cost != null && { cost: i.cost }), ...(i.note && { note: i.note }), ...(i.decision && { decision: i.decision }),
      })),
  };
  if (thread && "visitId" in thread) {
    const v = visitById.get(thread.visitId);
    if (v) snap.thisVisit = {
      ...v,
      items: d.items.filter((i) => i.visitId === v.id).map((i) => ({
        id: i.id, kind: i.kind, text: i.text, original: i.original, cost: i.cost, page: i.page, unsure: i.unsure, note: i.note, decision: i.decision,
      })),
    };
  } else if (thread) {
    snap.thisCar = thread.carId;
  }
  return snap;
}
