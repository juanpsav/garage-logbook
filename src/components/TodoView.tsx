"use client";

import { useState } from "react";
import { now, num, today, uid } from "@/lib/dates";
import { DOC_TYPES } from "@/lib/extraction";
import { every, repeats, status, type Status } from "@/lib/logic";
import type { Task } from "@/lib/types";
import { DoneList } from "./DoneList";
import { useGarage } from "./state";

const GROUPS = [[0, "Needs attention", "var(--late)"], [1, "Coming up", "var(--soon)"], [2, "Later", "var(--ok)"], [3, "No due date", "var(--line)"]] as const;

export function TodoView() {
  const g = useGarage();
  const { ui } = g;
  const ts = g.data.tasks
    .filter((t) => g.carById(t.carId) && (ui.car === "all" || t.carId === ui.car))
    .map((t) => [t, status(t, g.carById(t.carId))] as const);
  return (
    <>
      <div className="bar">
        <span className="muted small">{ts.length} task{ts.length === 1 ? "" : "s"}{ui.car === "all" && g.cars.length > 1 ? " across both cars" : ""}</span>
        <button className="btn primary" onClick={() => { g.setOpen(null); g.setAdding(!ui.adding); }}>+ Add task</button>
      </div>
      {ui.adding && <TaskForm />}
      {!ts.length && !ui.adding && (
        <div className="empty stack">
          <span>Nothing to do yet. Pick the checks you want to track, or add your own task.</span>
          <button className="btn primary self-center" onClick={() => g.setView("suggested")}>Choose checks to track</button>
        </div>
      )}
      {GROUPS.map(([r, name, color]) => {
        const grp = ts.filter(([, s]) => s.rank === r).sort((a, b) => a[1].key - b[1].key || a[0].title.localeCompare(b[0].title));
        if (!grp.length) return null;
        return (
          <section className="group" key={r}>
            <div className="group-h"><span className="dot" style={{ background: color }} /><h2>{name}</h2><span className="muted small mono">{grp.length}</span></div>
            <div className="list">{grp.map(([t, s]) => <TaskRow key={t.id} task={t} st={s} />)}</div>
          </section>
        );
      })}
      <DoneList />
    </>
  );
}

function TaskRow({ task: t, st }: { task: Task; st: Status }) {
  const g = useGarage();
  const car = g.carById(t.carId);
  const open = g.ui.open?.id === t.id ? g.ui.open.kind : null;
  const doc = t.docId ? g.data.docs.find((d) => d.id === t.docId) : undefined;
  const toggle = (kind: string) => { g.setAdding(false); g.setOpen(open === kind ? null : { id: t.id, kind }); };
  return (
    <div className={`item ${st.cls}`}>
      <div className="stripe" />
      <div className="body">
        <span className="title">{t.title}</span>
        <span className="meta">
          {g.ui.car === "all" && g.cars.length > 1 && car && <span className="chip car">{car.name}</span>}
          {st.chips.map(([k, x]) => <span key={x} className={`chip ${k}`}>{x}</span>)}
          {repeats(t) && <span className="muted">{every(t)}</span>}
          {doc && <button className="chip" onClick={() => openDoc(g, doc.id)}>From {DOC_TYPES[doc.type || doc.ex.type || "other"].toLowerCase()}</button>}
        </span>
        {t.notes && <span className="notes">{t.notes}</span>}
      </div>
      <div className="acts">
        <button className="btn sm" onClick={() => toggle("done")}>Done</button>
        <button className="btn ghost sm" onClick={() => toggle("edit")} aria-label={`Edit ${t.title}`}>Edit</button>
      </div>
      {open === "done" && <div className="panel"><DoneForm task={t} /></div>}
      {open === "edit" && <div className="panel"><TaskForm task={t} /></div>}
    </div>
  );
}

export function openDoc(g: ReturnType<typeof useGarage>, id: string) {
  g.setCar("all");
  g.setView("docs");
  g.setOpen({ id, kind: "doc" });
}

function DoneForm({ task: t }: { task: Task }) {
  const g = useGarage();
  const car = g.carById(t.carId);
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
      g.markDone(t, { date: d.date || today(), km: num(d.km), cost: num(d.cost), note: (d.note || "").trim() });
    }}>
      <div className="fields">
        <label className="field"><span>Date</span><input type="date" name="date" defaultValue={today()} required /></label>
        <label className="field"><span>Odometer (km)</span><input name="km" inputMode="numeric" defaultValue={car?.km ?? ""} /></label>
        <label className="field"><span>Cost ($, optional)</span><input name="cost" inputMode="decimal" /></label>
      </div>
      <label className="field"><span>Note (optional)</span><input name="note" placeholder="Shop, parts, what you found" /></label>
      <p className="hint">{repeats(t) ? "Moves to Done, and the next one gets scheduled." : "Moves to Done."}</p>
      <div className="form-acts">
        <button type="button" className="btn ghost" onClick={g.close}>Cancel</button>
        <button className="btn primary">Mark done</button>
      </div>
    </form>
  );
}

function TaskForm({ task: t }: { task?: Task }) {
  const g = useGarage();
  const isNew = !t;
  const [repeat, setRepeat] = useState(t ? repeats(t) : false);
  const defCar = t?.carId || (g.ui.car !== "all" ? g.ui.car : g.cars[0].id);
  const confirm = g.ui.open?.confirm;

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const T = today();
    const base = { title: d.title.trim(), notes: (d.notes || "").trim() };
    const targets = d.carId === "__both" ? g.cars.map((c) => c.id) : [d.carId];
    const out: Task[] = [];
    for (const carId of targets) {
      const car = g.carById(carId);
      const n: Task = { ...(t ?? { id: uid(), created: now() }), ...base, carId } as Task;
      if (repeat) {
        n.everyMonths = num(d.everyMonths);
        n.everyKm = num(d.everyKm);
        if (!n.everyMonths && !n.everyKm) { g.toast("Enter how often it repeats, in months or km."); return; }
        n.dueDate = d.rDueDate || (n.everyMonths ? T : null);
        n.dueKm = num(d.rDueKm) ?? (n.everyKm ? car?.km ?? 0 : null);
        if (!n.everyMonths && !d.rDueDate) n.dueDate = null;
        if (!n.everyKm && num(d.rDueKm) == null) n.dueKm = null;
        if (t?.anchor && n.everyMonths !== 12) n.anchor = null;
      } else {
        Object.assign(n, { everyMonths: null, everyKm: null, anchor: null, dueDate: d.dueDate || null, dueKm: num(d.dueKm) });
      }
      out.push(n);
      if (t) break;
    }
    g.saveTasks(out, !!t);
  };

  return (
    <form className={isNew ? "card" : ""} onSubmit={submit}>
      {isNew && <h2 className="ink">New task</h2>}
      <div className="fields">
        <label className="field wide"><span>What</span><input name="title" required defaultValue={t?.title} placeholder="Fix rattle in rear door" autoFocus={isNew} /></label>
        <label className="field"><span>Car</span>
          <select name="carId" defaultValue={defCar}>
            {g.cars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            {isNew && g.cars.length > 1 && <option value="__both">Both cars</option>}
          </select>
        </label>
      </div>
      <div className="seg" role="radiogroup" aria-label="Type">
        <label><input type="radio" name="kind" checked={!repeat} onChange={() => setRepeat(false)} /> One time</label>
        <label><input type="radio" name="kind" checked={repeat} onChange={() => setRepeat(true)} /> Repeats</label>
      </div>
      {!repeat ? (
        <div className="fields">
          <label className="field"><span>Due date (optional)</span><input type="date" name="dueDate" defaultValue={t?.dueDate || ""} /></label>
          <label className="field"><span>Or by km (optional)</span><input name="dueKm" inputMode="numeric" defaultValue={t?.dueKm ?? ""} /></label>
        </div>
      ) : (
        <div className="stack">
          <div className="fields">
            <label className="field"><span>Every … months</span><input name="everyMonths" inputMode="numeric" defaultValue={t?.everyMonths || ""} /></label>
            <label className="field"><span>Or every … km</span><input name="everyKm" inputMode="numeric" defaultValue={t?.everyKm || ""} /></label>
          </div>
          <div className="fields">
            <label className="field"><span>Next due date</span><input type="date" name="rDueDate" defaultValue={t?.dueDate || ""} /></label>
            <label className="field"><span>Next due at km</span><input name="rDueKm" inputMode="numeric" defaultValue={t?.dueKm ?? ""} /></label>
          </div>
          <p className="hint">Leave the next due fields empty to make it due now. After you mark it done, the next one is scheduled from that day and km, whichever comes first.</p>
        </div>
      )}
      <label className="field"><span>Notes (optional)</span><textarea name="notes" defaultValue={t?.notes} placeholder="Part numbers, shop, tire size…" /></label>
      <div className="form-acts">
        {t && (confirm ? (
          <>
            <span className="hint center">Delete this task?</span>
            <button type="button" className="btn danger" onClick={() => g.deleteTask(t.id)}>Yes, delete</button>
          </>
        ) : (
          <button type="button" className="btn ghost push" onClick={() => g.setOpen({ id: t.id, kind: "edit", confirm: true })}>Delete</button>
        ))}
        <button type="button" className="btn ghost" onClick={g.close}>Cancel</button>
        <button className="btn primary">{isNew ? "Add task" : "Save"}</button>
      </div>
    </form>
  );
}
