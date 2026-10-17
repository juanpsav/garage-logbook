import { num } from "./dates";
import type { DocType, Extraction } from "./types";

export const DOC_TYPES: Record<DocType, string> = {
  receipt: "Receipt",
  quote: "Quote",
  inspection: "Inspection report",
  other: "Document",
};

export type ReadContext = {
  today: string;
  cars: { id: string; name: string; odometerKm: number; model: string | null }[];
  tasks: { id: string; carId: string; title: string }[];
};

export function readPrompt({ today, cars, tasks }: ReadContext) {
  return `You are reading photos of a car-related document (receipt, invoice, quote/estimate, or inspection report) for a personal maintenance tracker. Today is ${today}.
The owner's cars: ${JSON.stringify(cars)}
Open tasks in the tracker: ${JSON.stringify(tasks)}

Reply with only one JSON object in exactly this shape:
{"type":"receipt|quote|inspection|other","carId":"an id from the cars list, or null if unclear","title":"short name, e.g. Oil change at Midas","date":"YYYY-MM-DD or null","shop":"business name or null","km":odometer reading as a number or null,"total":total amount including tax as a number or null,"summary":"one or two plain sentences on what this document says","workDone":[{"title":"short","cost":number or null}],"recommended":[{"title":"short action, e.g. Replace rear brake pads","urgency":"now|soon|later","dueKm":number or null,"dueDate":"YYYY-MM-DD or null","estCost":number or null,"notes":"short, or empty"}],"completes":["ids of open tasks above that this document shows were done"]}

Rules: workDone lists only work actually performed and paid for. recommended lists work suggested but not done: every line of a quote, anything marked failed, worn, red, yellow or needs attention on an inspection, and any "next service due" note (put its km or date in dueKm/dueDate), except a next-service note for work listed in completes: the tracker already reschedules that task. urgency: now = safety issue or marked urgent/red; soon = recommended or yellow; later = monitor. Match the car by make, model, year, VIN or plate when shown. Documents may be in French; write titles in plain English. Use kilometres. Never invent values you can't read; use null. If the images are not a car-related document, reply with type "other" and null or empty values.`;
}

/** Coerce a model reply into a safe Extraction; unknown car and task ids are dropped. */
export function cleanExtraction(x: unknown, carIds: string[], taskIds: string[]): Extraction {
  const str = (v: unknown, n = 160) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
  const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const arr = (v: unknown) => (Array.isArray(v) ? v : []) as Record<string, unknown>[];
  return {
    type: (Object.keys(DOC_TYPES) as DocType[]).includes(o.type as DocType) ? (o.type as DocType) : "other",
    carId: typeof o.carId === "string" && carIds.includes(o.carId) ? o.carId : null,
    title: str(o.title, 120),
    date: date(o.date),
    shop: str(o.shop, 80),
    km: num(o.km),
    total: num(o.total),
    summary: str(o.summary, 400),
    workDone: arr(o.workDone).slice(0, 20).map((w) => ({ title: str(w?.title, 100) || "Item", cost: num(w?.cost) })),
    recommended: arr(o.recommended)
      .slice(0, 15)
      .filter((r) => str(r?.title))
      .map((r) => ({
        title: str(r.title, 100)!,
        urgency: (["now", "soon", "later"] as const).includes(r.urgency as "now") ? (r.urgency as "now" | "soon" | "later") : "soon",
        dueKm: num(r.dueKm),
        dueDate: date(r.dueDate),
        estCost: num(r.estCost),
        notes: str(r.notes, 200) || "",
      })),
    completes: (Array.isArray(o.completes) ? (o.completes as unknown[]) : []).filter(
      (id): id is string => typeof id === "string" && taskIds.includes(id),
    ),
  };
}
