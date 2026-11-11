"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { today } from "@/lib/dates";
import { demoData } from "@/lib/demo";
import type { Data } from "@/lib/types";
import { ConnectCard } from "./ConnectCard";
import { GarageView } from "./GarageView";

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
      <header className="top"><h1>Garage Logbook</h1><div className="top-acts">{account}</div></header>
      <ConnectCard mcpUrl={mcpUrl} signedIn={!!owner} />
      {owner ? <OwnerGarage /> : <Demo />}
    </div>
  );
}

function OwnerGarage() {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    fetch("/api/data", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: Data) => live && setData(d), () => live && setFailed(true));
    return () => { live = false; };
  }, []);
  if (failed) return <p className="muted">Couldn&apos;t load your garage. Reload the page.</p>;
  if (!data) return <p className="muted">Loading your garage…</p>;
  return <GarageView data={data} src={serverFile} />;
}

function Demo() {
  const [data] = useState(() => demoData(today()));
  return (
    <>
      <div className="demo-note small muted">Below is a <strong>sample garage</strong>, the way an owner sees theirs. Sign in to see your own.</div>
      <GarageView data={data} src={demoFile} />
    </>
  );
}
