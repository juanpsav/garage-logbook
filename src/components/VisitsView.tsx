"use client";

import { useEffect, useRef, useState } from "react";
import { fmtDate, fmtKm, fmtMoney, num } from "@/lib/dates";
import { MAX_FILES } from "@/lib/files";
import type { FileRec, Item, ItemKind, Visit } from "@/lib/types";
import { Chat } from "./Chat";
import { useGarage } from "./state";

const day = (v: Visit) => v.date || v.created.slice(0, 10);

export function VisitsView() {
  const g = useGarage();
  const input = useRef<HTMLInputElement>(null);
  const visits = g.data.visits
    .filter((v) => g.ui.car === "all" || !v.carId || v.carId === g.ui.car)
    // Work typed in by hand lives in the Done list; this tab is for shop visits and their paperwork.
    .filter((v) => g.data.files.some((f) => f.visitId === v.id) || g.data.items.some((i) => i.visitId === v.id && i.source === "shop"))
    .sort((a, b) => day(b).localeCompare(day(a)) || b.created.localeCompare(a.created));
  return (
    <>
      {g.owner ? (
        <div className="bar">
          <p className="muted small lede">
            Add the paperwork from a shop visit: invoice, inspection sheet and quote, all the pages together.
            The assistant sorts out what was done, what they found and what they quoted, then asks what the shop told you.
          </p>
          <button className="btn primary" onClick={() => input.current?.click()}>Add a visit</button>
          <input
            ref={input}
            type="file"
            accept="image/*,application/pdf"
            multiple
            hidden
            onChange={(e) => { const fl = [...(e.target.files ?? [])]; e.target.value = ""; g.newVisit(fl); }}
          />
        </div>
      ) : (
        <div className="bar">
          <p className="muted small lede">
            Sign in to add shop paperwork. The assistant reads it with you, sorts out what was done, found and quoted, and helps you decide what really needs doing.
          </p>
          {g.signIn && <button className="btn primary" onClick={g.signIn}>Sign in with Google</button>}
        </div>
      )}
      {g.ui.busy && <div className="card"><span className="reading"><span className="spin" />{g.ui.busy}</span></div>}
      {!visits.length && !g.ui.busy && <div className="empty">No visits yet.{g.owner && " Add the paperwork from your last oil change or a shop quote to try it."}</div>}
      <div className="docs">{visits.map((v) => <VisitCard key={v.id} visit={v} />)}</div>
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

function Thumb({ file }: { file: FileRec | undefined }) {
  const src = useFileSrc(file?.view ?? null);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img className="thumb" src={src} alt="" /> : <span className="thumb">{file ? "PDF" : "—"}</span>;
}

function Page({ file, n }: { file: FileRec; n: number }) {
  const view = useFileSrc(file.view);
  // Tapping a page opens the file exactly as uploaded.
  const full = useFileSrc(file.orig);
  if (!view) return file.type === "application/pdf" ? <a className="pdf" href={full ?? undefined} target="_blank" rel="noopener">Open PDF</a> : <span className="pdf">…</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <a href={full ?? view} target="_blank" rel="noopener"><img src={view} alt={`Page ${n}`} /></a>;
}

const STATUS: Record<Visit["status"], [string, string] | null> = { draft: ["soon", "Not started"], open: ["soon", "In progress"], confirmed: null };

function VisitCard({ visit: v }: { visit: Visit }) {
  const g = useGarage();
  const open = g.ui.open?.id === v.id;
  const car = g.carById(v.carId);
  const files = g.data.files.filter((f) => f.visitId === v.id).sort((a, b) => a.position - b.position);
  const items = g.data.items.filter((i) => i.visitId === v.id);
  const st = STATUS[v.status];
  return (
    <div className="doc">
      <button className="doc-head" aria-expanded={open} onClick={() => g.setOpen(open ? null : { id: v.id, kind: "visit" })}>
        <Thumb file={files[0]} />
        <span className="doc-sum">
          <span className="title">{v.title || (files.length ? "New visit" : "Visit")}</span>
          <span className="meta">
            {car && g.cars.length > 1 && <span className="chip car">{car.name}</span>}
            {v.date && <span className="chip">{fmtDate(v.date)}</span>}
            {v.total != null && <span className="chip">{fmtMoney(v.total)}</span>}
            {st && <span className={`chip ${st[0]}`}>{st[1]}</span>}
            {!st && items.some((i) => i.kind === "quoted" && i.decision === "pending") && <span className="chip">Quote pending</span>}
          </span>
        </span>
        <span className="muted" aria-hidden="true">{open ? "▴" : "▾"}</span>
      </button>
      {open && <VisitBody visit={v} files={files} items={items} />}
    </div>
  );
}

function VisitBody({ visit: v, files, items }: { visit: Visit; files: FileRec[]; items: Item[] }) {
  const g = useGarage();
  const [editing, setEditing] = useState(false);
  const confirm = g.ui.open?.confirm;
  const canChat = !!g.owner && files.length > 0;
  const going = v.status !== "draft";
  return (
    <div className="doc-body">
      {(files.length > 0 || g.owner) && (
        <div className="pages">
          {files.map((f, i) => <Page key={f.id} file={f} n={i + 1} />)}
          {g.owner && v.status !== "confirmed" && files.length < MAX_FILES && (
            <label className="pdf add-page">
              + Add page
              <input type="file" accept="image/*,application/pdf" multiple hidden
                onChange={(e) => { const fl = [...(e.target.files ?? [])]; e.target.value = ""; g.addPages(v.id, fl); }} />
            </label>
          )}
        </div>
      )}
      {v.status === "draft" && canChat ? (
        <p className="small flush">
          {files.length === 1 ? "1 page so far." : `${files.length} pages so far.`} More pages? Add them now, then go through it with the assistant.
        </p>
      ) : editing ? (
        <VisitForm visit={v} done={() => setEditing(false)} />
      ) : (
        <Lines visit={v} items={items} />
      )}
      {canChat && going && (
        <div className="sect"><h3>Conversation</h3>
          <Chat thread={{ visitId: v.id }} start={v.status === "open" && !items.length} placeholder="What did the shop tell you? Anything to correct?" />
          {v.status === "open" && <p className="hint">New pages go to the assistant with your next message.</p>}
        </div>
      )}
      <div className="form-acts">
        {confirm ? (
          <>
            <span className="hint center">Delete this visit, its pages and lines? Tasks stay.</span>
            <button className="btn danger" onClick={() => g.deleteVisit(v.id)}>Yes, delete</button>
            <button className="btn ghost" onClick={g.close}>Keep</button>
          </>
        ) : (
          <>
            <button className="btn ghost push" onClick={() => g.setOpen({ id: v.id, kind: "visit", confirm: true })}>Delete</button>
            {!editing && v.status !== "draft" && <button className="btn" onClick={() => setEditing(true)}>Edit details</button>}
            {v.status === "draft" && canChat && <button className="btn primary" onClick={() => g.startVisit(v)}>Go through it</button>}
            {v.status === "open" && <button className="btn primary" onClick={() => g.confirmVisit(v)}>Save to history</button>}
          </>
        )}
      </div>
    </div>
  );
}

const KINDS: [ItemKind, string][] = [["done", "Done"], ["found", "Found"], ["quoted", "Quoted"]];
const DECISIONS = { pending: "Undecided", accepted: "Going ahead", declined: "Declined", deferred: "Later" } as const;

/** What the visit's paperwork says, sorted into done, found and quoted. */
function Lines({ visit: v, items }: { visit: Visit; items: Item[] }) {
  const g = useGarage();
  const car = g.carById(v.carId);
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
                  {(k === "quoted" || (k === "found" && i.decision)) && (
                    <select className="dec" value={i.decision ?? "pending"} aria-label={`Decision on ${i.text}`}
                      onChange={(e) => g.updateItem({ ...i, decision: e.target.value as Item["decision"] })}>
                      {Object.entries(DECISIONS).map(([d, l]) => <option key={d} value={d}>{l}</option>)}
                    </select>
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

function VisitForm({ visit: v, done }: { visit: Visit; done: () => void }) {
  const g = useGarage();
  return (
    <form className="stack" onSubmit={async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
      await g.saveVisit({ ...v, carId: d.carId || null, title: d.title.trim(), date: d.date || null, shop: d.shop.trim() || null, km: num(d.km), total: num(d.total), summary: d.summary.trim() || null });
      done();
    }}>
      <div className="fields">
        <label className="field wide"><span>Title</span><input name="title" defaultValue={v.title} required /></label>
        <label className="field"><span>Car</span>
          <select name="carId" defaultValue={v.carId ?? ""}>
            <option value="">Choose…</option>
            {g.cars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Date</span><input type="date" name="date" defaultValue={v.date ?? ""} /></label>
        <label className="field"><span>Shop</span><input name="shop" defaultValue={v.shop ?? ""} /></label>
        <label className="field"><span>Odometer (km)</span><input name="km" inputMode="numeric" defaultValue={v.km ?? ""} /></label>
        <label className="field"><span>Total ($)</span><input name="total" inputMode="decimal" defaultValue={v.total ?? ""} /></label>
        <label className="field wide"><span>Summary</span><textarea name="summary" rows={3} defaultValue={v.summary ?? ""} /></label>
      </div>
      <div className="form-acts">
        <button type="button" className="btn ghost push" onClick={done}>Cancel</button>
        <button className="btn primary">Save changes</button>
      </div>
    </form>
  );
}
