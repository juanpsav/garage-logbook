"use client";

import { useEffect, useRef, useState } from "react";
import { fmtDate, fmtKm, fmtMoney, today } from "@/lib/dates";
import { DOC_TYPES } from "@/lib/extraction";
import { MAX_FILES } from "@/lib/files";
import { status } from "@/lib/logic";
import type { Doc, DocType } from "@/lib/types";
import { useGarage, type DocEdit, type DocForm } from "./state";

export function DocsView() {
  const g = useGarage();
  const input = useRef<HTMLInputElement>(null);
  const docs = g.data.docs
    .filter((d) => g.ui.car === "all" || !d.carId || d.carId === g.ui.car)
    .sort((a, b) => (b.created || "").localeCompare(a.created || ""));
  return (
    <>
      {g.owner ? (
        <div className="bar">
          <p className="muted small lede">
            Snap a receipt, quote or inspection report. It gets read automatically and turned into history entries and tasks; nothing is saved until you review it.
            Several pages? Pick them all at once, or take one photo, then tap Add page for each of the others. On a computer you can also drop files here or paste a screenshot.
          </p>
          <button className="btn primary" onClick={() => input.current?.click()}>Scan or upload</button>
          <input
            ref={input}
            type="file"
            accept="image/*,application/pdf"
            multiple
            hidden
            onChange={(e) => { const fl = [...(e.target.files ?? [])]; e.target.value = ""; g.handleFiles(fl); }}
          />
        </div>
      ) : (
        <div className="bar">
          <p className="muted small lede">
            Sign in to scan receipts, quotes and inspection reports. They&apos;re read automatically and turned into history entries and tasks.
          </p>
          {g.signIn && <button className="btn primary" onClick={g.signIn}>Sign in with Google</button>}
        </div>
      )}
      {g.ui.busy && <div className="card"><span className="reading"><span className="spin" />{g.ui.busy}</span></div>}
      {!docs.length && !g.ui.busy && g.owner && <div className="empty">No documents yet. Scan your last oil change receipt or a shop quote to try it.</div>}
      <div className="docs">{docs.map((d) => <DocCard key={d.id} doc={d} />)}</div>
    </>
  );
}

function useFileSrc(id: string | null) {
  const g = useGarage();
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    if (id) g.store.fileSrc(id).then((u) => live && setSrc(u), () => {});
    return () => { live = false; };
  }, [id, g.store]);
  return src;
}

function Thumb({ id }: { id: string | null }) {
  const src = useFileSrc(id);
  // eslint-disable-next-line @next/next/no-img-element
  return id && src ? <img className="thumb" src={src} alt="" /> : <span className="thumb">PDF</span>;
}

function Page({ id, type, n }: { id: string; type: string; n: number }) {
  const src = useFileSrc(id);
  if (!src) return <span className="pdf">…</span>;
  if (type === "application/pdf") return <a className="pdf" href={src} target="_blank" rel="noopener">Open PDF</a>;
  // eslint-disable-next-line @next/next/no-img-element
  return <a href={src} target="_blank" rel="noopener"><img src={src} alt={`Page ${n}`} /></a>;
}

function DocCard({ doc: d }: { doc: Doc }) {
  const g = useGarage();
  const ex = d.ex, car = g.carById(d.carId), open = g.ui.open?.id === d.id;
  const title = d.title || ex.title || "Untitled document";
  const date = d.date || ex.date, total = d.total ?? ex.total;
  const reading = d.status === "reading" && g.ui.reading.has(d.id);
  const type = (d.type || ex.type || "other") as DocType;
  return (
    <div className="doc">
      <button className="doc-head" aria-expanded={open} onClick={() => g.setOpen(open ? null : { id: d.id, kind: "doc" })}>
        <Thumb id={d.thumb} />
        <span className="doc-sum">
          <span className="title">{title}</span>
          <span className="meta">
            <span className="chip">{DOC_TYPES[type]}</span>
            {car && g.cars.length > 1 && <span className="chip car">{car.name}</span>}
            {date && <span className="chip">{fmtDate(date)}</span>}
            {total != null && <span className="chip">{fmtMoney(Number(total))}</span>}
            {reading ? <span className="chip soon">Reading…</span>
              : d.status === "draft" ? <span className="chip soon">Not read yet</span>
              : d.status !== "saved" && <span className="chip soon">Needs review</span>}
          </span>
        </span>
        <span className="muted" aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="doc-body">
          <div className="pages">
            {d.files.map((f, i) => <Page key={f.id} id={f.id} type={f.type} n={i + 1} />)}
            {g.owner && !reading && d.status !== "saved" && d.files.length < MAX_FILES && (
              <label className="pdf add-page">
                + Add page
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  hidden
                  onChange={(e) => { const fl = [...(e.target.files ?? [])]; e.target.value = ""; g.addPages(d.id, fl); }}
                />
              </label>
            )}
          </div>
          {reading ? (
            <div className="reading">
              <span className="spin" />Reading this document. It usually takes under a minute.
              <button className="btn sm" onClick={() => g.stopRead(d.id)}>Stop</button>
            </div>
          ) : d.status === "saved" ? <SavedDoc doc={d} />
            : d.status === "draft" ? <DraftDoc doc={d} />
            : <ReviewForm key={JSON.stringify(d.ex)} doc={d} />}
        </div>
      )}
    </div>
  );
}

function DraftDoc({ doc: d }: { doc: Doc }) {
  const g = useGarage();
  const confirm = g.ui.open?.confirm;
  return (
    <>
      <p className="small flush">
        {d.files.length === 1 ? "1 page so far." : `${d.files.length} pages so far.`} More pages? Tap Add page for each one, then Read it.
      </p>
      <div className="form-acts">
        {confirm ? (
          <>
            <span className="hint center">Delete this document and its photos?</span>
            <button className="btn danger" onClick={() => g.deleteDoc(d.id)}>Yes, delete</button>
          </>
        ) : (
          <button className="btn ghost push" onClick={() => g.setOpen({ id: d.id, kind: "doc", confirm: true })}>Delete</button>
        )}
        <button className="btn primary" onClick={() => g.rereadDoc(d.id)}>Read it</button>
      </div>
    </>
  );
}

function SavedDoc({ doc: d }: { doc: Doc }) {
  const g = useGarage();
  const confirm = g.ui.open?.confirm;
  const [editing, setEditing] = useState(false);
  if (editing) return <EditDoc doc={d} done={() => setEditing(false)} />;
  const made = (d.taskIds || []).map((id) => g.data.tasks.find((t) => t.id === id)).filter((t) => !!t);
  return (
    <>
      {d.summary && <p className="flush">{d.summary}</p>}
      <div className="meta small muted">{[d.shop, d.km != null && fmtKm(d.km)].filter(Boolean).join(" · ")}</div>
      {d.logId && <p className="small flush">Added to history.</p>}
      {made.length > 0 && (
        <div className="sect"><h3>Tasks created</h3>
          <div className="checks">
            {made.map((t) => { const s = status(t, g.carById(t.carId)); return (
              <div key={t.id} className="check two"><span className="t">{t.title}</span><span className={`chip ${s.cls}`}>{s.chips[0]?.[1] || "no due date"}</span></div>
            ); })}
          </div>
        </div>
      )}
      <div className="form-acts">
        {confirm ? (
          <>
            <span className="hint center">Delete the document and its photos? Tasks and history stay.</span>
            <button className="btn danger" onClick={() => g.deleteDoc(d.id)}>Yes, delete</button>
            <button className="btn ghost" onClick={g.close}>Keep</button>
          </>
        ) : (
          <>
            <button className="btn ghost push" onClick={() => g.setOpen({ id: d.id, kind: "doc", confirm: true })}>Delete document</button>
            <button className="btn" onClick={() => setEditing(true)}>Edit</button>
          </>
        )}
      </div>
    </>
  );
}

function EditDoc({ doc: d, done }: { doc: Doc; done: () => void }) {
  const g = useGarage();
  const [f, setF] = useState<DocEdit>(() => ({
    type: (d.type || d.ex.type || "other") as DocType,
    carId: d.carId || "",
    title: d.title || "",
    date: d.date || today(),
    shop: d.shop || "",
    km: d.km != null ? String(d.km) : "",
    total: d.total != null ? String(d.total) : "",
    summary: d.summary || "",
  }));
  const set = <K extends keyof DocEdit>(k: K, v: DocEdit[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <form className="stack" onSubmit={async (e) => { e.preventDefault(); await g.updateDoc(d, f); done(); }}>
      <div className="fields">
        <label className="field"><span>Type</span>
          <select value={f.type} onChange={(e) => set("type", e.target.value as DocType)}>
            {Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="field"><span>Car</span>
          <select value={f.carId} required onChange={(e) => set("carId", e.target.value)}>
            <option value="">Choose…</option>
            {g.cars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="field wide"><span>Title</span><input value={f.title} required onChange={(e) => set("title", e.target.value)} /></label>
        <label className="field"><span>Date</span><input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} /></label>
        <label className="field"><span>Shop</span><input value={f.shop} onChange={(e) => set("shop", e.target.value)} /></label>
        <label className="field"><span>Odometer (km)</span><input inputMode="numeric" value={f.km} onChange={(e) => set("km", e.target.value)} /></label>
        <label className="field"><span>Total ($)</span><input inputMode="decimal" value={f.total} onChange={(e) => set("total", e.target.value)} /></label>
        <label className="field wide"><span>Summary</span><textarea rows={3} value={f.summary} onChange={(e) => set("summary", e.target.value)} /></label>
      </div>
      {d.logId && <p className="small muted flush">The history entry from this document gets the same title, date, km and total.</p>}
      <div className="form-acts">
        <button type="button" className="btn ghost push" onClick={done}>Cancel</button>
        <button className="btn primary">Save changes</button>
      </div>
    </form>
  );
}

function ReviewForm({ doc: d }: { doc: Doc }) {
  const g = useGarage();
  const ex = d.ex, confirm = g.ui.open?.confirm;
  const type0 = (ex.type || "other") as DocType;
  const recs = ex.recommended || [];
  const [f, setF] = useState<DocForm>(() => ({
    type: type0,
    carId: d.carId || (g.ui.car !== "all" ? g.ui.car : ""),
    title: ex.title || "",
    date: ex.date || today(),
    shop: ex.shop || "",
    km: ex.km != null ? String(ex.km) : "",
    total: ex.total != null ? String(ex.total) : "",
    addLog: type0 === "receipt",
    done: Object.fromEntries((ex.completes || []).map((id) => [id, true])),
    recs: Object.fromEntries(recs.map((r, i) => [i, { on: type0 === "quote" || type0 === "inspection" || r.urgency !== "later", title: r.title, urgency: r.urgency }])),
  }));
  const set = <K extends keyof DocForm>(k: K, v: DocForm[K]) => setF((x) => ({ ...x, [k]: v }));
  const setRec = (i: number, patch: Partial<DocForm["recs"][number]>) => setF((x) => ({ ...x, recs: { ...x.recs, [i]: { ...x.recs[i], ...patch } } }));
  const completes = (ex.completes || []).map((id) => g.data.tasks.find((t) => t.id === id)).filter((t) => !!t && (!f.carId || t.carId === f.carId));

  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); g.saveDoc(d, f); }}>
      {d.readError && <div className="banner">{d.readError}</div>}
      {ex.summary && <p className="flush">{ex.summary}</p>}
      <div className="fields">
        <label className="field"><span>Type</span>
          <select value={f.type} onChange={(e) => set("type", e.target.value as DocType)}>
            {Object.entries(DOC_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="field"><span>Car</span>
          <select value={f.carId} required onChange={(e) => set("carId", e.target.value)}>
            <option value="">Choose…</option>
            {g.cars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="field wide"><span>Title</span><input value={f.title} required placeholder="Oil change at the dealer" onChange={(e) => set("title", e.target.value)} /></label>
        <label className="field"><span>Date</span><input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} /></label>
        <label className="field"><span>Shop</span><input value={f.shop} onChange={(e) => set("shop", e.target.value)} /></label>
        <label className="field"><span>Odometer (km)</span><input inputMode="numeric" value={f.km} onChange={(e) => set("km", e.target.value)} /></label>
        <label className="field"><span>Total ($)</span><input inputMode="decimal" value={f.total} onChange={(e) => set("total", e.target.value)} /></label>
      </div>
      <div className="sect"><h3>Work done</h3>
        <div className="checks">
          <label className="check">
            <input type="checkbox" checked={f.addLog} onChange={(e) => set("addLog", e.target.checked)} />
            <span className="t">Add to history as one entry
              {(ex.workDone || []).length > 0 && <span className="sub">{ex.workDone!.map((w) => w.title + (w.cost != null ? ` (${fmtMoney(w.cost)})` : "")).join(", ")}</span>}
            </span>
            <span />
          </label>
          {completes.map((t) => (
            <label key={t!.id} className="check">
              <input type="checkbox" checked={!!f.done[t!.id]} onChange={(e) => set("done", { ...f.done, [t!.id]: e.target.checked })} />
              <span className="t">Mark “{t!.title}” done
                <span className="sub">{t!.everyMonths || t!.everyKm || t!.anchor ? "Schedules the next one from this date and km." : "Removes it from your list."}</span>
              </span>
              <span />
            </label>
          ))}
        </div>
      </div>
      {recs.length > 0 && (
        <div className="sect"><h3>Recommended work → tasks</h3>
          <div className="checks">
            {recs.map((r, i) => (
              <div key={i} className="check">
                <input type="checkbox" checked={f.recs[i].on} aria-label="Create task" onChange={(e) => setRec(i, { on: e.target.checked })} />
                <span className="t">
                  <input value={f.recs[i].title} aria-label="Task title" onChange={(e) => setRec(i, { title: e.target.value })} />
                  <span className="sub">{[r.estCost != null ? `Quoted ${fmtMoney(r.estCost)}` : "", r.dueKm != null ? `by ${fmtKm(r.dueKm)}` : "", r.dueDate ? `by ${fmtDate(r.dueDate)}` : "", r.notes].filter(Boolean).join(" · ")}</span>
                </span>
                <select value={f.recs[i].urgency} aria-label="When" onChange={(e) => setRec(i, { urgency: e.target.value as "now" })}>
                  <option value="now">Now</option><option value="soon">Within a month</option><option value="later">Later</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="form-acts">
        {confirm ? (
          <>
            <span className="hint center">Delete this document and its photos?</span>
            <button type="button" className="btn danger" onClick={() => g.deleteDoc(d.id)}>Yes, delete</button>
          </>
        ) : (
          <button type="button" className="btn ghost push" onClick={() => g.setOpen({ id: d.id, kind: "doc", confirm: true })}>Delete</button>
        )}
        <button type="button" className="btn" onClick={() => g.rereadDoc(d.id)}>{Object.keys(ex).length ? "Read again" : "Read it"}</button>
        <button className="btn primary">Save</button>
      </div>
    </form>
  );
}
