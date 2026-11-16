"use client";

import { useEffect, useRef, useState } from "react";
import { addDays, fmtDate } from "@/lib/dates";

type Step =
  | { k: "user"; text: string }
  | { k: "tool"; name: string; args: Record<string, unknown>; result: unknown; sum: string }
  | { k: "agent"; text: string };

/** A conversation with the sample garage: the same records the Sample garage tab shows, through the real tools. */
function script(today: string): Step[] {
  const d = (n: number) => addDays(today, n);
  const car = "2019 Subaru Forester";
  return [
    { k: "user", text: "What's due on the Forester?" },
    {
      k: "tool", name: "whats_due", args: {}, sum: "2 need attention · 2 upcoming",
      result: {
        today,
        attention: [
          { kind: "task", car, title: "Oil and filter change", detail: "1 day late, at 141 400 km · 1 988 km to go" },
          { kind: "quote", car, title: "Rear brakes: ceramic pads, 2 discs and caliper service", detail: "$612.40, Garage Exemple Inc., quoted 2 days ago, you said later" },
        ],
        upcoming: [
          { kind: "task", car, title: "Rear brakes: pads, discs, caliper service", detail: `${fmtDate(d(21))} · in 21 days` },
          { kind: "note", car, title: "Squeal from the rear when braking", detail: `noted ${d(-1)}` },
        ],
        quiet: false,
      },
    },
    {
      k: "agent",
      text: `Two things. The oil change is a day overdue: book it this week. Then the rear brakes: pads were at 3 mm two days ago and you've noticed a squeal, so don't stretch past ${fmtDate(d(21))}. The shop's quote is $612.40.`,
    },
    { k: "user", text: "They also pushed injector cleaning and new stabilizer links. Do I need those?" },
    {
      k: "tool", name: "get_visit", args: { visitId: "demo-visit" }, sum: "Winter tire changeover · 9 lines · 2 pages",
      result: {
        title: "Winter tire changeover and inspection", date: d(-2), km: 139412, shop: "Garage Exemple Inc.", total: 107.43, pages: 2,
        items: [
          { kind: "found", text: "Brake pads: front 6 mm, rear 3 mm (rear low). Rear discs rusty.", original: "pl. av 6mm / arr 3mm !! dsq arr rouillés - voir soum." },
          { kind: "quoted", text: "Fuel injector cleaning and fuel treatment", original: "NETT. INJECTEURS + TRAIT. ESSENCE", cost: 149.95, decision: "pending" },
          { kind: "quoted", text: "Replace both front stabilizer links", original: "LIENS STAB. AV (2)", cost: 274.5, decision: "pending" },
        ],
      },
    },
    {
      k: "agent",
      text: "Probably not. The inspection found nothing pointing to either: no rough idle, no clunk over bumps. Injector cleaning is a common add-on, and links can wait until they make noise. Ask the shop what they saw; if they can't show you, skip them.",
    },
    { k: "user", text: "Skip both." },
    { k: "tool", name: "update_item", args: { visitId: "demo-visit", id: "demo-i7", decision: "declined" }, sum: "Updated a line", result: { ok: true } },
    { k: "tool", name: "update_item", args: { visitId: "demo-visit", id: "demo-i8", decision: "declined" }, sum: "Updated a line", result: { ok: true } },
    { k: "agent", text: "Done. Both marked declined on the Forester. Brakes stay on the list." },
  ];
}

/** How the agent side looks: the owner's agent calling this server. Plays once, then can be replayed. */
export function AgentDemo({ today }: { today: string }) {
  const [steps] = useState(() => script(today));
  const [pos, setPos] = useState({ i: 0, sub: 0 });
  const [open, setOpen] = useState<number | null>(null);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pos.i >= steps.length) return;
    const s = steps[pos.i];
    const next = () => setPos({ i: pos.i + 1, sub: 0 });
    let t: ReturnType<typeof setTimeout>;
    // Reduced motion: show the whole conversation at once.
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) t = setTimeout(() => setPos({ i: steps.length, sub: 0 }), 0);
    else if (s.k === "user") t = setTimeout(() => (pos.sub ? next() : setPos({ i: pos.i, sub: 1 })), pos.sub ? 500 : 1100);
    else if (s.k === "tool") t = setTimeout(() => (pos.sub ? next() : setPos({ i: pos.i, sub: 1 })), pos.sub ? 450 : 850);
    else if (pos.sub < s.text.length) t = setTimeout(() => setPos({ i: pos.i, sub: Math.min(s.text.length, pos.sub + 4) }), 22);
    else t = setTimeout(next, 1300);
    return () => clearTimeout(t);
  }, [pos, steps]);

  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [pos]);

  const shown = steps.slice(0, Math.min(pos.i + 1, steps.length));
  const thinking = pos.i < steps.length && steps[pos.i].k === "user" && pos.sub === 1;

  return (
    <figure className="agent" aria-label="Example: an agent using the Garage Logbook MCP server">
      <div className="agent-top">
        <span className="agent-who"><span className="agent-av" aria-hidden="true" />Your agent</span>
        <span className="agent-conn">Garage Logbook · MCP</span>
      </div>
      <div className="agent-log" ref={log}>
        {shown.map((s, n) => {
          const live = n === pos.i;
          if (s.k === "user") return live && pos.sub === 0 ? null : <div key={n} className="msg user">{s.text}</div>;
          if (s.k === "agent") return <div key={n} className="msg bot">{live ? s.text.slice(0, pos.sub) : s.text}</div>;
          const pending = live && pos.sub === 0;
          return (
            <div key={n} className={`call${open === n ? " open" : ""}`}>
              <button className="call-h" onClick={() => setOpen(open === n ? null : n)} aria-expanded={open === n} disabled={pending}>
                <span className={`call-st${pending ? " run" : ""}`} aria-hidden="true" />
                <span className="call-name">{s.name}</span>
                <span className="call-args">({Object.entries(s.args).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ")})</span>
                <span className="call-sum">{pending ? "calling…" : s.sum}</span>
              </button>
              {open === n && (
                <div className="call-body">
                  <span className="lbl">Request</span>
                  <pre>{JSON.stringify({ method: "tools/call", params: { name: s.name, arguments: s.args } }, null, 2)}</pre>
                  <span className="lbl">Response</span>
                  <pre>{JSON.stringify(s.result, null, 2)}</pre>
                </div>
              )}
            </div>
          );
        })}
        {thinking && <div className="msg bot dots" aria-label="Thinking"><i /><i /><i /></div>}
      </div>
      <div className="agent-foot">
        <span className="agent-input">Message your agent</span>
        <button className="btn sm" onClick={() => { setOpen(null); setPos({ i: 0, sub: 0 }); }} disabled={pos.i < steps.length}>Replay</button>
      </div>
      <figcaption className="hint">Scripted on the sample garage. Tap a call to see the request and response.</figcaption>
    </figure>
  );
}
