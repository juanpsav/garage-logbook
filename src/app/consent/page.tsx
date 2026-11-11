import { verifyOAuthQueryParams } from "@better-auth/oauth-provider";
import { headers } from "next/headers";
import { Suspense } from "react";
import { getAuth } from "@/server/auth";
import { ConsentForm } from "./ConsentForm";

export const metadata = { title: "Connect · Garage Logbook" };

export default function ConsentPage({ searchParams }: PageProps<"/consent">) {
  return (
    <div className="wrap narrow">
      <header className="top"><h1>Garage Logbook</h1></header>
      <Suspense fallback={<p className="muted">Loading…</p>}><Consent searchParams={searchParams} /></Suspense>
    </div>
  );
}

const fail = (msg: string) => <div className="card"><p className="flush">{msg}</p></div>;

async function Consent({ searchParams }: { searchParams: PageProps<"/consent">["searchParams"] }) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) for (const x of [v].flat()) if (typeof x === "string") params.append(k, x);
  // Only the signed parameters count; the signature proves they came from our own authorize step.
  const signed = new Set(["sig", "ba_param", ...params.getAll("ba_param")]);
  const query = new URLSearchParams([...params].filter(([k]) => signed.has(k)));
  const auth = getAuth();
  const { secret } = await auth.$context;
  if (!(await verifyOAuthQueryParams(query.toString(), secret))) return fail("This link has expired or isn't valid. Start connecting again from your assistant.");
  let client: { client_name?: string } | null = null;
  try {
    client = await auth.api.getOAuthClientPublic({ query: { client_id: query.get("client_id") ?? "" }, headers: await headers() });
  } catch {
    return fail("This app isn't known or is turned off. Start connecting again from your assistant.");
  }
  let host = "";
  try { host = new URL(query.get("redirect_uri") ?? "").host; } catch { /* shown without a host */ }
  return <ConsentForm name={client?.client_name || "An app"} host={host} />;
}
