"use client";

import { useState } from "react";
import { LocalStore } from "@/lib/store/local";
import type { Store } from "@/lib/store";
import { App } from "./App";
import { GarageProvider } from "./state";

/** Picks where data lives: the browser for guests, the server for the signed-in owner. */
export function Garage({ owner }: { owner: { email: string } | null }) {
  const [store] = useState<Store>(() => new LocalStore());
  return (
    <GarageProvider store={store}>
      <App account={owner ? <span className="muted small">{owner.email}</span> : null} />
    </GarageProvider>
  );
}
