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
  return `You are reading photos of a car-related document (receipt, invoice, quote/estimate, or inspection report) for a personal maintenance tracker. The photos are pages of one document, in order. Today is ${today}.
The owner's cars (name includes the model year; odometerKm is the last reading the owner entered): ${JSON.stringify(cars)}
Open tasks in the tracker: ${JSON.stringify(tasks)}

Reply with only one JSON object in exactly this shape:
{"type":"receipt|quote|inspection|other","carId":"an id from the cars list, or null if unclear","title":"short name, e.g. Oil change and tire rotation at Midas","date":"YYYY-MM-DD or null","shop":"business name or null","km":odometer reading as a number or null,"total":total amount including tax as a number or null,"summary":"one or two plain sentences on what this document says","workDone":[{"title":"short","lineCosts":[each printed amount for this job, as numbers]}],"recommended":[{"title":"short action, e.g. Replace rear brake pads","urgency":"now|soon|later","dueKm":number or null,"dueDate":"YYYY-MM-DD or null","estCost":number or null,"notes":"short, or empty"}],"completes":["ids of open tasks above that this document shows were done"]}

Read every page closely before answering, including small print, headers, footers, stamps and handwriting. Getting these four fields right matters most:

km (odometer): look for labels such as Odometer, Mileage, Mileage In, KM, Kms, KM In/Out, Odo, Odomètre, Kilométrage, Km entrée/sortie, Lecture. With both an in and out reading, use the out reading (or the larger). Read it as a whole number: spaces, commas and periods inside it are thousands separators ("133 450", "133,450" and "133.450" are all 133450). If it is in miles (mi, miles, MI), convert to km (× 1.609) and round. It must be the car's odometer: not a part number, invoice number, phone number, price, or the "next service at" figure. If no reading is printed, infer it only from an unambiguous statement on the document, such as a next-oil-change sticker that also states the interval (next at 143 050 km, every 8 000 km → 135 050 km); otherwise null. A reading far above the car's odometerKm is fine (the owner's figure may be old), but double-check digits when it is lower or wildly higher.

date: the date the work was done or the document was issued (invoice, service, inspection or quote date), not a due date, warranty date, print time or payment due date. Write it as YYYY-MM-DD. Numeric dates on Canadian documents are usually day first (02/10/2026 = 2026-10-02) unless the layout shows otherwise (a month above 12 settles it, and so does a French or English month name: janv., févr., mars, avr., mai, juin, juil., août, sept., oct., nov., déc.). A two-digit year is 20xx. Sanity-check the year: it can't be after today, and it can't be before the car's model year. If a digit is unclear, pick the reading that passes those checks.

title: what was done, plus the shop when known, in plain English and under 60 characters: "Oil change and tire rotation at Midas", "Front brake quote from Canadian Tire", "Pre-winter inspection at Subaru Laval". Name the main work, not the document type or invoice number.

workDone: one entry per job performed and paid for, in plain English ("Synthetic oil and filter change", "Rotate tires", "Replace front brake pads and rotors"). Group a job's parts and labour into one entry, and copy each of its printed line amounts (before tax) into lineCosts exactly as printed; the tracker adds them up, so don't add them yourself. Leave lineCosts empty when no amount is shown. Check your reading: every line amount on the document (jobs, fees and supplies) should add up to the printed subtotal; if it doesn't, look at each amount again, digit by digit. Skip shop supplies, environmental fees, taxes and discounts: they are not jobs. A quote or inspection-only visit has an empty workDone, unless a fee was charged for the inspection itself.

recommended: work suggested but not done: every line of a quote, anything marked failed, worn, red, yellow or needs attention on an inspection, and any "next service due" note (put its km or date in dueKm/dueDate). Leave out a next-service note for work that was just done on this document (in workDone or completes): the tracker already schedules the next one. estCost only when the document prints a price for that exact item; never reuse another line's price.

Other rules: urgency: now = safety issue or marked urgent/red; soon = recommended or yellow; later = monitor. Match the car by make, model, year, VIN or plate when shown. total is the final amount paid or quoted, taxes included. Documents may be in French; write every title and summary in plain English. Use kilometres. Never invent values you can't read or infer as described; use null. If the images are not a car-related document, reply with type "other" and null or empty values.`;
}

/** Adds up a job's line amounts; the model copies them and the code does the arithmetic. */
const sum = (v: unknown) => {
  const ns = (Array.isArray(v) ? v : []).map(num).filter((n): n is number => n != null);
  return ns.length ? Math.round(ns.reduce((a, b) => a + b, 0) * 100) / 100 : null;
};

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
    workDone: arr(o.workDone).slice(0, 20).map((w) => ({ title: str(w?.title, 100) || "Item", cost: sum(w?.lineCosts) ?? num(w?.cost) })),
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
