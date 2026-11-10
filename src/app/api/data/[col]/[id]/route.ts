import { schemas } from "@/lib/schema";
import { COLLECTIONS, type CollectionName } from "@/lib/types";
import { deleteRecord, putRecord } from "@/server/garage";
import { getOwner, unauthorized } from "@/server/session";

const MAX_BYTES = 100_000;
const bad = (error = "bad_request") => Response.json({ error }, { status: 400 });
const validCol = (col: string): col is CollectionName => COLLECTIONS.includes(col as CollectionName);

export async function PUT(req: Request, ctx: RouteContext<"/api/data/[col]/[id]">) {
  const owner = await getOwner();
  if (!owner) return unauthorized();
  const { col, id } = await ctx.params;
  if (!validCol(col)) return bad();
  const text = await req.text();
  if (text.length > MAX_BYTES) return Response.json({ error: "too_large" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return bad();
  }
  const parsed = schemas[col].safeParse(body);
  if (!parsed.success || parsed.data.id !== id) return bad();
  // A file must point into the owner's own folder of the Blob store.
  if (col === "files") {
    const f = parsed.data as { orig: string; view: string | null };
    if (![f.orig, f.view].every((p) => p == null || (p.startsWith(`u/${owner.id}/`) && !p.includes("..")))) return bad();
  }
  try {
    await putRecord(owner.id, col, parsed.data);
  } catch (e) {
    // 23503: a reference to a car or visit that isn't there.
    if ((e as { code?: string }).code === "23503") return bad("missing_reference");
    throw e;
  }
  return new Response(null, { status: 204 });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/data/[col]/[id]">) {
  const owner = await getOwner();
  if (!owner) return unauthorized();
  const { col, id } = await ctx.params;
  if (!validCol(col) || !/^[\w-]{1,64}$/.test(id)) return bad();
  await deleteRecord(owner.id, col, id);
  return new Response(null, { status: 204 });
}
