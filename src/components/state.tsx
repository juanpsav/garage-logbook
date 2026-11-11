"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import seedSchedules from "@/data/schedules.json";
import { fmtDate, fmtKm, now, today, uid } from "@/lib/dates";
import { acceptable, MAX_FILES } from "@/lib/files";
import { preparePages } from "@/lib/pages";
import { findSuggestion, matchSchedule, nextAfterDone, scheduleFor, taskFromSuggestion, type LastDone } from "@/lib/logic";
import { turnstileToken } from "@/lib/turnstile";
import { emptyData, StoreError, type Store } from "@/lib/store";
import type { Car, CollectionName, Collections, Data, FileRec, Item, Schedule, Task, Visit } from "@/lib/types";

export type View = "todo" | "chat" | "visits" | "suggested" | "cars";
export type Lookup = { state: "finding" } | { state: "failed"; msg: string };
export type Open = { id: string; kind: string; confirm?: boolean } | null;
export type HistoryForm = { carId: string; title: string; date: string; km: number | null; cost: number | null; note: string };

/** A history entry's visit and its done lines, as the Done list shows them. */
export const doneItems = (d: Data, visitId: string) => d.items.filter((i) => i.visitId === visitId && i.kind === "done");

function useGarageState(store: Store, owner: { id: string; email: string } | null, signIn: (() => void) | null) {
  const [data, setData] = useState<Data>(emptyData);
  const [loaded, setLoaded] = useState(false);
  const [schedules, setSchedules] = useState<Schedule[]>(seedSchedules as Schedule[]);
  const [car, setCarState] = useState<string>("all");
  const [view, setViewState] = useState<View>("todo");
  const [open, setOpen] = useState<Open>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [lookups, setLookups] = useState<Record<string, Lookup>>({});
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

  /** Reloads everything, after the assistant changed things on the server. */
  const reload = useCallback(async () => {
    try {
      const d = await store.load();
      dataRef.current = d;
      setData(d);
    } catch { /* keep what's shown */ }
  }, [store]);

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
      toast(e instanceof StoreError && e.code === "quota" ? "Storage is full. Delete some old visits." : "Couldn't save. Check your connection and try again.");
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
  /** Uses a saved schedule that matches the name, or looks one up in the background. */
  const attachSchedule = (c: Car) => {
    const m = matchSchedule(c.name, schedules);
    if (m) return m.id;
    findForCar(c.id);
    return null;
  };
  const addCar = async (name: string, km: number) => {
    const c: Car = { id: uid(), name, km, kmDate: today(), scheduleId: matchSchedule(name, schedules)?.id ?? null, created: now() };
    await put("cars", c);
    // Next step is choosing what to track, which is the Suggested list.
    setView("suggested");
    setCarState(c.id);
    toast(`${c.name} added`);
    if (!c.scheduleId) findForCar(c.id);
  };
  const editCar = async (c: Car, name: string, km: number | null) => {
    const renamed = name !== c.name;
    const n: Car = { ...c, name, km: km ?? c.km, kmDate: km != null && km !== c.km ? today() : c.kmDate };
    if (renamed) { dismissLookup(c.id); n.scheduleId = null; }
    await put("cars", n);
    toast("Saved");
    if (renamed) {
      const id = attachSchedule(n);
      if (id) await put("cars", { ...n, scheduleId: id });
    }
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
    // Visits and notes stay in history without a car.
    for (const v of dataRef.current.visits.filter((v) => v.carId === id)) await put("visits", { ...v, carId: null });
    for (const it of dataRef.current.items.filter((i) => i.carId === id)) await put("items", { ...it, carId: null });
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
    await addHistoryEntry({ carId: t.carId, title: t.title, ...f });
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

  /* ---------- history (work done, logged by hand) ---------- */
  /** A history entry typed in by hand is a confirmed visit with one done line. */
  const addHistoryEntry = async (f: HistoryForm) => {
    const v: Visit = { id: uid(), carId: f.carId, title: f.title, date: f.date, km: f.km, shop: null, total: f.cost, summary: null, status: "confirmed", created: now() };
    await put("visits", v);
    await put("items", {
      id: uid(), carId: f.carId, visitId: v.id, source: "you", kind: "done", text: f.title, original: null, cost: f.cost, page: null,
      unsure: false, keywords: [], note: f.note || null, decision: null, created: now(),
    });
  };
  const addHistory = async (f: HistoryForm) => {
    await addHistoryEntry(f);
    const c = carById(f.carId);
    if (c) await bumpOdometer(c, f.km, f.date);
    setOpen(null);
    toast("Saved to history");
  };
  /** Edits a visit's date, km and total; a one-line entry's line follows its title, cost and note. */
  const updateHistory = async (v: Visit, f: HistoryForm) => {
    await put("visits", { ...v, carId: f.carId, title: f.title, date: f.date, km: f.km, total: f.cost });
    const lines = dataRef.current.items.filter((i) => i.visitId === v.id);
    for (const it of lines) {
      const solo = lines.length === 1 && it.kind === "done";
      await put("items", { ...it, carId: f.carId, ...(solo && { text: f.title, cost: f.cost, note: f.note || null }) });
    }
    setOpen(null);
    toast("Entry updated");
  };

  /* ---------- visits ---------- */
  /** Saves photos and PDFs as pages of a visit. Null (after a toast) on failure. */
  const storePages = async (files: File[], visitId: string, start: number): Promise<FileRec[] | null> => {
    setBusy(files.length > 1 ? `Saving ${files.length} pages…` : "Saving…");
    let out: FileRec[] = [];
    try {
      // Signed in, photos are also kept exactly as taken; browser storage is too small for both.
      out = await preparePages(files, (b, t) => store.putFile(b, t), visitId, start, store.kind === "server");
    } catch (e) {
      const code = e instanceof StoreError ? e.code : "";
      toast(code === "decode" ? "Couldn't open that image. Try a JPEG or PNG, or take the photo again."
        : code === "quota" ? "Storage is full. Delete some old visits."
        : code === "too_large" ? "That file is too large."
        : "Couldn't save the file. Check your connection and try again.");
      return null;
    } finally {
      setBusy(null);
    }
    return out;
  };

  /** Starts a visit from photos or PDFs. It waits as a draft so more pages can be added before going through it. */
  const newVisit = async (list: File[]) => {
    const files = list.filter(acceptable).slice(0, MAX_FILES);
    if (!files.length) return;
    setViewState("visits");
    setAdding(false);
    const v: Visit = { id: uid(), carId: car !== "all" ? car : cars.length === 1 ? cars[0].id : null, title: "", date: null, km: null, shop: null, total: null, summary: null, status: "draft", created: now() };
    await put("visits", v);
    setOpen({ id: v.id, kind: "visit" });
    const recs = await storePages(files, v.id, 0);
    if (!recs) { await del("visits", v.id); return; }
    for (const r of recs) await put("files", r);
  };

  const addPages = async (visitId: string, list: File[]) => {
    const have = dataRef.current.files.filter((f) => f.visitId === visitId);
    const room = MAX_FILES - have.length;
    const files = list.filter(acceptable).slice(0, Math.max(0, room));
    if (!files.length) {
      if (room <= 0) toast(`A visit holds up to ${MAX_FILES} pages.`);
      return;
    }
    const recs = await storePages(files, visitId, Math.max(-1, ...have.map((f) => f.position)) + 1);
    if (recs) for (const r of recs) await put("files", r);
  };

  const deleteFiles = async (recs: FileRec[]) => {
    for (const p of new Set(recs.flatMap((f) => [f.orig, f.view]).filter((x): x is string => !!x))) {
      try { await store.delFile(p); } catch { /* already gone */ }
    }
  };

  const deletePage = async (f: FileRec) => {
    // Pages of one PDF share its original; keep it while another page still uses it.
    const shared = dataRef.current.files.some((x) => x.id !== f.id && x.orig === f.orig);
    await deleteFiles([shared ? { ...f, orig: "" } : f]);
    await del("files", f.id);
  };

  /** Deletes a visit with its pages and lines. Tasks it created stay. */
  const deleteVisit = async (id: string) => {
    setOpen(null);
    const d = dataRef.current;
    await deleteFiles(d.files.filter((f) => f.visitId === id));
    for (const t of d.tasks.filter((t) => t.visitId === id)) await put("tasks", { ...t, visitId: null });
    await del("visits", id);
    // The server removes the lines and pages with the visit; the browser store needs telling.
    apply((x) => ({ ...x, items: x.items.filter((i) => i.visitId !== id), files: x.files.filter((f) => f.visitId !== id) }));
    if (store.kind === "local") {
      for (const i of d.items.filter((i) => i.visitId === id)) await store.del("items", i.id);
      for (const f of d.files.filter((f) => f.visitId === id)) await store.del("files", f.id);
    }
    toast("Visit deleted");
  };

  const confirmVisit = async (v: Visit) => {
    const c = carById(v.carId);
    if (!c || !v.date) { toast("Choose the car and date first."); return; }
    await put("visits", { ...v, status: "confirmed" });
    await bumpOdometer(c, v.km, v.date);
    toast("Saved to history");
  };

  /** Hands a draft to the assistant: the visit's conversation starts with its pages. */
  const startVisit = async (v: Visit) => { await put("visits", { ...v, status: "open" }); };

  /** Saves edited visit details; its lines follow the car. */
  const saveVisit = async (v: Visit) => {
    const old = dataRef.current.visits.find((x) => x.id === v.id);
    await put("visits", v);
    if (old && old.carId !== v.carId) {
      for (const it of dataRef.current.items.filter((i) => i.visitId === v.id)) await put("items", { ...it, carId: v.carId });
    }
    const c = carById(v.carId);
    if (c && v.status === "confirmed" && v.date) await bumpOdometer(c, v.km, v.date);
    toast("Saved");
  };

  const updateItem = async (it: Item) => { await put("items", it); };
  const deleteItem = async (id: string) => { await del("items", id); };

  /* ---------- schedule lookup ---------- */
  const findSchedule = async (vehicle: string, fresh: boolean): Promise<Schedule | string> => {
    let token: string | null = null;
    try { token = owner ? null : await turnstileToken("schedule"); } catch { return "Couldn't confirm you're not a bot. Reload the page and try again."; }
    try {
      const res = await fetch("/api/vehicles/schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vehicle, fresh, turnstile: token }) });
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

  /** Looks up a car's schedule from its name and attaches it when found. `fresh` skips saved schedules. */
  const findForCar = async (carId: string, fresh = false) => {
    const c = carById(carId);
    if (!c || lookups[carId]?.state === "finding") return;
    setLookups((m) => ({ ...m, [carId]: { state: "finding" } }));
    const r = await findSchedule(c.name, fresh);
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
    store, owner, data, loaded, schedules, cars, carById, lookups, findForCar, dismissLookup, reload,
    ui: { car, view, open, adding, busy, toastMsg },
    setCar, setView, setOpen, setAdding, close, toast,
    addCar, editCar, setOdometer, deleteCar,
    markDone, saveTasks, deleteTask, addSuggestion,
    addHistory, updateHistory,
    newVisit, addPages, deletePage, deleteVisit, startVisit, saveVisit, confirmVisit, updateItem, deleteItem, signIn,
  };
}

export type Garage = ReturnType<typeof useGarageState>;
const Ctx = createContext<Garage | null>(null);

export function GarageProvider({ store, owner, signIn, children }: {
  store: Store; owner: { id: string; email: string } | null; signIn: (() => void) | null; children: React.ReactNode;
}) {
  const g = useGarageState(store, owner, signIn);
  return <Ctx.Provider value={g}>{children}</Ctx.Provider>;
}

export function useGarage() {
  const g = useContext(Ctx);
  if (!g) throw new Error("useGarage outside GarageProvider");
  return g;
}
