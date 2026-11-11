"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignInCard() {
  const [busy, setBusy] = useState(false);
  return (
    <div className="card stack">
      <h2>Connect your garage</h2>
      <p className="small flush">Sign in to let your assistant read and update your cars, visits and tasks. You&apos;ll confirm on the next screen.</p>
      <button className="btn primary self-start" disabled={busy} onClick={async () => {
        setBusy(true);
        // The OAuth client plugin sends this page's signed request along, so the agent's connection resumes after Google.
        await authClient.signIn.social({ provider: "google", callbackURL: "/" });
      }}>Sign in with Google</button>
    </div>
  );
}
