import { connection } from "next/server";
import { Suspense } from "react";
import { getRecord, listRecords } from "@/server/garage";
import { readUploadToken } from "@/server/upload-token";
import { UploadPanel } from "./UploadPanel";

export const metadata = { title: "Add pages · Garage Logbook" };

/** Where an upload link from your assistant lands: add photos or PDFs of shop paperwork to one visit. */
export default function UploadPage({ params }: PageProps<"/up/[token]">) {
  return (
    <div className="wrap narrow">
      <header className="top"><h1>Garage Logbook</h1></header>
      <Suspense fallback={<p className="muted">Loading…</p>}><Upload params={params} /></Suspense>
    </div>
  );
}

async function Upload({ params }: { params: PageProps<"/up/[token]">["params"] }) {
  const { token } = await params;
  // The link's expiry is checked against the current time, so this renders per request.
  await connection();
  const t = readUploadToken(token);
  const v = t && (await getRecord(t.userId, "visits", t.visitId));
  if (!t || !v) return <div className="card"><p className="flush">This upload link has expired. Ask your assistant for a new one.</p></div>;
  const pages = await listRecords(t.userId, "files", "visit_id = $2", [t.visitId]);
  const car = v.carId ? await getRecord(t.userId, "cars", v.carId) : null;
  return <UploadPanel token={token} userId={t.userId} visitId={v.id} title={v.title || "Shop visit"} car={car?.name ?? null} start={pages.length ? Math.max(...pages.map((p) => p.position)) + 1 : 0} />;
}
