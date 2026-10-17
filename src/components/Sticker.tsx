"use client";

import { daysBetween, num, today } from "@/lib/dates";
import { status } from "@/lib/logic";
import type { Car } from "@/lib/types";
import { useGarage } from "./state";

/** A windshield-sticker card: odometer and the next service due. */
export function Sticker({ car }: { car: Car }) {
  const g = useGarage();
  const ts = g.data.tasks
    .filter((t) => t.carId === car.id)
    .map((t) => [t, status(t, car)] as const)
    .filter(([, s]) => s.rank < 3)
    .sort((a, b) => a[1].rank - b[1].rank || a[1].key - b[1].key);
  const next = ts[0];
  const lateN = ts.filter(([, s]) => s.rank === 0).length;
  const odoAge = car.kmDate ? daysBetween(car.kmDate, today()) : 0;
  return (
    <div className="sticker">
      <div className="row">
        <h3>{car.name}</h3>
        {lateN ? <span className="chip late">{lateN} need{lateN === 1 ? "s" : ""} attention</span> : ts.length ? <span className="chip ok">All good</span> : null}
      </div>
      <div className="odo">
        <label htmlFor={`odo-${car.id}`}>Odometer</label>
        <input
          id={`odo-${car.id}`}
          key={car.km}
          inputMode="numeric"
          defaultValue={car.km ?? ""}
          aria-label={`Odometer for ${car.name} in km`}
          onBlur={(e) => { const km = num(e.target.value); if (km != null) g.setOdometer(car, km); }}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        />
        <span className="muted small">km</span>
      </div>
      {odoAge > 30 && <div className="odo-note">Last updated {odoAge} days ago. Update it so km-based reminders stay accurate.</div>}
      <div className="next">
        <span className="lbl">Next service</span>
        {next ? (
          <>
            <span className="what">{next[0].title}</span>
            <span className="meta">{next[1].chips.map(([k, t]) => <span key={t} className={`chip ${k}`}>{t}</span>)}</span>
          </>
        ) : (
          <span className="muted small">Nothing scheduled yet.</span>
        )}
      </div>
    </div>
  );
}
