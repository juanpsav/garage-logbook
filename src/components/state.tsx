"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import seedSchedules from "@/data/schedules.json";
import { addDays, fmtDate, fmtKm, now, num, today, uid } from "@/lib/dates";
import { cleanExtraction, DOC_TYPES } from "@/lib/extraction";
import { acceptable, isPdf, MAX_FILES, MAX_PDF_PAGES, pdfToImages, READ_EDGE, shrink } from "@/lib/files";
import { findSuggestion, nextAfterDone, scheduleFor, taskFromSuggestion, type LastDone } from "@/lib/logic";
import { readDocument, ReadError } from "@/lib/read-client";
import { turnstileToken } from "@/lib/turnstile";
import { emptyData, StoreError, type Store } from "@/lib/store";
import type { Car, CollectionName, Collections, Data, Doc, DocType, Schedule, Task } from "@/lib/types";

export type View = "todo" | "suggested" | "docs" | "cars";
/** Value of the schedule picker that means "look it up for me". */
export const FIND = "__find";
export type Lookup = { state: "finding" } | { state: "failed"; msg: string };
export type Open = { id: string; kind: string; confirm?: boolean } | null;

export type DocForm = {
  type: DocType; carId: string; title: string; date: string; shop: string; km: string; total: string;
  addLog: boolean; done: Record<string, boolean>;
  recs: Record<number, { on: boolean; title: string; urgency: "now" | "soon" | "later" }>;
};

function useGarageState(store: Store, owner: { id: string; email: string } | null) {
  const [data, setData] = useState<Data>(emptyData);
  const [loaded, setLoaded] = useState(false);
  const [schedules, setSchedules] = useState<Schedule[]>(seedSchedules as Schedule[]);
  const [car, setCarState] = useState<string>("all");
  const [view, setViewState] = useState<View>("todo");
  const [open, setOpen] = useState<Open>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [reading, setReading] = useState<Set<string>>(new Set());
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [lookups, setLookups] = useState<Record<string, Lookup>>({});
  const readers = useRef(new Map<string, AbortController>());
  // Latest data for async actions that run across several writes.
  const dataRef = useRef(data);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 2600);
  }, []);

  useEffect(() => {
    let live = true;
    store.load().then(
      (d) => { if (live) { dataRef.current = d; setData(d); setLoaded(true); } },
      () => { if (live) { setLoaded(true); toast("Couldn't load your garage. Reload the page."); } },
    );
    fetch("/api/schedules")
      .then((r) => (r.ok ? r.json() : null))
      .then((list: Schedule[] | null) => { if (live && Array.isArray(list) && list.length) setSchedules(list); })
      .catch(() => {});
    return () => { live = false; };
  }, [store, toast]);

  const apply = (fn: (d: Data) => Data) => {
    dataRef.current = fn(dataRef.current);
    setData(dataRef.current);
  };

  const put = async <K extends CollectionName>(col: K, obj: Collections[K]) => {
    apply((d) => {
      const list = d[col] as Collections[K][];
      const i = list.findIndex((x) => x.id === obj.id);
      return { ...d, [col]: i >= 0 ? list.map((x, j) => (j === i ? obj : x)) : [...list, obj] };
    });
    try {
      await store.put(col, obj);
    } catch (e) {
      toast(e instanceof StoreError && e.code === "quota" ? "Storage is full. Delete some old documents." : "Couldn't save. Check your connection and try again.");
    }
  };

  const del = async (col: CollectionName, id: string) => {
    apply((d) => ({ ...d, [col]: (d[col] as { id: string }[]).filter((x) => x.id !== id) }));
    try {
      await store.del(col, id);
    } catch {
      toast("Couldn't delete. Try again.");
    }
  };

  const carById = (id: string | null | undefined) => dataRef.current.cars.find((c) => c.id === id);
  const cars = useMemo(() => [...data.cars].sort((a, b) => (a.created || "").localeCompare(b.created || "")), [data.cars]);

  const setView = (v: View) => { setViewState(v); setOpen(null); setAdding(false); };
  const setCar = (v: string) => { setCarState(v); setOpen(null); setAdding(false); };
  const close = () => { setOpen(null); setAdding(false); };

  /* ---------- cars ---------- */
  /** scheduleId may be FIND: the car is added right away and its schedule is looked up in the background. */
  const addCar = async (name: string, km: number, scheduleId: string | null) => {
    const find = scheduleId === FIND;
    const c: Car = { id: uid(), name, km, kmDate: today(), scheduleId: find ? null : scheduleId, created: now() };
    await put("cars", c);
    // Next step is choosing what to track, which is the Suggested list.
    setView("suggested");
    setCarState(c.id);
    toast(`${c.name} added`);
    if (find) findForCar(c.id);
  };
  const editCar = async (c: Car, name: string, km: number | null, scheduleId: string | null) => {
    const find = scheduleId === FIND;
    await put("cars", { ...c, name, km: km ?? c.km, kmDate: km != null && km !== c.km ? today() : c.kmDate, scheduleId: find ? c.scheduleId : scheduleId });
    toast("Saved");
    if (find) findForCar(c.id);
  };
  const setOdometer = async (c: Car, km: number) => {
    if (km === c.km) return;
    await put("cars", { ...c, km, kmDate: today() });
    toast(`${c.name}: ${fmtKm(km)}`);
  };
  const bumpOdometer = async (c: Car, km: number | null, date: string) => {
    if (km != null && km > (c.km ?? 0)) await put("cars", { ...c, km, kmDate: date > (c.kmDate || "") ? date : c.kmDate });
  };
  const deleteCar = async (id: string) => {
    setOpen(null);
    for (const t of dataRef.current.tasks.filter((t) => t.carId === id)) await del("tasks", t.id);
    await del("cars", id);
    setView("todo");
    toast("Car deleted");
  };

  /* ---------- tasks ---------- */
  const completeTask = async (t: Task, date: string, km: number | null) => {
    const n = nextAfterDone(t, date, km, carById(t.carId));
    if (n) await put("tasks", n);
    else await del("tasks", t.id);
    return n;
  };
  const markDone = async (t: Task, f: { date: string; km: number | null; cost: number | null; note: string }) => {
    const c = carById(t.carId);
    await put("log", { id: uid(), carId: t.carId, title: t.title, date: f.date, km: f.km, cost: f.cost, note: f.note, created: now() });
    if (c) await bumpOdometer(c, f.km, f.date);
    const n = await completeTask(t, f.date, f.km);
    setOpen(null);
    toast(n
      ? `Done. Next one ${n.dueDate ? fmtDate(n.dueDate) : ""}${n.dueDate && n.dueKm != null ? " or " : ""}${n.dueKm != null ? "at " + fmtKm(n.dueKm) : ""}`
      : "Done and logged");
  };
  const saveTasks = async (list: Task[], isEdit: boolean) => {
    for (const t of list) await put("tasks", t);
    setAdding(false);
    setOpen(null);
    toast(isEdit ? "Saved" : "Task added");
  };
  const deleteTask = async (id: string) => { setOpen(null); await del("tasks", id); toast("Task deleted"); };
  const addSuggestion = async (key: string, carId: string, last: LastDone) => {
    const c = carById(carId);
    const s = findSuggestion(key, c, schedules);
    if (!c || !s) return;
    setOpen(null);
    await put("tasks", taskFromSuggestion(s, c, scheduleFor(c, schedules), last));
    toast(`Added to ${c.name}`);
  };

  /* ---------- done work (history) ---------- */
  const addLog = async (e: Omit<Collections["log"], "id" | "created">) => {
    await put("log", { ...e, id: uid(), created: now() });
    setOpen(null);
    toast("Saved to history");
  };
  const deleteLog = async (id: string) => { setOpen(null); await del("log", id); toast("Entry deleted"); };

  /* ---------- documents ---------- */
  const stopReading = (id: string) => {
    readers.current.delete(id);
    setReading((s) => { const n = new Set(s); n.delete(id); return n; });
  };

  const readDoc = async (id: string, pages: Blob[]) => {
    const ctl = readers.current.get(id) ?? new AbortController();
    readers.current.set(id, ctl);
    setReading((s) => new Set(s).add(id));
    const d = dataRef.current;
    const ctx = {
      today: today(),
      cars: d.cars.map((c) => ({ id: c.id, name: c.name, odometerKm: c.km, model: scheduleFor(c, schedules)?.name ?? null })),
      tasks: d.tasks.map((t) => ({ id: t.id, carId: t.carId, title: t.title })),
    };
    let ex: unknown = null, err: string | null = null;
    try {
      ex = await readDocument(pages, ctx, ctl.signal);
    } catch (e) {
      err = ctl.signal.aborted ? "Reading stopped. Fill in the details yourself, or tap Read again."
        : e instanceof ReadError ? e.message
        : "The reader couldn't finish. Try Read again, or fill in the details yourself.";
    }
    stopReading(id);
    const cur = dataRef.current.docs.find((x) => x.id === id);
    if (!cur) return;
    const c = ex ? cleanExtraction(ex, dataRef.current.cars.map((x) => x.id), dataRef.current.tasks.map((x) => x.id)) : cur.ex;
    await put("docs", { ...cur, status: "review", ex: c, carId: cur.carId || c.carId || null, readError: err });
  };

  const handleFiles = async (list: File[]) => {
    const files = list.filter(acceptable).slice(0, MAX_FILES);
    if (!files.length) return;
    setViewState("docs");
    setAdding(false);
    setBusy(files.length > 1 ? `Saving ${files.length} files…` : "Saving…");
    const stored: Doc["files"] = [], pages: Blob[] = [];
    let thumb: string | null = null;
    try {
      for (const f of files) {
        if (isPdf(f)) {
          stored.push({ id: await store.putFile(f, "application/pdf"), type: "application/pdf" });
          try {
            const imgs = await pdfToImages(f, MAX_PDF_PAGES);
            pages.push(...imgs);
            if (!thumb && imgs[0]) thumb = await store.putFile(await shrink(imgs[0], 400), "image/jpeg");
          } catch { /* stored, just not readable */ }
        } else {
          let b: Blob;
          try { b = await shrink(f, 2000); } catch { throw new StoreError("decode", "decode"); }
          const id = await store.putFile(b, "image/jpeg");
          stored.push({ id, type: "image/jpeg" });
          pages.push(await shrink(b, READ_EDGE));
          thumb ??= id;
        }
      }
    } catch (e) {
      setBusy(null);
      const code = e instanceof StoreError ? e.code : "";
      toast(code === "decode" ? "Couldn't open that image. Try a JPEG or PNG, or take the photo again."
        : code === "quota" ? "Storage is full. Delete some old documents."
        : code === "too_large" ? "That file is too large."
        : "Couldn't save the file. Check your connection and try again.");
      return;
    }
    const doc: Doc = { id: uid(), created: now(), files: stored, thumb, carId: car !== "all" ? car : null, status: pages.length ? "reading" : "review", ex: {} };
    setBusy(null);
    setOpen({ id: doc.id, kind: "doc" });
    if (pages.length) {
      readers.current.set(doc.id, new AbortController());
      setReading((s) => new Set(s).add(doc.id));
    }
    await put("docs", doc);
    if (pages.length) readDoc(doc.id, pages.slice(0, MAX_PDF_PAGES));
  };

  const rereadDoc = async (id: string) => {
    const d = dataRef.current.docs.find((x) => x.id === id);
    if (!d) return;
    readers.current.set(id, new AbortController());
    setReading((s) => new Set(s).add(id));
    await put("docs", { ...d, status: "reading", readError: null });
    const pages: Blob[] = [];
    try {
      for (const f of d.files) {
        const b = await store.getFile(f.id);
        if (f.type === "application/pdf") pages.push(...(await pdfToImages(b)));
        else pages.push(await shrink(b, READ_EDGE));
      }
    } catch { /* handled below */ }
    if (!pages.length) {
      stopReading(id);
      await put("docs", { ...d, status: "review", readError: "Couldn't load the photos to read them again." });
      return;
    }
    readDoc(id, pages.slice(0, MAX_PDF_PAGES));
  };

  const stopRead = (id: string) => readers.current.get(id)?.abort();

  const deleteDoc = async (id: string) => {
    const d = dataRef.current.docs.find((x) => x.id === id);
    if (!d) return;
    setOpen(null);
    for (const f of [...d.files.map((f) => f.id), d.thumb].filter((x): x is string => !!x)) {
      try { await store.delFile(f); } catch { /* already gone */ }
    }
    await del("docs", id);
    toast("Document deleted");
  };

  const saveDoc = async (doc: Doc, f: DocForm) => {
    const ex = doc.ex, c = carById(f.carId), T = today();
    if (!c) { toast("Choose which car this is for."); return; }
    const info = { type: f.type, title: f.title.trim(), date: f.date || T, shop: f.shop.trim() || null, km: num(f.km), total: num(f.total), summary: ex.summary ?? null };
    let logId: string | null = null;
    const taskIds: string[] = [];
    if (f.addLog) {
      logId = uid();
      const items = (ex.workDone || []).map((w) => w.title).join(", ");
      await put("log", { id: logId, carId: c.id, title: info.title, date: info.date, km: info.km, cost: info.total, note: [info.shop, items].filter(Boolean).join(" · "), docId: doc.id, created: now() });
    }
    for (const id of ex.completes || []) {
      const t = dataRef.current.tasks.find((x) => x.id === id);
      if (t && t.carId === c.id && f.done[id]) await completeTask(t, info.date, info.km);
    }
    for (const [i, r] of (ex.recommended || []).entries()) {
      const rf = f.recs[i];
      if (!rf?.on) continue;
      const t: Task = {
        id: uid(), carId: c.id, title: (rf.title || r.title).trim(), docId: doc.id, created: now(), everyMonths: null, everyKm: null, anchor: null,
        notes: [r.notes, r.estCost != null ? `Quoted $${r.estCost.toFixed(2)}${info.shop ? ` at ${info.shop.replace(/\.$/, "")}` : ""}.` : "", `From ${DOC_TYPES[info.type].toLowerCase()} on ${fmtDate(info.date)}.`].filter(Boolean).join(" "),
        dueDate: r.dueDate || (rf.urgency === "now" ? T : rf.urgency === "soon" ? addDays(T, 30) : null),
        dueKm: r.dueKm ?? null,
      };
      await put("tasks", t);
      taskIds.push(t.id);
    }
    await bumpOdometer(c, info.km, info.date);
    await put("docs", { ...doc, ...info, carId: c.id, status: "saved", logId, taskIds, readError: null });
    setOpen({ id: doc.id, kind: "doc" });
    toast([logId && "Added to history", taskIds.length && `${taskIds.length} task${taskIds.length === 1 ? "" : "s"} created`].filter(Boolean).join(" · ") || "Saved");
  };

  /* ---------- schedule lookup ---------- */
  const findSchedule = async (vehicle: string): Promise<Schedule | string> => {
    let token: string | null = null;
    try { token = owner ? null : await turnstileToken("schedule"); } catch { return "Couldn't confirm you're not a bot. Reload the page and try again."; }
    try {
      const res = await fetch("/api/vehicles/schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vehicle, turnstile: token }) });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.schedule) {
        const sc = json.schedule as Schedule;
        setSchedules((list) => [...list.filter((x) => x.id !== sc.id), sc]);
        return sc;
      }
      return json?.error === "not_found" ? "Couldn't find an official schedule. Check the year and model in the car's name (Cars tab), then try again."
        : json?.error === "rate_limited" ? "You've used today's schedule lookups. Try again tomorrow."
        : json?.error === "busy" ? "Too many lookups today. Try again tomorrow."
        : json?.error === "bot_check" ? "Couldn't confirm you're not a bot. Reload the page and try again."
        : "The lookup didn't finish. Try again in a minute.";
    } catch {
      return "The lookup didn't finish. Check your connection and try again.";
    }
  };

  /** Looks up a car's schedule from its name and attaches it when found. */
  const findForCar = async (carId: string) => {
    const c = carById(carId);
    if (!c || lookups[carId]?.state === "finding") return;
    setLookups((m) => ({ ...m, [carId]: { state: "finding" } }));
    const r = await findSchedule(c.name);
    const cur = carById(carId);
    if (typeof r === "string") {
      setLookups((m) => ({ ...m, [carId]: { state: "failed", msg: r } }));
      return;
    }
    setLookups((m) => { const n = { ...m }; delete n[carId]; return n; });
    if (!cur) return;
    await put("cars", { ...cur, scheduleId: r.id });
    toast(`Found the official schedule for ${cur.name}`);
  };
  const dismissLookup = (carId: string) => setLookups((m) => { const n = { ...m }; delete n[carId]; return n; });

  return {
    store, owner, data, loaded, schedules, cars, carById, lookups, findForCar, dismissLookup,
    ui: { car, view, open, adding, busy, reading, toastMsg },
    setCar, setView, setOpen, setAdding, close, toast,
    addCar, editCar, setOdometer, deleteCar,
    markDone, saveTasks, deleteTask, addSuggestion,
    addLog, deleteLog,
    handleFiles, rereadDoc, stopRead, deleteDoc, saveDoc,
  };
}

export type Garage = ReturnType<typeof useGarageState>;
const Ctx = createContext<Garage | null>(null);

export function GarageProvider({ store, owner, children }: { store: Store; owner: { id: string; email: string } | null; children: React.ReactNode }) {
  const g = useGarageState(store, owner);
  return <Ctx.Provider value={g}>{children}</Ctx.Provider>;
}

export function useGarage() {
  const g = useContext(Ctx);
  if (!g) throw new Error("useGarage outside GarageProvider");
  return g;
}
