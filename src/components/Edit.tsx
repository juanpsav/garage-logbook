"use client";

import { useState } from "react";
import { now, num, today, uid } from "@/lib/dates";
import { nextAfterDone } from "@/lib/logic";
import type { Car, CollectionName, Collections, Data, Task, Visit } from "@/lib/types";

/** Quick edits from the web app; anything bigger goes through the owner's agent. */
export type Editor = {
  put: <K extends CollectionName>(col: K, obj: Collections[K]) => Promise<void>;
  del: (col: CollectionName, id: string) => Promise<void>;
  /** Adds a car; resolves with an error message, or null. */
  addCar: (name: string, km: number) => Promise<string | null>;
  /** Finds and attaches the car's manufacturer schedule; resolves with an error message, or null. */
  findSchedule: (carId: string) => Promise<string | null>;
};

type Field =
  | { name: string; label: string; type: "text" | "date" | "number" | "money" | "textarea"; value: string | number | null | undefined; wide?: boolean; required?: boolean; placeholder?: string }
  | { name: string; label: string; type: "select"; value: string; options: [string, string][]; wide?: boolean };

/** A compact inline form: fields, Save, Cancel, and an optional Delete that asks once. */
export function QuickForm({ fields, onSave, onCancel, onDelete, deleteLabel = "Delete", saveLabel = "Save" }: {
  fields: Field[]; onSave: (v: Record<string, string>) => Promise<void> | void; onCancel: () => void;
  onDelete?: () => Promise<void> | void; deleteLabel?: string; saveLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  return (
    <form className="qform" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      await onSave(Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>);
      setBusy(false);
    }}>
      <div className="qfields">
        {fields.map((f) => (
          <label key={f.name} className={`qfield${f.wide || f.type === "textarea" ? " wide" : ""}`}>
            <span>{f.label}</span>
            {f.type === "select" ? (
              <select name={f.name} defaultValue={f.value}>{f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            ) : f.type === "textarea" ? (
              <textarea name={f.name} rows={3} defaultValue={f.value ?? ""} placeholder={f.placeholder} />
            ) : (
              <input name={f.name} type={f.type === "date" ? "date" : "text"} inputMode={f.type === "number" ? "numeric" : f.type === "money" ? "decimal" : undefined}
                defaultValue={f.value ?? ""} required={f.required} placeholder={f.placeholder} />
            )}
          </label>
        ))}
      </div>
      <div className="qacts">
        {onDelete && (confirm
          ? <button type="button" className="btn sm danger" disabled={busy} onClick={async () => { setBusy(true); await onDelete(); }}>Yes, {deleteLabel.toLowerCase()}</button>
          : <button type="button" className="btn sm ghost" onClick={() => setConfirm(true)}>{deleteLabel}</button>)}
        <span className="grow" />
        <button type="button" className="btn sm ghost" onClick={onCancel}>Cancel</button>
        <button className="btn sm primary" disabled={busy}>{saveLabel}</button>
      </div>
    </form>
  );
}

const text = (s: string | undefined) => (s ?? "").trim();

/** Amounts as typed in Quebec: "107,43" and "107.43" are both $107.43; spaces group thousands. */
export const money = (s: string | undefined) => {
  const t = text(s).replace(/[\s$]/g, "");
  if (!t) return null;
  const n = parseFloat(/^\d+,\d{1,2}$/.test(t) ? t.replace(",", ".") : t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** Marks a task done: a history entry with one done line, the task's next due date (or removed), and the odometer. */
export async function markDone(edit: Editor, data: Data, t: Task, v: Record<string, string>) {
  const car = data.cars.find((c) => c.id === t.carId);
  const date = v.date || today(), km = num(v.km), cost = money(v.cost);
  const visit: Visit = { id: uid(), carId: t.carId, title: t.title, date, km, shop: text(v.shop) || null, total: cost, summary: null, status: "confirmed", created: now() };
  await edit.put("visits", visit);
  await edit.put("items", {
    id: uid(), carId: t.carId, visitId: visit.id, source: "you", kind: "done", text: t.title, original: null, cost, page: null,
    unsure: false, keywords: [], note: text(v.note) || null, decision: null, created: now(),
  });
  const next = nextAfterDone(t, date, km, car);
  if (next) await edit.put("tasks", next);
  else await edit.del("tasks", t.id);
  if (car && km != null && km > (car.km ?? 0)) await edit.put("cars", { ...car, km, kmDate: date > (car.kmDate || "") ? date : car.kmDate });
}

export function carFields(c: Car): Field[] {
  return [
    { name: "name", label: "Name", type: "text", value: c.name, wide: true, required: true },
    { name: "km", label: "Odometer (km)", type: "number", value: c.km },
  ];
}
