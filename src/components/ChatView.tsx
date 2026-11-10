"use client";

import { useState } from "react";
import { fmtDate } from "@/lib/dates";
import { Chat } from "./Chat";
import { useGarage } from "./state";

/** Talk to the assistant about one car: something you noticed, a question, tasks to add or change. */
export function ChatView() {
  const g = useGarage();
  const [pick, setPick] = useState<string | null>(null);
  const carId = g.ui.car !== "all" ? g.ui.car : pick && g.carById(pick) ? pick : g.cars[0].id;
  const car = g.carById(carId)!;
  if (!g.owner) {
    return (
      <div className="bar">
        <p className="muted small lede">
          Sign in to talk things through with the assistant: a noise you noticed, a warning light, what a shop is recommending, or tasks to add.
        </p>
        {g.signIn && <button className="btn primary" onClick={g.signIn}>Sign in with Google</button>}
      </div>
    );
  }
  return (
    <>
      <div className="bar">
        <p className="muted small lede">
          Tell the assistant about the <strong>{car.name}</strong>: something you noticed, a question, work you did, or tasks to add or change. It keeps notes so they&apos;re there at your next shop visit.
        </p>
        {g.ui.car === "all" && g.cars.length > 1 && (
          <label className="field picker"><span>About</span>
            <select value={carId} onChange={(e) => setPick(e.target.value)}>
              {g.cars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
      </div>
      <Chat key={carId} thread={{ carId }} placeholder="E.g. a clunk from the front left over bumps since last week" />
      <Notes carId={carId} />
    </>
  );
}

/** The owner's own observations about the car that no visit has dealt with yet. */
function Notes({ carId }: { carId: string }) {
  const g = useGarage();
  const notes = g.data.items.filter((i) => i.carId === carId && !i.visitId).sort((a, b) => b.created.localeCompare(a.created));
  if (!notes.length) return null;
  return (
    <section className="group">
      <div className="group-h"><span className="dot" style={{ background: "var(--soon)" }} /><h2>Your notes</h2><span className="muted small mono">{notes.length}</span></div>
      <div className="list">
        {notes.map((n) => (
          <div key={n.id} className="hist">
            <span className="when">{fmtDate(n.created.slice(0, 10))}</span>
            <span className="title">{n.text}</span>
            <button className="btn ghost sm" onClick={() => g.deleteItem(n.id)} aria-label={`Remove ${n.text}`}>Remove</button>
            {n.note && <span className="sub">{n.note}</span>}
          </div>
        ))}
      </div>
    </section>
  );
}
