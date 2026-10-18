"use client";

import { num } from "@/lib/dates";
import type { Car } from "@/lib/types";
import { FIND, useGarage } from "./state";

export function Welcome() {
  const g = useGarage();
  return (
    <form className="card" onSubmit={(e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
      g.addCar(d.name.trim(), num(d.km) ?? 0, d.scheduleId || null);
    }}>
      <h2 className="ink">Add your first car</h2>
      <p className="hint">We look up the manufacturer&apos;s maintenance schedule for it, then you pick which checks to track.</p>
      <CarFields />
      <div className="form-acts"><button className="btn primary">Add car</button></div>
    </form>
  );
}

/** Name, odometer and schedule fields shared by the add and edit forms. */
function CarFields({ car }: { car?: Car }) {
  return (
    <div className="fields">
      <label className="field wide"><span>Year, make and model</span>
        <input name="name" required defaultValue={car?.name} placeholder="2019 Subaru Forester" />
      </label>
      <label className="field"><span>Odometer (km)</span><input name="km" inputMode="numeric" required={!car} defaultValue={car?.km ?? ""} placeholder="84500" /></label>
      <ScheduleSelect value={car ? car.scheduleId ?? null : FIND} />
    </div>
  );
}

function ScheduleSelect({ value }: { value: string | null }) {
  const g = useGarage();
  return (
    <label className="field"><span>Maintenance schedule</span>
      <select name="scheduleId" defaultValue={value ?? ""}>
        <option value={FIND}>{value === FIND ? "Find it for me" : "Look it up again"}</option>
        {g.schedules.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        <option value="">None, use common checks</option>
      </select>
    </label>
  );
}

/** Progress or failure of a car's schedule lookup. Shown above every view. */
export function LookupStatus({ car }: { car: Car }) {
  const g = useGarage();
  const l = g.lookups[car.id];
  if (!l) return null;
  if (l.state === "finding") {
    return (
      <div className="notice reading" role="status">
        <span className="spin" />
        <span>Finding the official maintenance schedule for <strong>{car.name}</strong>. It takes 1–2 minutes; you can keep using the app.</span>
      </div>
    );
  }
  return (
    <div className="notice" role="alert">
      <span>{l.msg}</span>
      <span className="row-acts">
        <button className="btn sm" onClick={() => g.findForCar(car.id)}>Try again</button>
        <button className="btn ghost sm" onClick={() => { g.dismissLookup(car.id); g.setView("cars"); }}>Edit car</button>
        <button className="btn ghost sm" onClick={() => g.dismissLookup(car.id)}>Dismiss</button>
      </span>
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
            <form key={`${c.id}${c.km}${c.scheduleId}`} className="sug car-row" onSubmit={(e) => {
              e.preventDefault();
              const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
              g.editCar(c, d.name.trim(), num(d.km), d.scheduleId || null);
            }}>
              <CarFields car={c} />
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
        <CarFields />
        <div className="form-acts"><button className="btn primary">Add car</button></div>
      </form>
    </>
  );
}
