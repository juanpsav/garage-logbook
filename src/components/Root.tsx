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
  ) : null;
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

/** Signed out: two tabs. About says what this is and how to start; Sample shows what it keeps. */
function Landing({ mcpUrl, signIn }: { mcpUrl: string; signIn: (() => void) | null }) {
  const [tab, setTab] = useState<"about" | "sample">("about");
  const [data] = useState(() => demoData(today()));
  return (
    <>
      <nav className="seg seg-inline" aria-label="Section">
        <button aria-pressed={tab === "about"} onClick={() => setTab("about")}>About</button>
        <button aria-pressed={tab === "sample"} onClick={() => setTab("sample")}>Sample garage</button>
      </nav>
      {tab === "about" ? (
        <>
          <section className="intro">
            <h2 className="display">MCP server for car maintenance.</h2>
            <p>Your agent reads shop paperwork, tracks service and keeps the records here.</p>
            <div className="cta">
              {signIn && <button className="btn primary" onClick={signIn}>Sign in</button>}
              <McpUrl mcpUrl={mcpUrl} />
            </div>
            <ConnectSteps mcpUrl={mcpUrl} />
          </section>
          <figure className="diagram">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/architecture.svg" width={1144} height={444} alt="Claude, Meta Muse, Dot or any MCP client connect over MCP to the Garage Logbook server, which stores records in Postgres and original pages in Blob storage, and serves this web app." />
          </figure>
        </>
      ) : (
        <GarageView data={data} schedules={seedSchedules as Schedule[]} src={demoFile} />
      )}
      <footer className="foot">
        <a href="https://github.com/juanpsav/garage-logbook" target="_blank" rel="noopener">GitHub</a>
      </footer>
    </>
  );
}
