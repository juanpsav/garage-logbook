"use client";

import { useState } from "react";
import { daysBetween, fmtDate, fmtKm, fmtMoney, num, today } from "@/lib/dates";
import { every, intervalLabel, repeats, scheduleFor, status } from "@/lib/logic";
import type { Car, Data, FileRec, Item, ItemKind, Schedule, Task, Visit } from "@/lib/types";
import { carFields, type Editor, markDone, money, QuickForm } from "./Edit";

type View = "overview" | "schedule" | "documents" | "history";
const VIEWS: [View, string][] = [["overview", "Overview"], ["schedule", "Schedule"], ["documents", "Documents"], ["history", "History"]];

type Ctx = {
  data: Data; schedules: Schedule[]; src: (p: string) => string; car: string; cars: Car[];
  carById: (id: string | null) => Car | undefined; multi: boolean;
  open: string | null; setOpen: (id: string | null) => void; go: (v: View, visitId?: string) => void;
  /** Quick edits, signed in only. `editing` names the one form that's open. */
  edit?: Editor; editing: string | null; setEditing: (k: string | null) => void;
};

/**
 * The garage: what's due, the manufacturer schedule, the shop paperwork, and history. Signed in, small
 * fixes can be made here (`edit`); everything else goes through the owner's agent. `src` turns a stored
 * file path into a URL.
 */
export function GarageView({ data, schedules, src, edit }: { data: Data; schedules: Schedule[]; src: (path: string) => string; edit?: Editor }) {
  const all = [...data.cars].sort((a, b) => a.created.localeCompare(b.created));
  const [carPick, setCar] = useState("all");
  const [view, setView] = useState<View>("overview");
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const car = carPick !== "all" && all.some((c) => c.id === carPick) ? carPick : "all";
  const cars = all.filter((c) => car === "all" || c.id === car);
  const carById = (id: string | null) => all.find((c) => c.id === id);
  const late = data.tasks.filter((t) => (car === "all" || t.carId === car) && status(t, carById(t.carId)).rank === 0).length;
  const go = (v: View, visitId?: string) => { setView(v); setOpen(visitId ?? null); setEditing(null); };
  const ctx: Ctx = { data, schedules, src, car, cars, carById, multi: all.length > 1, open, setOpen, go, edit, editing, setEditing };

  if (!all.length) return <div className="empty">No cars yet. Ask your agent to add one.</div>;
  return (
    <>
      {all.length > 1 && (
        <nav className="pills" aria-label="Car">
          {[["all", all.length === 2 ? "Both cars" : "All cars"] as const, ...all.map((c) => [c.id, c.name] as const)].map(([id, n]) => (
            <button key={id} className="pill" aria-pressed={car === id} onClick={() => { setCar(id); setOpen(null); setEditing(null); }}>{n}</button>
          ))}
        </nav>
      )}
      <section className="heroes">{cars.map((c) => <Hero key={c.id} {...ctx} theCar={c} />)}</section>
      <nav className="seg" aria-label="Section">
        {VIEWS.map(([v, n]) => (
          <button key={v} aria-pressed={view === v} onClick={() => go(v)}>
            {n}{v === "overview" && late > 0 && <span className="count">{late}</span>}
          </button>
        ))}
      </nav>
      {view === "overview" ? <Overview {...ctx} /> : view === "schedule" ? <ScheduleView {...ctx} /> : view === "documents" ? <Documents {...ctx} /> : <History {...ctx} />}
    </>
  );
}

/** A small text button that opens one quick-edit form. */
function EditBtn({ k, label = "Edit", setEditing }: { k: string; label?: string; setEditing: (k: string | null) => void }) {
  return <button className="btn sm ghost" onClick={() => setEditing(k)}>{label}</button>;
}

/* ---------- car summary ---------- */

function Hero({ theCar: car, data, edit, editing, setEditing }: Ctx & { theCar: Car }) {
  const ts = data.tasks.filter((t) => t.carId === car.id).map((t) => [t, status(t, car)] as const)
    .filter(([, s]) => s.rank < 3).sort((a, b) => a[1].rank - b[1].rank || a[1].key - b[1].key);
  const next = ts[0];
  const lateN = ts.filter(([, s]) => s.rank === 0).length;
  const age = car.kmDate ? daysBetween(car.kmDate, today()) : null;
  const k = `car:${car.id}`;
  return (
    <div className="hero">
      <div className="hero-top">
        <h2 className="car-name">{car.name}</h2>
        <span className="hero-acts">
          {lateN ? <span className="chip late">{lateN} need{lateN === 1 ? "s" : ""} attention</span> : ts.length ? <span className="chip ok">All good</span> : null}
          {edit && editing !== k && <EditBtn k={k} setEditing={setEditing} />}
        </span>
      </div>
      {edit && editing === k ? (
        <QuickForm fields={carFields(car)} onCancel={() => setEditing(null)} onSave={async (v) => {
          const km = num(v.km);
          await edit.put("cars", { ...car, name: v.name.trim() || car.name, km: km ?? car.km, kmDate: km != null && km !== car.km ? today() : car.kmDate });
          setEditing(null);
        }} />
      ) : (
        <div className="hero-grid">
          <div>
            <span className="lbl">Odometer</span>
            <span className="big mono">{car.km != null ? fmtKm(car.km) : "—"}</span>
            {car.kmDate && <span className={`muted small${age != null && age > 45 ? " stale" : ""}`}>{age === 0 ? "today" : age != null && age < 45 ? `${age} days ago` : `on ${fmtDate(car.kmDate)}`}</span>}
          </div>
          <div>
            <span className="lbl">Next service</span>
            {next ? (
              <>
                <span className="what">{next[0].title}</span>
                <span className="chips">{next[1].chips.map(([kk, t]) => <span key={t} className={`chip ${kk}`}>{t}</span>)}</span>
              </>
            ) : <span className="muted small">Nothing scheduled yet.</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, count, tone, children, aside }: { title: string; count?: number; tone?: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="section">
      <div className="section-h">
        {tone && <span className={`dot ${tone}`} />}
        <h3>{title}</h3>
        {count != null && <span className="muted mono">{count}</span>}
        {aside && <span className="aside">{aside}</span>}
      </div>
      <div className="panel">{children}</div>
    </section>
  );
}

/* ---------- overview ---------- */

const GROUPS = [[0, "Needs attention", "late"], [1, "Coming up", "soon"], [2, "Later", "ok"], [3, "No due date", "none"]] as const;
const DECISIONS = { pending: "Undecided", accepted: "Going ahead", declined: "Declined", deferred: "Later" } as const;
const DECISION_OPTIONS = Object.entries(DECISIONS) as [string, string][];

function TaskRow({ t, s, from, ...c }: Ctx & { t: Task; s: ReturnType<typeof status>; from: Visit | undefined }) {
  const { edit, editing, setEditing, data, go, multi, car, carById } = c;
  const carName = multi && car === "all" ? carById(t.carId)?.name : null;
  if (edit && editing === `done:${t.id}`) {
    const theCar = carById(t.carId);
    return (
      <div className="row editing">
        <div className="row-main">
          <span className="title">{t.title}</span>
          <QuickForm saveLabel="Mark done" onCancel={() => setEditing(null)}
            fields={[
              { name: "date", label: "Date", type: "date", value: today(), required: true },
              { name: "km", label: "Odometer (km)", type: "number", value: theCar?.km },
              { name: "cost", label: "Cost ($)", type: "money", value: null },
              { name: "shop", label: "Shop", type: "text", value: null, placeholder: "Optional" },
              { name: "note", label: "Note", type: "text", value: null, wide: true, placeholder: "Optional" },
            ]}
            onSave={async (v) => { await markDone(edit, data, t, v); setEditing(null); }} />
          
        </div>
      </div>
    );
  }
  if (edit && editing === `task:${t.id}`) {
    return (
      <div className="row editing">
        <div className="row-main">
          <QuickForm onCancel={() => setEditing(null)} deleteLabel="Delete task"
            fields={[
              { name: "title", label: "Task", type: "text", value: t.title, wide: true, required: true },
              { name: "dueDate", label: "Due date", type: "date", value: t.dueDate },
              { name: "dueKm", label: "Due at km", type: "number", value: t.dueKm },
              { name: "everyMonths", label: "Repeat every (months)", type: "number", value: t.everyMonths },
              { name: "everyKm", label: "Repeat every (km)", type: "number", value: t.everyKm },
              { name: "notes", label: "Notes", type: "textarea", value: t.notes },
            ]}
            onSave={async (v) => {
              await edit.put("tasks", { ...t, title: v.title.trim() || t.title, dueDate: v.dueDate || null, dueKm: num(v.dueKm), everyMonths: num(v.everyMonths), everyKm: num(v.everyKm), notes: v.notes.trim() });
              setEditing(null);
            }}
            onDelete={async () => { await edit.del("tasks", t.id); setEditing(null); }} />
        </div>
      </div>
    );
  }
  return (
    <div className="row">
      <div className="row-main">
        <span className="title">{t.title}</span>
        <span className="meta">
          {[carName, repeats(t) ? every(t) : null, t.sugKey?.startsWith("m-") ? "Manufacturer schedule" : null].filter(Boolean).join(" · ")}
          {from && <>{(carName || repeats(t)) && " · "}<button className="link" onClick={() => go("documents", from.id)}>From {from.title || "a visit"}</button></>}
        </span>
        {t.notes && <span className="notes">{t.notes}</span>}
        {edit && (
          <span className="row-acts">
            <button className="btn sm" onClick={() => setEditing(`done:${t.id}`)}>Done</button>
            <EditBtn k={`task:${t.id}`} setEditing={setEditing} />
          </span>
        )}
      </div>
      <span className="chips end">{s.chips.map(([k, x]) => <span key={x} className={`chip ${k}`}>{x}</span>)}</span>
    </div>
  );
}

function Overview(c: Ctx) {
  const { data, schedules, car, cars, carById, multi, go, edit } = c;
  const inCar = (id: string | null) => car === "all" || id === car;
  const tasks = data.tasks.filter((t) => inCar(t.carId)).map((t) => [t, status(t, carById(t.carId))] as const);
  const visitById = new Map(data.visits.map((v) => [v.id, v]));
  const quotes = data.items.filter((i) => inCar(i.carId) && i.kind === "quoted" && (i.decision === "pending" || i.decision === "deferred"));
  const notes = data.items.filter((i) => inCar(i.carId) && i.source === "you" && !i.visitId).sort((a, b) => b.created.localeCompare(a.created));
  const unfinished = data.visits.filter((v) => inCar(v.carId) && v.status !== "confirmed");
  const carName = (id: string | null) => (multi && car === "all" ? carById(id)?.name : null);
  const untracked = cars.reduce((n, cc) => {
    const sc = scheduleFor(cc, schedules);
    const keys = new Set(data.tasks.filter((t) => t.carId === cc.id).map((t) => t.sugKey));
    return n + (sc ? sc.items.filter((i) => !keys.has(i.key)).length : 0);
  }, 0);
  return (
    <>
      {!tasks.length && <div className="empty">Nothing tracked yet.</div>}
      {GROUPS.map(([r, name, tone]) => {
        const grp = tasks.filter(([, s]) => s.rank === r).sort((a, b) => a[1].key - b[1].key || a[0].title.localeCompare(b[0].title));
        if (!grp.length) return null;
        return (
          <Section key={r} title={name} count={grp.length} tone={tone}>
            {grp.map(([t, s]) => <TaskRow key={t.id} t={t} s={s} from={t.visitId ? visitById.get(t.visitId) : undefined} {...c} />)}
          </Section>
        );
      })}
      {untracked > 0 && (
        <p className="note-line">
          {untracked} schedule item{untracked === 1 ? "" : "s"} not tracked.{" "}
          <button className="link" onClick={() => go("schedule")}>Schedule</button>
        </p>
      )}
      {quotes.length > 0 && (
        <Section title="Quotes waiting on you" count={quotes.length} tone="soon">
          {quotes.map((q) => {
            const v = q.visitId ? visitById.get(q.visitId) : undefined;
            return (
              <div key={q.id} className="row">
                <div className="row-main">
                  <span className="title">{q.text}</span>
                  <span className="meta">
                    {[carName(q.carId), v?.shop, v?.date ? fmtDate(v.date) : null, edit ? null : DECISIONS[q.decision ?? "pending"]].filter(Boolean).join(" · ")}
                    {v && <> · <button className="link" onClick={() => go("documents", v.id)}>Paperwork</button></>}
                  </span>
                  {q.note && <span className="notes">{q.note}</span>}
                  {edit && (
                    <span className="row-acts">
                      <select className="dec" value={q.decision ?? "pending"} aria-label={`Decision on ${q.text}`} onChange={(e) => edit.put("items", { ...q, decision: e.target.value as Item["decision"] })}>
                        {DECISION_OPTIONS.map(([d, l]) => <option key={d} value={d}>{l}</option>)}
                      </select>
                    </span>
                  )}
                </div>
                <span className="amount mono">{q.cost != null ? fmtMoney(q.cost) : ""}</span>
              </div>
            );
          })}
        </Section>
      )}
      {notes.length > 0 && (
        <Section title="Your notes" count={notes.length} tone="note">
          {notes.map((n) => (
            <div key={n.id} className="row">
              <div className="row-main">
                <span className="title">{n.text}</span>
                <span className="meta">{[carName(n.carId), fmtDate(n.created.slice(0, 10))].filter(Boolean).join(" · ")}</span>
                {n.note && <span className="notes">{n.note}</span>}
              </div>
              {edit && <button className="btn sm ghost" onClick={() => edit.del("items", n.id)}>Resolved</button>}
            </div>
          ))}
        </Section>
      )}
      {unfinished.length > 0 && (
        <p className="note-line">
          {unfinished.length === 1 ? "1 visit" : `${unfinished.length} visits`} in progress.{" "}
          <button className="link" onClick={() => go("documents", unfinished[0].id)}>Open</button>
        </p>
      )}
    </>
  );
}

/* ---------- manufacturer schedule ---------- */

/** The official schedule each car follows, and which of its items are tracked as reminders. */
function ScheduleView({ data, schedules, cars, multi }: Ctx) {
  return (
    <>
      {cars.map((c) => {
        const sc = scheduleFor(c, schedules);
        const tasks = data.tasks.filter((t) => t.carId === c.id);
        if (!sc) {
          return (
            <div key={c.id} className="empty">
              {multi ? <><strong>{c.name}</strong>: no </> : "No "}manufacturer schedule yet.
            </div>
          );
        }
        const tracked = sc.items.filter((i) => tasks.some((t) => t.sugKey === i.key)).length;
        return (
          <Section key={c.id} title={multi ? c.name : "Manufacturer schedule"} aside={<span className="muted">{tracked} of {sc.items.length} tracked</span>}>
            <div className="sched-head">
              <span className="title">{sc.name}</span>
              <span className="meta">{sc.sourceUrl ? <a href={sc.sourceUrl} target="_blank" rel="noopener">{sc.source} ↗</a> : sc.source}</span>
              {sc.note && <span className="notes">{sc.note}</span>}
            </div>
            {sc.items.map((i) => {
              const t = tasks.find((x) => x.sugKey === i.key);
              const s = t ? status(t, c) : null;
              return (
                <div key={i.key} className={`row${t ? "" : " dim"}`}>
                  <div className="row-main">
                    <span className="title">{i.title}</span>
                    <span className="meta">{intervalLabel(i)}</span>
                    {i.why && <span className="notes">{i.why}</span>}
                  </div>
                  <span className="chips end">
                    {s ? s.chips.slice(0, 1).map(([k, x]) => <span key={x} className={`chip ${k}`}>{x}</span>) : <span className="chip">Not tracked</span>}
                  </span>
                </div>
              );
            })}
          </Section>
        );
      })}
      {cars.some((c) => scheduleFor(c, schedules)) && <p className="note-line">Only tracked items send reminders.</p>}
    </>
  );
}

/* ---------- documents ---------- */

const day = (v: Visit) => v.date || v.created.slice(0, 10);

/** Every shop visit with its paperwork: the document store. */
function Documents(c: Ctx) {
  const { data, car } = c;
  const visits = data.visits
    .filter((v) => car === "all" || !v.carId || v.carId === car)
    .filter((v) => data.files.some((f) => f.visitId === v.id) || data.items.some((i) => i.visitId === v.id && i.source === "shop"))
    .sort((a, b) => day(b).localeCompare(day(a)) || b.created.localeCompare(a.created));
  if (!visits.length) return <div className="empty">No paperwork yet.</div>;
  return <div className="docs">{visits.map((v) => <VisitCard key={v.id} visit={v} {...c} />)}</div>;
}

function VisitCard(c: Ctx & { visit: Visit }) {
  const { visit: v, data, src, carById, multi, open, setOpen, edit, editing, setEditing } = c;
  const isOpen = open === v.id;
  const files = data.files.filter((f) => f.visitId === v.id).sort((a, b) => a.position - b.position);
  const items = data.items.filter((i) => i.visitId === v.id);
  const car = carById(v.carId);
  const k = `visit:${v.id}`;
  return (
    <div className={`doc${isOpen ? " open" : ""}`}>
      <button className="doc-head" aria-expanded={isOpen} onClick={() => { setOpen(isOpen ? null : v.id); setEditing(null); }}>
        <Thumb file={files[0]} src={src} />
        <span className="doc-sum">
          <span className="title">{v.title || "Shop visit"}</span>
          <span className="meta">
            {[car && multi ? car.name : null, v.date ? fmtDate(v.date) : null, v.shop, files.length ? (files.length === 1 ? "1 page" : `${files.length} pages`) : null].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="doc-end">
          {v.total != null && <span className="amount mono">{fmtMoney(v.total)}</span>}
          {v.status !== "confirmed" && <span className="chip soon">In progress</span>}
          <span className="caret" aria-hidden="true" />
        </span>
      </button>
      {isOpen && (
        <div className="doc-body">
          {files.length > 0 && <div className="pages">{files.map((f, i) => <Page key={f.id} file={f} n={i + 1} src={src} />)}</div>}
          {files.length > 0 && <p className="hint">Tap a page for the original.</p>}
          {edit && editing === k ? (
            <QuickForm onCancel={() => setEditing(null)} deleteLabel="Delete visit"
              fields={[
                { name: "title", label: "Title", type: "text", value: v.title, wide: true, required: true },
                { name: "carId", label: "Car", type: "select", value: v.carId ?? "", options: [["", "None"], ...[...data.cars].map((cc) => [cc.id, cc.name] as [string, string])] },
                { name: "date", label: "Date", type: "date", value: v.date },
                { name: "km", label: "Odometer (km)", type: "number", value: v.km },
                { name: "shop", label: "Shop", type: "text", value: v.shop },
                { name: "total", label: "Total ($)", type: "money", value: v.total },
                { name: "summary", label: "Summary", type: "textarea", value: v.summary },
              ]}
              onSave={async (f) => {
                const carId = f.carId || null;
                await edit.put("visits", { ...v, title: f.title.trim(), carId, date: f.date || null, km: num(f.km), shop: f.shop.trim() || null, total: money(f.total), summary: f.summary.trim() || null });
                // Lines follow the visit's car.
                if (carId !== v.carId) for (const it of items) await edit.put("items", { ...it, carId });
                setEditing(null);
              }}
              onDelete={async () => { await edit.del("visits", v.id); setEditing(null); setOpen(null); }} />
          ) : (
            <Lines {...c} visit={v} items={items} visitCar={car} />
          )}
          {edit && editing !== k && <div className="qacts"><span className="grow" /><EditBtn k={k} label="Edit details" setEditing={setEditing} /></div>}
        </div>
      )}
    </div>
  );
}

function Thumb({ file, src }: { file: FileRec | undefined; src: (p: string) => string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return file?.view ? <img className="thumb" src={src(file.view)} alt="" loading="lazy" /> : <span className="thumb">{file ? "PDF" : ""}</span>;
}

function Page({ file, n, src }: { file: FileRec; n: number; src: (p: string) => string }) {
  if (!file.view) return <a className="pdf" href={src(file.orig)} target="_blank" rel="noopener">Open PDF</a>;
  // eslint-disable-next-line @next/next/no-img-element
  return <a href={src(file.orig)} target="_blank" rel="noopener" title={file.name ?? `Page ${n}`}><img src={src(file.view)} alt={`Page ${n}`} loading="lazy" /></a>;
}

const KINDS: [ItemKind, string][] = [["done", "Done"], ["found", "Found"], ["quoted", "Quoted"]];

function Lines({ visit: v, items, visitCar: car, edit, editing, setEditing }: Ctx & { visit: Visit; items: Item[]; visitCar: Car | undefined }) {
  const facts = [car?.name, v.shop, v.km != null && fmtKm(v.km), v.total != null && `Total ${fmtMoney(v.total)}`].filter(Boolean);
  return (
    <>
      {facts.length > 0 && <div className="meta">{facts.join(" · ")}</div>}
      {v.summary && <p className="flush">{v.summary}</p>}
      {KINDS.map(([k, name]) => {
        const list = items.filter((i) => i.kind === k);
        if (!list.length) return null;
        const sum = list.reduce((s, i) => s + (i.cost ?? 0), 0);
        return (
          <div key={k} className="sect"><h4>{name}{sum > 0 && <span className="muted"> · {fmtMoney(sum)}</span>}</h4>
            <div className="lines">
              {list.map((i) => edit && editing === `item:${i.id}` ? (
                <div key={i.id} className="line editing">
                  <QuickForm onCancel={() => setEditing(null)} deleteLabel="Delete line"
                    fields={[
                      { name: "text", label: "What", type: "text", value: i.text, wide: true, required: true },
                      { name: "kind", label: "Kind", type: "select", value: i.kind, options: [["done", "Done"], ["found", "Found"], ["quoted", "Quoted"]] },
                      { name: "cost", label: "Cost ($)", type: "money", value: i.cost },
                      ...(i.kind !== "done" ? [{ name: "decision", label: "Decision", type: "select" as const, value: i.decision ?? "pending", options: DECISION_OPTIONS }] : []),
                      { name: "note", label: "Note", type: "textarea", value: i.note },
                    ]}
                    onSave={async (f) => {
                      const kind = f.kind as ItemKind;
                      await edit.put("items", { ...i, text: f.text.trim(), kind, cost: money(f.cost), note: f.note.trim() || null, unsure: false,
                        decision: kind === "done" ? null : ((f.decision as Item["decision"]) ?? i.decision ?? "pending") });
                      setEditing(null);
                    }}
                    onDelete={async () => { await edit.del("items", i.id); setEditing(null); }} />
                </div>
              ) : (
                <div key={i.id} className={`line${edit ? " editable" : ""}`} onClick={edit ? () => setEditing(`item:${i.id}`) : undefined} title={edit ? "Edit this line" : undefined}>
                  <span className="t">
                    {i.text}
                    {i.unsure && <span className="chip soon">Unclear</span>}
                    {i.decision && k !== "done" && <span className="chip">{DECISIONS[i.decision]}</span>}
                    {i.source === "you" && <span className="chip">Your note</span>}
                  </span>
                  <span className="c mono">{i.cost != null ? fmtMoney(i.cost) : ""}</span>
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
      {edit && items.length > 0 && <p className="hint">Tap a line to edit.</p>}
    </>
  );
}

/* ---------- history ---------- */

function History({ data, car, carById, multi, go, edit, editing, setEditing }: Ctx) {
  const entries = data.visits
    .filter((v) => v.status === "confirmed" && (car === "all" || v.carId === car))
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.created.localeCompare(a.created));
  const done = (id: string) => data.items.filter((i) => i.visitId === id && i.kind === "done");
  const cost = (v: Visit) => v.total ?? (done(v.id).reduce((s, i) => s + (i.cost ?? 0), 0) || null);
  const yr = today().slice(0, 4);
  const spent = entries.filter((e) => e.date?.startsWith(yr)).reduce((s, e) => s + (cost(e) || 0), 0);
  if (!entries.length) return <div className="empty">No history yet.</div>;
  return (
    <Section title="Done" count={entries.length} aside={spent > 0 ? <span className="muted"><span className="mono">{fmtMoney(spent)}</span> in {yr}</span> : null}>
      {entries.map((e) => {
        const lines = done(e.id);
        const hasPaper = data.files.some((f) => f.visitId === e.id) || data.items.some((i) => i.visitId === e.id && i.source === "shop");
        const c = cost(e);
        const k = `hist:${e.id}`;
        if (edit && editing === k) {
          const line = lines.length === 1 ? lines[0] : undefined;
          return (
            <div key={e.id} className="row editing">
              <div className="row-main">
                <QuickForm onCancel={() => setEditing(null)} deleteLabel="Delete entry"
                  fields={[
                    { name: "title", label: "What was done", type: "text", value: e.title, wide: true, required: true },
                    { name: "date", label: "Date", type: "date", value: e.date, required: true },
                    { name: "km", label: "Odometer (km)", type: "number", value: e.km },
                    { name: "cost", label: "Cost ($)", type: "money", value: e.total ?? line?.cost },
                    { name: "note", label: "Note", type: "text", value: line?.note, wide: true },
                  ]}
                  onSave={async (f) => {
                    const total = money(f.cost);
                    await edit.put("visits", { ...e, title: f.title.trim(), date: f.date || e.date, km: num(f.km), total });
                    if (line) await edit.put("items", { ...line, text: f.title.trim(), cost: total, note: f.note.trim() || null });
                    setEditing(null);
                  }}
                  onDelete={async () => { await edit.del("visits", e.id); setEditing(null); }} />
              </div>
            </div>
          );
        }
        return (
          <div key={e.id} className="row">
            <span className="when mono">{e.date ? fmtDate(e.date) : ""}</span>
            <div className="row-main">
              <span className="title">{e.title}</span>
              <span className="meta">
                {[multi && car === "all" ? carById(e.carId)?.name : null, e.km != null ? fmtKm(e.km) : null, e.shop,
                  lines.length > 1 ? lines.map((l) => l.text).join(", ") : lines[0]?.note].filter(Boolean).join(" · ")}
                {hasPaper && <> · <button className="link" onClick={() => go("documents", e.id)}>Paperwork</button></>}
              </span>
              {edit && !hasPaper && <span className="row-acts"><EditBtn k={k} setEditing={setEditing} /></span>}
            </div>
            <span className="amount mono">{c ? fmtMoney(c) : ""}</span>
          </div>
        );
      })}
    </Section>
  );
}
