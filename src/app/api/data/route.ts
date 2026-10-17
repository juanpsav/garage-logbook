import { sql } from "@/server/db";
import { getOwner, unauthorized } from "@/server/session";
import { COLLECTIONS, type Data } from "@/lib/types";

/** Everything in the owner's garage, in one request. */
export async function GET() {
  const owner = await getOwner();
  if (!owner) return unauthorized();
  const rows = await sql<{ collection: keyof Data; id: string; data: Record<string, unknown> }>(
    "select collection, id, data from records where user_id = $1",
    [owner.id],
  );
  const out = Object.fromEntries(COLLECTIONS.map((c) => [c, [] as unknown[]])) as Record<string, unknown[]>;
  for (const r of rows) out[r.collection]?.push({ ...r.data, id: r.id });
  return Response.json(out);
}
