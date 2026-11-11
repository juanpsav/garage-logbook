"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { today } from "@/lib/dates";
import { demoData } from "@/lib/demo";
import seedSchedules from "@/data/schedules.json";
import type { CollectionName, Data, Schedule } from "@/lib/types";
import type { Editor } from "./Edit";
import { ConnectCard, ConnectSteps, McpUrl } from "./ConnectCard";
import { GarageView } from "./GarageView";
import { Mark } from "./Mark";

export type OwnerInfo = { id: string; email: string } | null;

const serverFile = (p: string) => `/api/files/${p}`;
const demoFile = (p: string) => `/${p}`;

/** Signed in: your garage, read only. Signed out: what this is, and a sample garage. */
export function Garage({ owner, signInEnabled, mcpUrl }: { owner: OwnerInfo; signInEnabled: boolean; mcpUrl: string }) {
  const [leaving, setLeaving] = useState(false);
  const signIn = signInEnabled ? () => authClient.signIn.social({ provider: "google", callbackURL: "/" }) : null;
  const account = owner ? (
    <button className="btn ghost sm" disabled={leaving} onClick={async () => { setLeaving(true); await authClient.signOut(); location.reload(); }}>Sign out</button>
  ) : signIn ? <button className="btn ghost sm" onClick={signIn}>Sign in</button> : null;
  return (
    <div className="wrap">
      <header className="top">
        <h1 className="brand"><Mark />Garage Logbook</h1>
        <div className="top-acts">{account}</div>
      </header>
      {owner ? <><ConnectCard mcpUrl={mcpUrl} /><OwnerGarage /></> : <Landing mcpUrl={mcpUrl} signIn={signIn} />}
    </div>
  );
}

function OwnerGarage() {
  const [data, setData] = useState<(Data & { schedules: Schedule[] }) | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await fetch("/api/data", { cache: "no-store" });
    if (!r.ok) throw new Error(String(r.status));
    const d: Data & { schedules?: Schedule[] } = await r.json();
    return { ...d, schedules: d.schedules ?? [] };
  }, []);
  useEffect(() => {
    let live = true;
    load().then((d) => live && setData(d), () => live && setFailed(true));
    return () => { live = false; };
  }, [load]);

  // Quick edits show at once and save in the background; a failed save reloads what the server has.
  const edit = useMemo<Editor>(() => {
    const send = async (method: "PUT" | "DELETE", col: CollectionName, id: string, body?: unknown) => {
      const r = await fetch(`/api/data/${col}/${id}`, { method, ...(body !== undefined && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
      if (!r.ok) {
        setError(r.status === 401 ? "You're signed out. Reload the page and sign in." : "Couldn't save that change. Check it and try again.");
        load().then(setData, () => {});
      }
    };
    return {
      put: async (col, obj) => {
        setError(null);
        setData((d) => d && { ...d, [col]: d[col].some((x) => x.id === obj.id) ? d[col].map((x) => (x.id === obj.id ? obj : x)) : [...d[col], obj] });
        await send("PUT", col, obj.id, obj);
      },
      del: async (col, id) => {
        setError(null);
        setData((d) => d && {
          ...d, [col]: (d[col] as { id: string }[]).filter((x) => x.id !== id),
          // A deleted visit takes its lines and pages with it.
          ...(col === "visits" && { items: d.items.filter((i) => i.visitId !== id), files: d.files.filter((f) => f.visitId !== id) }),
        });
        await send("DELETE", col, id);
      },
    };
  }, [load]);

  if (failed) return <p className="muted">Couldn&apos;t load your garage. Reload the page.</p>;
  if (!data) return <p className="muted">Loading your garage…</p>;
  return (
    <>
      {error && <div className="alert" role="alert">{error}</div>}
      <GarageView data={data} schedules={data.schedules} src={serverFile} edit={edit} />
    </>
  );
}

// What an agent can call, as listed by the MCP server (src/server/mcp).
const TOOLS: [string, string[]][] = [
  ["Read", ["get_garage", "whats_due", "get_visit", "get_pages", "search_history", "list_suggestions"]],
  ["Paperwork", ["start_visit", "upload_link", "add_items", "update_item", "update_visit", "confirm_visit"]],
  ["Upkeep", ["add_car", "find_schedule", "track_suggestions", "create_task", "complete_task", "log_work", "set_odometer"]],
];

/** Signed out: what this is (an MCP server for car upkeep), and a sample of what it keeps. */
function Landing({ mcpUrl, signIn }: { mcpUrl: string; signIn: (() => void) | null }) {
  const [data] = useState(() => demoData(today()));
  return (
    <>
      <section className="intro">
        <span className="eyebrow">MCP server</span>
        <h2 className="display">Your car&apos;s logbook, kept by your AI agent.</h2>
        <p>Connect Claude, Meta Muse or any MCP client. It reads your shop paperwork, tracks what&apos;s due and records the work. This app keeps the data and the original documents.</p>
        <McpUrl mcpUrl={mcpUrl} />
        <ConnectSteps mcpUrl={mcpUrl} />
      </section>

      <section className="tools">
        <h3>What your agent can call</h3>
        {TOOLS.map(([group, names]) => (
          <div key={group} className="tool-row">
            <span className="tool-group">{group}</span>
            <span className="tool-names">{names.map((n) => <code key={n}>{n}</code>)}</span>
          </div>
        ))}
      </section>

      <section className="sample">
        <div className="sample-h">
          <h3>What you see here</h3>
          <span className="chip">Sample garage</span>
          {signIn && <button className="btn sm ghost push-r" onClick={signIn}>Sign in for yours</button>}
        </div>
        <GarageView data={data} schedules={seedSchedules as Schedule[]} src={demoFile} />
      </section>
    </>
  );
}
