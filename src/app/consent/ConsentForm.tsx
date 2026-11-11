"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function ConsentForm({ name, host }: { name: string; host: string }) {
  const [busy, setBusy] = useState(false);
  const decide = async (accept: boolean) => {
    setBusy(true);
    // The client plugin sends this page's signed request; the response redirects back to the app.
    const { error } = await authClient.oauth2.consent({ accept });
    if (error) setBusy(false);
  };
  return (
    <div className="card stack">
      <h2>Connect {name}?</h2>
      <p className="small flush">
        <strong>{name}</strong>{host && <> (returns to <span className="mono">{host}</span>)</>} will be able to read and update your garage:
        cars, odometer, tasks, shop visits with their pages, and history. It can&apos;t see anything else in your Google account.
        You can disconnect it at any time.
      </p>
      <div className="form-acts">
        <button className="btn ghost" disabled={busy} onClick={() => decide(false)}>Don&apos;t allow</button>
        <button className="btn primary" disabled={busy} onClick={() => decide(true)}>Allow</button>
      </div>
    </div>
  );
}
