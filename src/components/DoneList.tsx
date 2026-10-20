"use client";

import { useState } from "react";
import { fmtDate, fmtKm, fmtMoney, num, today } from "@/lib/dates";
import { DOC_TYPES } from "@/lib/extraction";
import type { LogEntry } from "@/lib/types";
import { useGarage } from "./state";
import { openDoc } from "./TodoView";

const SHOWN = 5;

/** Finished work, newest first. Sits under the open tasks on the Maintenance list. */
export function DoneList() {
  const g = useGarage();
  const { ui } = g;
  const entries = g.data.log
    .filter((e) => g.carById(e.carId) && (ui.car === "all" || e.carId === ui.car))
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.created || "").localeCompare(a.created || ""));
  const yr = String(new Date().getFullYear());
  const spent = entries.filter((e) => e.date?.startsWith(yr)).reduce((s, e) => s + (e.cost || 0), 0);
  const [all, setAll] = useState(false);
  const shown = all ? entries : entries.slice(0, SHOWN);
  return (
    <section className="group done-group">
      <div className="group-h">
        <span className="dot" style={{ background: "var(--muted)" }} /><h2>Done</h2>
        <span className="muted small mono">{entries.length}</span>
        {spent > 0 && <span className="muted small push-r"><span className="mono">{fmtMoney(spent)}</span> in {yr}</span>}
      </div>
      <div className="bar">
        <button className="btn ghost sm" onClick={() => g.setOpen(ui.open?.id === "newlog" ? null : { id: "newlog", kind: "log" })}>+ Log work done before</button>
      </div>
      {ui.open?.id === "newlog" && <LogForm />}
      {!entries.length ? (
        <p className="muted small">Tasks you mark done show up here with the date, km and cost.</p>
      ) : (
        <div className="list">
          {shown.map((e) => {
            const car = g.carById(e.carId);
            const doc = e.docId ? g.data.docs.find((d) => d.id === e.docId) : undefined;
            if (ui.open?.id === e.id) return <LogForm key={e.id} entry={e} />;
            const parts: React.ReactNode[] = [
              ui.car === "all" && g.cars.length > 1 ? car?.name : null,
              e.km != null ? <span className="mono">{fmtKm(e.km)}</span> : null,
              e.cost ? <span className="mono">{fmtMoney(e.cost)}</span> : null,
              e.note || null,
              doc ? <button className="chip" onClick={() => openDoc(g, doc.id)}>View {DOC_TYPES[doc.type || doc.ex.type || "other"].toLowerCase()}</button> : null,
            ].filter(Boolean);
            return (
              <div key={e.id} className="hist">
                <span className="when">{fmtDate(e.date)}</span>
                <span className="title">{e.title}</span>
                <button className="btn ghost sm" onClick={() => g.setOpen({ id: e.id, kind: "log" })} aria-label={`Edit ${e.title}`}>Edit</button>
                <span className="sub">{parts.map((p, i) => <span key={i}>{i > 0 && " · "}{p}</span>)}</span>
              </div>
            );
          })}
          {entries.length > shown.length && (
            <button className="btn ghost sm self-start" onClick={() => setAll(true)}>Show all {entries.length}</button>
          )}
        </div>
      )}
    </section>
  );
}

/** Adds work done before, or edits an existing entry when `entry` is given. */
function LogForm({ entry }: { entry?: LogEntry }) {
  const g = useGarage();
  const def = entry?.carId ?? (g.ui.car !== "all" ? g.ui.car : g.cars[0].id);
  const confirm = !!entry && g.ui.open?.confirm;
  return (
    <form className="card" onSubmit={(e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
      const fields = { carId: d.carId, title: d.title.trim(), date: d.date || today(), km: num(d.km), cost: num(d.cost), note: (d.note || "").trim() };
      if (entry) g.updateLog({ ...entry, ...fields });
      else g.addLog(fields);
    }}>
      <div className="fields">
        <label className="field wide"><span>What was done</span><input name="title" required placeholder="New brake pads, front" defaultValue={entry?.title} autoFocus={!entry} /></label>
        <label className="field"><span>Car</span>
          <select name="carId" defaultValue={def}>{g.cars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </label>
        <label className="field"><span>Date</span><input type="date" name="date" defaultValue={entry?.date ?? today()} required /></label>
        <label className="field"><span>Odometer (km)</span><input name="km" inputMode="numeric" defaultValue={entry?.km ?? ""} /></label>
        <label className="field"><span>Cost ($)</span><input name="cost" inputMode="decimal" defaultValue={entry?.cost ?? ""} /></label>
      </div>
      <label className="field"><span>Note</span><input name="note" defaultValue={entry?.note} /></label>
      <div className="form-acts">
        {entry && (confirm ? (
          <>
            <span className="hint center">Delete this entry?</span>
            <button type="button" className="btn danger" onClick={() => g.deleteLog(entry.id)}>Yes, delete</button>
          </>
        ) : (
          <button type="button" className="btn ghost push" onClick={() => g.setOpen({ id: entry.id, kind: "log", confirm: true })}>Delete</button>
        ))}
        <button type="button" className="btn ghost" onClick={g.close}>Cancel</button>
        <button className="btn primary">{entry ? "Save changes" : "Save to history"}</button>
      </div>
    </form>
  );
}
