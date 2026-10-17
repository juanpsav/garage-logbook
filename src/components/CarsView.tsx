"use client";

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

function ScheduleSelect({ value }: { value?: string | null }) {
  const g = useGarage();
  return (
    <label className="field"><span>Maintenance schedule</span>
      <select name="scheduleId" defaultValue={value ?? ""}>
        <option value="">General suggestions</option>
        {g.schedules.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </label>
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
                <ScheduleSelect value={c.scheduleId} />
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
