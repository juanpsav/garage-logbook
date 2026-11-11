import { Mark } from "@/components/Mark";
import { Suspense } from "react";
import { Garage } from "@/components/Root";
import { authConfigured, mcpResource } from "@/server/auth";
import { getOwner } from "@/server/session";

export default function Home() {
  // The session is read per request, so the page shell is prerendered and the garage streams in.
  return (
    <Suspense
      fallback={
        <div className="wrap">
          <header className="top"><h1 className="brand"><Mark />Garage Logbook</h1></header>
          <p className="muted">Loading your garage…</p>
        </div>
      }
    >
      <SignedInGarage />
    </Suspense>
  );
}

async function SignedInGarage() {
  const owner = await getOwner();
  return <Garage owner={owner} signInEnabled={authConfigured()} mcpUrl={mcpResource()} />;
}
