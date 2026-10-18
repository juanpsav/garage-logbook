"use client";

import { useState } from "react";
import { fmtNum, num, today } from "@/lib/dates";
import { intervalLabel, scheduleFor } from "@/lib/logic";
import { GENERAL, SUGGESTIONS } from "@/lib/suggestions";
import type { Car, Schedule, ScheduleItem } from "@/lib/types";
import { useGarage } from "./state";

export function SuggestedView() {
  const g = useGarage();
  const [sugCar, setSugCar] = useState<string | null>(null);
  const carId = g.ui.car !== "all" ? g.ui.car : sugCar && g.carById(sugCar) ? sugCar : g.cars[0].id;
  const car = g.carById(carId)!;
  const sc = scheduleFor(car, g.schedules);
  const picker = g.ui.car === "all" && g.cars.length > 1 && (
    <label className="field picker"><span>For</span>
      <select value={carId} onChange={(e) => { setSugCar(e.target.value); g.setOpen(null); }}>
        {g.cars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </label>
  );

  if (!sc) {
    return (
      <>
        <div className="bar">
          <div className="stack lede">
            <p className="muted small flush">
              Common checks with typical intervals for the <strong>{car.name}</strong>. Tap <strong>Add</strong> on the ones you want to track and say when they were last done; leave that blank if you don&apos;t know and it&apos;ll be due now.
            </p>
            {!g.lookups[car.id] && (
              <button className="btn sm self-start" onClick={() => g.findForCar(car.id)}>Find the official schedule for this car</button>
            )}
          </div>
          {picker}
        </div>
        <SugList items={SUGGESTIONS} car={car} sc={null} />
      </>
    );
  }
  const general = SUGGESTIONS.filter((x) => GENERAL.includes(x.key) || (sc.alsoGeneric || []).includes(x.key));
  return (
    <>
      <div className="bar">
        <p className="muted small lede">
          Official schedule for the <strong>{sc.name}</strong>, from the{" "}
          {sc.sourceUrl ? <a href={sc.sourceUrl} target="_blank" rel="noopener">{sc.source}</a> : sc.source}. {sc.note} Tap <strong>Add</strong> on the ones you want to track.
        </p>
        {picker}
      </div>
      <section className="group">
        <div className="group-h"><span className="dot" style={{ background: "var(--accent)" }} /><h2>Manufacturer schedule</h2></div>
        <SugList items={sc.items} car={car} sc={sc} />
      </section>
      <section className="group">
        <div className="group-h"><span className="dot" style={{ background: "var(--line)" }} /><h2>Seasonal and quick checks</h2></div>
        <SugList items={general} car={car} sc={null} />
      </section>
    </>
  );
}

function SugList({ items, car, sc }: { items: ScheduleItem[]; car: Car; sc: Schedule | null }) {
  const g = useGarage();
  return (
    <div className="list">
      {items.map((s) => {
        const added = g.data.tasks.some((t) => t.carId === car.id && t.sugKey === s.key);
        const open = g.ui.open?.id === `sug-${s.key}`;
        return (
          <div key={s.key} className={`sug${added ? " added" : ""}`}>
            <div><span className="title">{s.title}</span> <span className="chip">{intervalLabel(s)}</span></div>
            {added ? <span className="chip ok">Added</span>
              : s.anchor ? <button className="btn sm" onClick={() => g.addSuggestion(s.key, car.id, {})}>Add</button>
              : <button className="btn sm" onClick={() => g.setOpen(open ? null : { id: `sug-${s.key}`, kind: "sug" })}>Add</button>}
            {s.why && <span className="why">{s.why}</span>}
            {open && !added && (
              <div className="panel">
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
                  g.addSuggestion(s.key, car.id, { date: d.date || null, km: num(d.km), never: !!d.never });
                }}>
                  <div className="fields">
                    {s.months && <label className="field"><span>Last done (date)</span><input type="date" name="date" max={today()} /></label>}
                    {s.km && <label className="field"><span>Last done at km</span><input name="km" inputMode="numeric" placeholder={car.km ? fmtNum(car.km) : ""} /></label>}
                  </div>
                  {sc?.modelYear && (
                    <label className="small inline-check">
                      <input type="checkbox" name="never" value="1" /> Never done since the car was new (counts from 0 km and January {sc.modelYear})
                    </label>
                  )}
                  <p className="hint">Leave everything blank if you don&apos;t know; it&apos;ll be due now.</p>
                  <div className="form-acts">
                    <button type="button" className="btn ghost" onClick={g.close}>Cancel</button>
                    <button className="btn primary">Add to {car.name}</button>
                  </div>
                </form>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
