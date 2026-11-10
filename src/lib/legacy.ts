import type { Car, Data, FileRec, Item, Task, Visit } from "./types";

/** Records as the app stored them before visits (cars, tasks, log, docs). */
type OldLog = { id: string; carId: string; title: string; date: string; km: number | null; cost: number | null; note: string; docId?: string; created: string };
type OldFile = { id: string; type: string; orig?: { id: string; type: string; name?: string } };
type OldDoc = {
  id: string; created: string; files: OldFile[]; thumb: string | null; carId: string | null;
  status: "draft" | "reading" | "review" | "saved";
  ex: {
    type?: string; title?: string | null; date?: string | null; shop?: string | null; km?: number | null; total?: number | null; summary?: string | null;
    workDone?: { title: string; cost: number | null }[];
    recommended?: { title: string; urgency: string; estCost: number | null; notes: string }[];
  };
  type?: string; title?: string; date?: string; shop?: string | null; km?: number | null; total?: number | null; summary?: string | null;
  logId?: string | null;
};
type OldTask = Task & { docId?: string };
export type LegacyData = { cars?: Car[]; tasks?: OldTask[]; log?: OldLog[]; docs?: OldDoc[] };

export const isLegacy = (raw: unknown) => !!raw && typeof raw === "object" && ("log" in raw || "docs" in raw);

const item = (p: Partial<Item> & Pick<Item, "id" | "kind" | "text" | "created">): Item => ({
  carId: null, visitId: null, source: "shop", original: null, cost: null, page: null, unsure: false, keywords: [], note: null, decision: null, ...p,
});

/**
 * Turns old records into visits, items and files. A document becomes a visit; its history entry
 * becomes the visit's done work. A history entry without a document becomes a visit of its own.
 */
export function fromLegacy(raw: LegacyData): Data {
  const cars = raw.cars ?? [];
  const carIds = new Set(cars.map((c) => c.id));
  const car = (id: string | null | undefined) => (id && carIds.has(id) ? id : null);
  const visits: Visit[] = [], items: Item[] = [], files: FileRec[] = [];
  const logs = raw.log ?? [];
  const logById = new Map(logs.map((l) => [l.id, l]));
  const used = new Set<string>();

  for (const d of raw.docs ?? []) {
    const ex = d.ex ?? {};
    const log = (d.logId && logById.get(d.logId)) || logs.find((l) => l.docId === d.id);
    if (log) used.add(log.id);
    const carId = car(d.carId ?? log?.carId);
    const v: Visit = {
      id: d.id, carId, created: d.created,
      title: d.title || ex.title || log?.title || "",
      date: d.date || ex.date || log?.date || null,
      km: d.km ?? ex.km ?? log?.km ?? null,
      shop: d.shop ?? ex.shop ?? null,
      total: d.total ?? ex.total ?? log?.cost ?? null,
      summary: d.summary ?? ex.summary ?? null,
      status: d.status === "saved" ? "confirmed" : d.status === "draft" ? "draft" : "open",
    };
    visits.push(v);
    const work = ex.workDone ?? [];
    work.forEach((w, i) => items.push(item({ id: `${d.id}-w${i}`, carId, visitId: d.id, kind: "done", text: w.title, cost: w.cost ?? null, created: d.created })));
    if (!work.length && log) items.push(item({ id: log.id, carId, visitId: d.id, kind: "done", text: log.title, cost: log.cost, note: log.note || null, created: log.created }));
    (ex.recommended ?? []).forEach((r, i) => items.push(item({
      id: `${d.id}-r${i}`, carId, visitId: d.id, kind: r.estCost != null || (d.type || ex.type) === "quote" ? "quoted" : "found",
      text: r.title, cost: r.estCost ?? null, note: r.notes || null, decision: d.status === "saved" ? null : "pending", created: d.created,
    })));
    d.files.forEach((f, i) => files.push({
      id: `${d.id}-p${i}`, visitId: d.id, itemId: null, position: i, type: f.orig?.type ?? f.type, name: f.orig?.name ?? null,
      orig: f.orig?.id ?? f.id,
      // Photos show their JPEG copy; a PDF shows the small first-page image made when it was added.
      view: f.type === "application/pdf" ? (i === 0 ? d.thumb : null) : f.id,
      created: d.created,
    }));
  }

  for (const l of logs) {
    if (used.has(l.id)) continue;
    const carId = car(l.carId);
    visits.push({ id: l.id, carId, title: l.title, date: l.date || null, km: l.km, shop: null, total: l.cost, summary: null, status: "confirmed", created: l.created });
    items.push(item({ id: `${l.id}-w0`, carId, visitId: l.id, source: "you", kind: "done", text: l.title, cost: l.cost, note: l.note || null, created: l.created }));
  }

  const visitIds = new Set(visits.map((v) => v.id));
  const tasks: Task[] = (raw.tasks ?? []).filter((t) => carIds.has(t.carId)).map(({ docId, ...t }) => ({
    ...t, visitId: docId && visitIds.has(docId) ? docId : t.visitId ?? null,
  }));
  return { cars, tasks, visits, items, files };
}
