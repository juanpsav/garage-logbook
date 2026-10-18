"use client";

import { useEffect, useState } from "react";
import { acceptable } from "@/lib/files";
import { status } from "@/lib/logic";
import { CarsView, Welcome } from "./CarsView";
import { DocsView } from "./DocsView";
import { useGarage, type View } from "./state";
import { HistoryView } from "./HistoryView";
import { Sticker } from "./Sticker";
import { SuggestedView } from "./SuggestedView";
import { TodoView } from "./TodoView";

const VIEWS: [View, string][] = [["todo", "To do"], ["suggested", "Suggested"], ["docs", "Documents"], ["history", "History"], ["cars", "Cars"]];

export function App({ account }: { account: React.ReactNode }) {
  const g = useGarage();
  const { ui, cars, data } = g;
  const [dropping, setDropping] = useState(false);

  // Paste a screenshot while on Documents.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (ui.view !== "docs" || (e.target as HTMLElement)?.closest?.("input,textarea")) return;
      const fl = [...(e.clipboardData?.files ?? [])].filter(acceptable);
      if (!fl.length) return;
      e.preventDefault();
      g.handleFiles(fl);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [ui.view, g]);

  const carFilter = ui.car !== "all" && !g.carById(ui.car) ? "all" : ui.car;
  const lateCount = data.tasks.filter((t) => g.carById(t.carId) && (carFilter === "all" || t.carId === carFilter) && status(t, g.carById(t.carId)).rank === 0).length;

  const Body = { todo: TodoView, suggested: SuggestedView, docs: DocsView, history: HistoryView, cars: CarsView }[ui.view];

  return (
    <>
      <div
        className={`wrap${dropping ? " dropping" : ""}`}
        onDragOver={(e) => { if (!e.dataTransfer.types.includes("Files") || !cars.length) return; e.preventDefault(); setDropping(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropping(false); }}
        onDrop={(e) => {
          setDropping(false);
          const fl = [...e.dataTransfer.files].filter(acceptable);
          if (!fl.length || !cars.length) return;
          e.preventDefault();
          g.handleFiles(fl);
        }}
      >
        <header className="top">
          <h1>Garage Logbook</h1>
          <div className="top-acts">
            {cars.length > 0 && <button className="btn ghost sm" onClick={() => g.setView("cars")}>Manage cars</button>}
            {account}
          </div>
        </header>

        {!g.loaded ? (
          <p className="muted">Loading your garage…</p>
        ) : !cars.length ? (
          <Welcome />
        ) : (
          <>
            {cars.length > 1 && (
              <nav className="tabs" aria-label="Car">
                {[["all", "Both cars"] as const, ...cars.map((c) => [c.id, c.name] as const)].map(([id, n]) => (
                  <button key={id} className="tab" aria-pressed={carFilter === id} onClick={() => g.setCar(id)}>{n}</button>
                ))}
              </nav>
            )}
            <section className="stickers">
              {cars.filter((c) => carFilter === "all" || c.id === carFilter).map((c) => <Sticker key={c.id} car={c} />)}
            </section>
            <nav className="views" aria-label="Section">
              {VIEWS.map(([v, n]) => (
                <button key={v} className="view" aria-pressed={ui.view === v} onClick={() => g.setView(v)}>
                  {n}{v === "todo" && lateCount > 0 && <span className="count">{lateCount}</span>}
                </button>
              ))}
            </nav>
            <Body />
          </>
        )}
        <div id="turnstile-slot" />
      </div>
      {ui.toastMsg && <div className="toast" role="status">{ui.toastMsg}</div>}
    </>
  );
}
