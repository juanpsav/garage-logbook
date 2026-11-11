"use client";

import { useState } from "react";
import { daysBetween, fmtDate, fmtKm, fmtMoney, today } from "@/lib/dates";
import { every, repeats, status } from "@/lib/logic";
import type { Car, Data, FileRec, Item, ItemKind, Visit } from "@/lib/types";

type View = "overview" | "documents" | "history";
const VIEWS: [View, string][] = [["overview", "Overview"], ["documents", "Documents"], ["history", "History"]];

/**
 * The garage, read only: what's due, the shop paperwork, and history. Changes happen through the
 * owner's agent. `src` turns a stored file path into a URL.
 */
export function GarageView({ data, src }: { data: Data; src: (path: string) => string }) {
  const cars = [...data.cars].sort((a, b) => a.created.localeCompare(b.created));
  const [carPick, setCar] = useState("all");
  const [view, setView] = useState<View>("overview");
  const [open, setOpen] = useState<string | null>(null);
  const car = carPick !== "all" && cars.some((c) => c.id === carPick) ? carPick : "all";
  const mine = <T extends { carId: string | null }>(x: T) => car === "all" || x.carId === car;
  const shown = cars.filter((c) => car === "all" || c.id === car);
  const carById = (id: string | null) => cars.find((c) => c.id === id);
  const late = data.tasks.filter((t) => mine(t) && status(t, carById(t.carId)).rank === 0).length;
  const go = (v: View, visitId?: string) => { setView(v); setOpen(visitId ?? null); };
  const ctx: Ctx = { data, src, car, carById, multi: cars.length > 1, open, setOpen, go };

  if (!cars.length) return <div className="empty">No cars yet. Ask your agent to add one: “Add my 2019 Subaru Forester, 139 000 km.”</div>;
  return (
    <>
      {cars.length > 1 && (
        <nav className="tabs" aria-label="Car">
          {[["all", cars.length === 2 ? "Both cars" : "All cars"] as const, ...cars.map((c) => [c.id, c.name] as const)].map(([id, n]) => (
            <button key={id} className="tab" aria-pressed={car === id} onClick={() => { setCar(id); setOpen(null); }}>{n}</button>
          ))}
        </nav>
      )}
      <section className="stickers">{shown.map((c) => <Sticker key={c.id} car={c} data={data} />)}</section>
      <nav className="views" aria-label="Section">
        {VIEWS.map(([v, n]) => (
          <button key={v} className="view" aria-pressed={view === v} onClick={() => go(v)}>
            {n}{v === "overview" && late > 0 && <span className="count">{late}</span>}
          </button>
        ))}
      </nav>
      {view === "overview" ? <Overview {...ctx} /> : view === "documents" ? <Documents {...ctx} /> : <History {...ctx} />}
    </>
  );
}

type Ctx = {
  data: Data; src: (p: string) => string; car: string; carById: (id: string | null) => Car | undefined; multi: boolean;
  open: string | null; setOpen: (id: string | null) => void; go: (v: View, visitId?: string) => void;
};

function Sticker({ car, data }: { car: Car; data: Data }) {
  const ts = data.tasks.filter((t) => t.carId === car.id).map((t) => [t, status(t, car)] as const)
    .filter(([, s]) => s.rank < 3).sort((a, b) => a[1].rank - b[1].rank || a[1].key - b[1].key);
  const next = ts[0];
  const lateN = ts.filter(([, s]) => s.rank === 0).length;
  const age = car.kmDate ? daysBetween(car.kmDate, today()) : null;
  return (
    <div className="sticker">
      <div className="row">
        <h3>{car.name}</h3>
        {lateN ? <span className="chip late">{lateN} need{lateN === 1 ? "s" : ""} attention</span> : ts.length ? <span className="chip ok">All good</span> : null}
      </div>
      <div className="odo">
        <span className="lbl">Odometer</span>
        <span className="mono">{car.km != null ? fmtKm(car.km) : "—"}</span>
        {car.kmDate && <span className="muted small">{age != null && age > 30 ? `${age} days ago` : `on ${fmtDate(car.kmDate)}`}</span>}
      </div>
      <div className="next">
        <span className="lbl">Next service</span>
        {next ? (
          <>
            <span className="what">{next[0].title}</span>
            <span className="meta">{next[1].chips.map(([k, t]) => <span key={t} className={`chip ${k}`}>{t}</span>)}</span>
          </>
        ) : <span className="muted small">Nothing scheduled yet.</span>}
      </div>
    </div>
  );
}

const GROUPS = [[0, "Needs attention", "var(--late)"], [1, "Coming up", "var(--soon)"], [2, "Later", "var(--ok)"], [3, "No due date", "var(--line)"]] as const;
const DECISIONS = { pending: "Undecided", accepted: "Going ahead", declined: "Declined", deferred: "Later" } as const;

function Overview({ data, car, carById, multi, go }: Ctx) {
  const inCar = (id: string | null) => car === "all" || id === car;
  const tasks = data.tasks.filter((t) => inCar(t.carId)).map((t) => [t, status(t, carById(t.carId))] as const);
  const visitById = new Map(data.visits.map((v) => [v.id, v]));
  const quotes = data.items.filter((i) => inCar(i.carId) && i.kind === "quoted" && (i.decision === "pending" || i.decision === "deferred"));
  const notes = data.items.filter((i) => inCar(i.carId) && i.source === "you" && !i.visitId).sort((a, b) => b.created.localeCompare(a.created));
  const unfinished = data.visits.filter((v) => inCar(v.carId) && v.status !== "confirmed");
  const carChip = (id: string | null) => multi && car === "all" && carById(id) ? <span className="chip car">{carById(id)!.name}</span> : null;
  return (
    <>
      {!tasks.length && <div className="empty">Nothing tracked yet. Ask your agent which checks to track for your car.</div>}
      {GROUPS.map(([r, name, color]) => {
        const grp = tasks.filter(([, s]) => s.rank === r).sort((a, b) => a[1].key - b[1].key || a[0].title.localeCompare(b[0].title));
        if (!grp.length) return null;
        return (
          <section className="group" key={r}>
            <div className="group-h"><span className="dot" style={{ background: color }} /><h2>{name}</h2><span className="muted small mono">{grp.length}</span></div>
            <div className="list">
              {grp.map(([t, s]) => {
                const from = t.visitId ? visitById.get(t.visitId) : undefined;
                return (
                  <div key={t.id} className={`item ${s.cls}`}>
                    <div className="stripe" />
                    <div className="body">
                      <span className="title">{t.title}</span>
                      <span className="meta">
                        {carChip(t.carId)}
                        {s.chips.map(([k, x]) => <span key={x} className={`chip ${k}`}>{x}</span>)}
                        {repeats(t) && <span className="muted">{every(t)}</span>}
                        {from && <button className="chip" onClick={() => go("documents", from.id)}>From {from.title || "a visit"}</button>}
                      </span>
                      {t.notes && <span className="notes">{t.notes}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      {quotes.length > 0 && (
        <section className="group">
          <div className="group-h"><span className="dot" style={{ background: "var(--soon)" }} /><h2>Quotes waiting on you</h2><span className="muted small mono">{quotes.length}</span></div>
          <div className="list">
            {quotes.map((q) => {
              const v = q.visitId ? visitById.get(q.visitId) : undefined;
              return (
                <div key={q.id} className="hist">
                  <span className="when">{v?.date ? fmtDate(v.date) : ""}</span>
                  <span className="title">{q.text}</span>
                  <span className="mono">{q.cost != null ? fmtMoney(q.cost) : ""}</span>
                  <span className="sub">
                    {[multi && car === "all" ? carById(q.carId)?.name : null, v?.shop, DECISIONS[q.decision ?? "pending"], q.note].filter(Boolean).join(" · ")}
                    {v && <> · <button className="link" onClick={() => go("documents", v.id)}>See the paperwork</button></>}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
      {notes.length > 0 && (
        <section className="group">
          <div className="group-h"><span className="dot" style={{ background: "var(--accent)" }} /><h2>Your notes</h2><span className="muted small mono">{notes.length}</span></div>
          <div className="list">
            {notes.map((n) => (
              <div key={n.id} className="hist">
                <span className="when">{fmtDate(n.created.slice(0, 10))}</span>
                <span className="title">{n.text}</span>
                <span />
                {(n.note || (multi && car === "all")) && <span className="sub">{[multi && car === "all" ? carById(n.carId)?.name : null, n.note].filter(Boolean).join(" · ")}</span>}
              </div>
            ))}
          </div>
        </section>
      )}
      {unfinished.length > 0 && (
        <p className="muted small">
          {unfinished.length === 1 ? "1 visit is" : `${unfinished.length} visits are`} still being gone through with your agent.{" "}
          <button className="link" onClick={() => go("documents", unfinished[0].id)}>See {unfinished.length === 1 ? "it" : "them"}</button>
        </p>
      )}
    </>
  );
}

const day = (v: Visit) => v.date || v.created.slice(0, 10);

/** Every shop visit with its paperwork: the document store. */
function Documents(c: Ctx) {
  const { data, car } = c;
  const visits = data.visits
    .filter((v) => car === "all" || !v.carId || v.carId === car)
    .filter((v) => data.files.some((f) => f.visitId === v.id) || data.items.some((i) => i.visitId === v.id && i.source === "shop"))
    .sort((a, b) => day(b).localeCompare(day(a)) || b.created.localeCompare(a.created));
  if (!visits.length) return <div className="empty">No shop paperwork yet. Next time you get an invoice, quote or inspection sheet, tell your agent and it&apos;ll give you a link to upload the pages.</div>;
  return <div className="docs">{visits.map((v) => <VisitCard key={v.id} visit={v} {...c} />)}</div>;
}

function VisitCard({ visit: v, data, src, carById, multi, open, setOpen }: Ctx & { visit: Visit }) {
  const isOpen = open === v.id;
  const files = data.files.filter((f) => f.visitId === v.id).sort((a, b) => a.position - b.position);
  const items = data.items.filter((i) => i.visitId === v.id);
  const car = carById(v.carId);
  return (
    <div className="doc">
      <button className="doc-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : v.id)}>
        <Thumb file={files[0]} src={src} />
        <span className="doc-sum">
          <span className="title">{v.title || "Shop visit"}</span>
          <span className="meta">
            {car && multi && <span className="chip car">{car.name}</span>}
            {v.date && <span className="chip">{fmtDate(v.date)}</span>}
            {v.total != null && <span className="chip">{fmtMoney(v.total)}</span>}
            {files.length > 0 && <span className="chip">{files.length === 1 ? "1 page" : `${files.length} pages`}</span>}
            {v.status !== "confirmed" && <span className="chip soon">In progress</span>}
          </span>
        </span>
        <span className="muted" aria-hidden="true">{isOpen ? "▴" : "▾"}</span>
      </button>
      {isOpen && (
        <div className="doc-body">
          {files.length > 0 && <div className="pages">{files.map((f, i) => <Page key={f.id} file={f} n={i + 1} src={src} />)}</div>}
          {files.length > 0 && <p className="hint">Tap a page to open the original as uploaded.</p>}
          <Lines visit={v} items={items} car={car} />
        </div>
      )}
    </div>
  );
}

function Thumb({ file, src }: { file: FileRec | undefined; src: (p: string) => string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return file?.view ? <img className="thumb" src={src(file.view)} alt="" loading="lazy" /> : <span className="thumb">{file ? "PDF" : "—"}</span>;
}

function Page({ file, n, src }: { file: FileRec; n: number; src: (p: string) => string }) {
  if (!file.view) return <a className="pdf" href={src(file.orig)} target="_blank" rel="noopener">Open PDF</a>;
  // eslint-disable-next-line @next/next/no-img-element
  return <a href={src(file.orig)} target="_blank" rel="noopener" title={file.name ?? `Page ${n}`}><img src={src(file.view)} alt={`Page ${n}`} loading="lazy" /></a>;
}

const KINDS: [ItemKind, string][] = [["done", "Done"], ["found", "Found"], ["quoted", "Quoted"]];

function Lines({ visit: v, items, car }: { visit: Visit; items: Item[]; car: Car | undefined }) {
  const facts = [car?.name, v.shop, v.km != null && fmtKm(v.km), v.total != null && `Total ${fmtMoney(v.total)}`].filter(Boolean);
  return (
    <>
      {facts.length > 0 && <div className="meta small muted">{facts.join(" · ")}</div>}
      {v.summary && <p className="flush">{v.summary}</p>}
      {KINDS.map(([k, name]) => {
        const list = items.filter((i) => i.kind === k);
        if (!list.length) return null;
        const sum = list.reduce((s, i) => s + (i.cost ?? 0), 0);
        return (
          <div key={k} className="sect"><h3>{name}{sum > 0 && <span className="muted"> · {fmtMoney(sum)}</span>}</h3>
            <div className="lines">
              {list.map((i) => (
                <div key={i.id} className="line">
                  <span className="t">
                    {i.text}
                    {i.unsure && <span className="chip soon">Unclear</span>}
                    {i.decision && k !== "done" && <span className="chip">{DECISIONS[i.decision]}</span>}
                    {i.source === "you" && <span className="chip">Your note</span>}
                  </span>
                  <span className="c">{i.cost != null ? fmtMoney(i.cost) : ""}</span>
                  {(i.original || i.note) && (
                    <span className="sub">
                      {i.original && <span className="orig">“{i.original}”</span>}
                      {i.original && i.note && " · "}
                      {i.note}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

function History({ data, car, carById, multi, go }: Ctx) {
  const entries = data.visits
    .filter((v) => v.status === "confirmed" && (car === "all" || v.carId === car))
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.created.localeCompare(a.created));
  const done = (id: string) => data.items.filter((i) => i.visitId === id && i.kind === "done");
  const cost = (v: Visit) => v.total ?? (done(v.id).reduce((s, i) => s + (i.cost ?? 0), 0) || null);
  const yr = today().slice(0, 4);
  const spent = entries.filter((e) => e.date?.startsWith(yr)).reduce((s, e) => s + (cost(e) || 0), 0);
  if (!entries.length) return <div className="empty">No history yet. Work you tell your agent about, and shop visits you go through with it, show up here.</div>;
  return (
    <section className="group">
      <div className="group-h">
        <span className="dot" style={{ background: "var(--muted)" }} /><h2>Done</h2><span className="muted small mono">{entries.length}</span>
        {spent > 0 && <span className="muted small push-r"><span className="mono">{fmtMoney(spent)}</span> in {yr}</span>}
      </div>
      <div className="list">
        {entries.map((e) => {
          const lines = done(e.id);
          const hasPaper = data.files.some((f) => f.visitId === e.id);
          const c = cost(e);
          return (
            <div key={e.id} className="hist">
              <span className="when">{e.date ? fmtDate(e.date) : ""}</span>
              <span className="title">{e.title}</span>
              {hasPaper ? <button className="btn ghost sm" onClick={() => go("documents", e.id)}>Paperwork</button> : <span />}
              <span className="sub">
                {[multi && car === "all" ? carById(e.carId)?.name : null, e.km != null ? fmtKm(e.km) : null, c ? fmtMoney(c) : null, e.shop,
                  lines.length > 1 ? lines.map((l) => l.text).join(", ") : lines[0]?.note].filter(Boolean).join(" · ")}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
