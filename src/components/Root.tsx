"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import type { Store } from "@/lib/store";
import { LocalStore } from "@/lib/store/local";
import { ServerStore } from "@/lib/store/server";
import { App } from "./App";
import { GarageProvider } from "./state";

export type OwnerInfo = { id: string; email: string } | null;

/** Picks where data lives: the browser for guests, the server for the signed-in owner. */
export function Garage({ owner, signInEnabled }: { owner: OwnerInfo; signInEnabled: boolean }) {
  const [store] = useState<Store>(() => (owner ? new ServerStore(owner.id) : new LocalStore()));
  const [leaving, setLeaving] = useState(false);
  const signIn = signInEnabled ? () => authClient.signIn.social({ provider: "google", callbackURL: "/" }) : null;
  const account = owner ? (
    <button className="btn ghost sm" disabled={leaving} onClick={async () => {
      setLeaving(true);
      await authClient.signOut();
      location.reload();
    }}>Sign out</button>
  ) : signIn ? (
    <button className="btn ghost sm" onClick={signIn}>Sign in</button>
  ) : null;
  return (
    <GarageProvider store={store} owner={owner} signIn={signIn}>
      <App account={account} />
    </GarageProvider>
  );
}
