"use client";

import { fmtDate, fmtKm, fmtMoney, num, today } from "@/lib/dates";
import { DOC_TYPES } from "@/lib/extraction";
import { useGarage } from "./state";
import { openDoc } from "./TodoView";

export function HistoryView() {
  const g = useGarage();
  const { ui } = g;
  const entries = g.data.log
    .filter((e) => g.carById(e.carId) && (ui.car === "all" || e.carId === ui.car))
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.created || "").localeCompare(a.created || ""));
  const yr = String(new Date().getFullYear());
  const spent = entries.filter((e) => e.date?.startsWith(yr)).reduce((s, e) => s + (e.cost || 0), 0);
  return (
    <>
      <div className="bar">
        <span className="muted small">
          {entries.length} entr{entries.length === 1 ? "y" : "ies"}
          {spent > 0 && <> · <span className="mono">{fmtMoney(spent)}</span> spent in {yr}</>}
        </span>
        <button className="btn sm" onClick={() => g.setOpen(ui.open?.id === "newlog" ? null : { id: "newlog", kind: "log" })}>+ Log past work</button>
      </div>
      {ui.open?.id === "newlog" && <LogForm />}
      {!entries.length ? (
        <div className="empty">Nothing logged yet. When you mark a task done, it shows up here with the date and km.</div>
      ) : (
        <div className="list">
          {entries.map((e) => {
            const car = g.carById(e.carId);
            const doc = e.docId ? g.data.docs.find((d) => d.id === e.docId) : undefined;
            const confirm = ui.open?.id === e.id;
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
                {confirm ? (
                  <span>
                    <button className="btn danger sm" onClick={() => g.deleteLog(e.id)}>Delete</button>{" "}
                    <button className="btn ghost sm" onClick={g.close}>Keep</button>
                  </span>
                ) : (
                  <button className="btn ghost sm" onClick={() => g.setOpen({ id: e.id, kind: "dellog" })} aria-label="Delete entry">×</button>
                )}
                <span className="sub">{parts.map((p, i) => <span key={i}>{i > 0 && " · "}{p}</span>)}</span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function LogForm() {
  const g = useGarage();
  const def = g.ui.car !== "all" ? g.ui.car : g.cars[0].id;
  return (
    <form className="card" onSubmit={(e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
      g.addLog({ carId: d.carId, title: d.title.trim(), date: d.date || today(), km: num(d.km), cost: num(d.cost), note: (d.note || "").trim() });
    }}>
      <div className="fields">
        <label className="field wide"><span>What was done</span><input name="title" required placeholder="New brake pads, front" autoFocus /></label>
        <label className="field"><span>Car</span>
          <select name="carId" defaultValue={def}>{g.cars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        </label>
        <label className="field"><span>Date</span><input type="date" name="date" defaultValue={today()} required /></label>
        <label className="field"><span>Odometer (km)</span><input name="km" inputMode="numeric" /></label>
        <label className="field"><span>Cost ($)</span><input name="cost" inputMode="decimal" /></label>
      </div>
      <label className="field"><span>Note</span><input name="note" /></label>
      <div className="form-acts">
        <button type="button" className="btn ghost" onClick={g.close}>Cancel</button>
        <button className="btn primary">Save to history</button>
      </div>
    </form>
  );
}
