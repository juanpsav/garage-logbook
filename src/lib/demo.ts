import { addDays } from "./dates";
import type { Data } from "./types";

/** A sample garage for visitors who aren't signed in. Dates are relative to today so it never looks stale. */
export function demoData(today: string): Data {
  const d = (days: number) => addDays(today, days);
  const t = (days: number) => `${d(days)}T12:00:00.000Z`;
  const car = "demo-car", visit = "demo-visit", oil = "demo-oil", wipers = "demo-wipers";
  const line = (id: string, visitId: string | null, kind: "done" | "found" | "quoted", text: string, cost: number | null, more: Partial<Data["items"][number]> = {}) => ({
    id, carId: car, visitId, source: "shop" as const, kind, text, original: null, cost, page: 1, unsure: false, keywords: [], note: null,
    decision: kind === "quoted" ? ("pending" as const) : null, created: t(-2), ...more,
  });
  return {
    cars: [{ id: car, name: "2019 Subaru Forester", km: 139412, kmDate: d(-2), scheduleId: "subaru-forester-2019", created: t(-200) }],
    // Tracked from the manufacturer schedule (sugKey), plus one task from a shop visit. Some schedule items are left untracked on purpose.
    tasks: [
      { id: "demo-t1", carId: car, title: "Oil and filter change", sugKey: "m-oil", notes: "Synthetic 0W-20.", created: t(-200), everyMonths: 6, everyKm: 9600, anchor: null, dueDate: d(-1), dueKm: 141400 },
      { id: "demo-t5", carId: car, title: "Rotate and inspect tires", sugKey: "m-rotate", notes: "", created: t(-200), everyMonths: 6, everyKm: 9600, anchor: null, dueDate: d(150), dueKm: 149000 },
      { id: "demo-t2", carId: car, title: "Rear brakes: pads, discs, caliper service", visitId: visit, created: t(-2), everyMonths: null, everyKm: null, anchor: null, dueDate: d(21), dueKm: null,
        notes: "Rear pads were 3 mm at the last visit, rear discs rusty. Quoted $612.40 plus tax. Check pad thickness through the wheel spokes; replace near 2 mm or if it grinds." },
      { id: "demo-t3", carId: car, title: "Cabin air filter", sugKey: "m-cabin", notes: "", created: t(-200), everyMonths: 12, everyKm: 19200, anchor: null, dueDate: d(95), dueKm: 150000 },
      { id: "demo-t4", carId: car, title: "Brake fluid replacement", sugKey: "m-brakefluid", notes: "", created: t(-200), everyMonths: 30, everyKm: 48000, anchor: null, dueDate: d(180), dueKm: 168000 },
    ],
    visits: [
      { id: visit, carId: car, title: "Winter tire changeover and inspection", date: d(-2), km: 139412, shop: "Garage Exemple Inc.", total: 107.43, status: "confirmed", created: t(-2),
        summary: "Winter tires mounted and balanced, 32-point inspection and washer fluid. The shop found rear pads at 3 mm with rusty rear discs and a light oil seep at the left valve cover gasket, and quoted five jobs." },
      { id: oil, carId: car, title: "Oil and filter change", date: d(-183), km: 131800, shop: "Garage Exemple Inc.", total: 96.5, summary: null, status: "confirmed", created: t(-183) },
      { id: wipers, carId: car, title: "Replaced wiper blades", date: d(-40), km: 137900, shop: null, total: 45, summary: null, status: "confirmed", created: t(-40) },
    ],
    items: [
      line("demo-i1", visit, "done", "Swapped to winter tires (mounted on rims) and balanced all 4 wheels", 79.95, { original: "CHG-SAIS CHANGEMENT PNEUS SAISONNIER MONTÉS JANTES / BAL-4" }),
      line("demo-i2", visit, "done", "32-point inspection", 0, { original: "INSP-32 INSPECTION 32 PTS" }),
      line("demo-i3", visit, "done", "Washer fluid -40, 4 L", 8.99, { original: "LAV-PB LAVE-GLACE -40 4L" }),
      line("demo-i3b", visit, "done", "Shop environmental and supplies fee", 4.5, { original: "ENV FRAIS ENVIRO / SHOP SUPP" }),
      line("demo-i4", visit, "found", "Brake pads: front 6 mm, rear 3 mm (rear low). Rear discs rusty.", null, { original: "pl. av 6mm / arr 3mm !! dsq arr rouillés - voir soum." }),
      line("demo-i5", visit, "found", "Light oil seep at the left valve cover gasket; keep an eye on it", null, { original: "fuite huile légère joint cache-soupape côté G. - surveiller", note: "The counter said it's tiny." }),
      line("demo-i6", visit, "quoted", "Rear brakes: ceramic pads, 2 discs and caliper service", 612.4, { page: 2, original: "FREINS ARR: PLAQ. CÉRAM + DISQUES (2) + SERV. ÉTRIERS", decision: "deferred", note: "Needed soon: 3 mm is low. Book within a few weeks." }),
      line("demo-i7", visit, "quoted", "Fuel injector cleaning and fuel treatment", 149.95, { page: 2, original: "NETT. INJECTEURS + TRAIT. ESSENCE", decision: "declined", note: "Likely an upsell without a symptom." }),
      line("demo-i8", visit, "quoted", "Replace both front stabilizer links", 274.5, { page: 2, original: "LIENS STAB. AV (2)", decision: "declined", note: "No clunk over bumps; skip for now." }),
      line("demo-i9", oil, "done", "Synthetic oil and filter change", 96.5),
      line("demo-i10", wipers, "done", "Replaced wiper blades", 45, { source: "you" }),
      line("demo-i11", null, "found", "Squeal from the rear when braking", null, { source: "you", note: "Started yesterday. Probably the 3 mm rear pads." , created: t(-1) }),
    ],
    files: [
      { id: "demo-p1", visitId: visit, itemId: null, position: 0, type: "image/jpeg", name: "Invoice", orig: "demo/p1.jpg", view: "demo/p1.jpg", created: t(-2) },
      { id: "demo-p2", visitId: visit, itemId: null, position: 1, type: "image/jpeg", name: "Quote", orig: "demo/p2.jpg", view: "demo/p2.jpg", created: t(-2) },
    ],
  };
}
