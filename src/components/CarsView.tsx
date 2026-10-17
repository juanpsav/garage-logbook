"use client";

import { useState } from "react";
import { num } from "@/lib/dates";
import { useGarage } from "./state";

export function Welcome() {
  const g = useGarage();
  return (
    <form className="card" onSubmit={(e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
      g.addCar(d.name.trim(), num(d.km) ?? 0, d.scheduleId || null);
    }}>
      <h2 className="ink">Add your first car</h2>
      <p className="hint">Then pick from suggested checks (oil, tires, brakes, winter prep) or add your own tasks.</p>
      <div className="fields">
        <label className="field"><span>Name</span><input name="name" required placeholder="2018 Civic" /></label>
        <label className="field"><span>Odometer (km)</span><input name="km" inputMode="numeric" required placeholder="84500" /></label>
        <ScheduleSelect />
      </div>
      <div className="form-acts"><button className="btn primary">Add car</button></div>
    </form>
  );
}

function ScheduleSelect({ value, vehicle }: { value?: string | null; vehicle?: string }) {
  const g = useGarage();
  const [sel, setSel] = useState(value ?? "");
  const [finding, setFinding] = useState(false);
  const [query, setQuery] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const find = async () => {
    if (!query || query.trim().length < 6) { setMsg("Enter the year, make, model and engine."); return; }
    setFinding(true);
    setMsg(null);
    const r = await g.findSchedule(query.trim());
    setFinding(false);
    if (typeof r === "string") setMsg(r);
    else { setSel(r.id); setQuery(null); setMsg(`Found: ${r.source}. Save to use it.`); }
  };
  return (
    <div className="field sched-field">
      <label className="field"><span>Maintenance schedule</span>
        <select name="scheduleId" value={sel} onChange={(e) => setSel(e.target.value)}>
          <option value="">General suggestions</option>
          {g.schedules.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      {g.owner && query === null && !finding && (
        <button type="button" className="btn ghost sm self-start" onClick={() => { setQuery(vehicle ?? ""); setMsg(null); }}>Find the official schedule</button>
      )}
      {g.owner && query !== null && (
        <div className="finder">
          <input
            value={query}
            disabled={finding}
            aria-label="Vehicle to look up"
            placeholder="2021 Toyota RAV4 LE 2.5L"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); find(); } }}
          />
          <button type="button" className="btn sm" disabled={finding} onClick={find}>{finding ? "Searching…" : "Look up"}</button>
          {!finding && <button type="button" className="btn ghost sm" onClick={() => setQuery(null)}>Cancel</button>}
        </div>
      )}
      {finding && <span className="reading small"><span className="spin" />Reading the manufacturer&apos;s documents. This takes a minute or two.</span>}
      {msg && <span className="hint">{msg}</span>}
    </div>
  );
}

export function CarsView() {
  const g = useGarage();
  return (
    <>
      <div className="list">
        {g.cars.map((c) => {
          const confirm = g.ui.open?.id === c.id && g.ui.open.kind === "delcar";
          const n = g.data.tasks.filter((t) => t.carId === c.id).length;
          return (
            <form key={c.id + c.km} className="sug car-row" onSubmit={(e) => {
              e.preventDefault();
              const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
              g.editCar(c, d.name.trim(), num(d.km), d.scheduleId || null);
            }}>
              <div className="fields">
                <label className="field"><span>Name</span><input name="name" defaultValue={c.name} required /></label>
                <label className="field"><span>Odometer (km)</span><input name="km" inputMode="numeric" defaultValue={c.km ?? ""} /></label>
                <ScheduleSelect value={c.scheduleId} vehicle={c.name} />
              </div>
              <div className="row-acts">
                {confirm ? (
                  <>
                    <button type="button" className="btn danger sm" onClick={() => g.deleteCar(c.id)}>Delete car and {n} task{n === 1 ? "" : "s"}</button>
                    <button type="button" className="btn ghost sm" onClick={g.close}>Keep</button>
                  </>
                ) : (
                  <>
                    <button className="btn sm">Save</button>
                    <button type="button" className="btn ghost sm" onClick={() => g.setOpen({ id: c.id, kind: "delcar" })}>Delete</button>
                  </>
                )}
              </div>
            </form>
          );
        })}
      </div>
      <form className="card" onSubmit={(e) => {
        e.preventDefault();
        const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
        g.addCar(d.name.trim(), num(d.km) ?? 0, d.scheduleId || null);
        e.currentTarget.reset();
      }}>
        <h2 className="ink">Add a car</h2>
        <div className="fields">
          <label className="field"><span>Name</span><input name="name" required placeholder="2021 RAV4" /></label>
          <label className="field"><span>Odometer (km)</span><input name="km" inputMode="numeric" required /></label>
          <ScheduleSelect />
        </div>
        <div className="form-acts"><button className="btn primary">Add car</button></div>
      </form>
    </>
  );
}
