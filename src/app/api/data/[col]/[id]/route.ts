import { schemas } from "@/lib/schema";
import { COLLECTIONS, type CollectionName } from "@/lib/types";
import { del } from "@vercel/blob";
import { deleteRecord, listRecords, putRecord } from "@/server/garage";
import { getOwner, unauthorized } from "@/server/session";

const MAX_BYTES = 100_000;
const bad = (error = "bad_request") => Response.json({ error }, { status: 400 });
// Quick edits from the web app. Pages only arrive through upload links, so files aren't writable here.
const EDITABLE = new Set<CollectionName>(["cars", "tasks", "visits", "items"]);
// Deleting a car removes its tasks; its visits and history stay, without a car.
const DELETABLE = new Set<CollectionName>(["cars", "tasks", "items", "visits"]);
const validCol = (col: string): col is CollectionName => COLLECTIONS.includes(col as CollectionName);

export async function PUT(req: Request, ctx: RouteContext<"/api/data/[col]/[id]">) {
  const owner = await getOwner();
  if (!owner) return unauthorized();
  const { col, id } = await ctx.params;
  if (!validCol(col) || !EDITABLE.has(col)) return bad();
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
  if (!validCol(col) || !DELETABLE.has(col) || !/^[\w-]{1,64}$/.test(id)) return bad();
  // A visit takes its stored pages with it.
  if (col === "visits") {
    const files = await listRecords(owner.id, "files", "visit_id = $2", [id]);
    const paths = [...new Set(files.flatMap((f) => [f.orig, f.view]).filter((p): p is string => !!p && p.startsWith(`u/${owner.id}/`)))];
    if (paths.length) await del(paths);
  }
  await deleteRecord(owner.id, col, id);
  return new Response(null, { status: 204 });
}
