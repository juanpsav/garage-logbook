import { sql } from "@/server/db";
import { getOwner, unauthorized } from "@/server/session";
import { COLLECTIONS, type CollectionName } from "@/lib/types";

const MAX_BYTES = 100_000;
const valid = (col: string, id: string) => COLLECTIONS.includes(col as CollectionName) && /^[\w-]{1,64}$/.test(id);

export async function PUT(req: Request, ctx: RouteContext<"/api/data/[col]/[id]">) {
  const owner = await getOwner();
  if (!owner) return unauthorized();
  const { col, id } = await ctx.params;
  if (!valid(col, id)) return Response.json({ error: "bad_request" }, { status: 400 });
  const text = await req.text();
  if (text.length > MAX_BYTES) return Response.json({ error: "too_large" }, { status: 413 });
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return Response.json({ error: "bad_request" }, { status: 400 });
  delete data.id;
  await sql(
    `insert into records (user_id, collection, id, data) values ($1, $2, $3, $4)
     on conflict (user_id, collection, id) do update set data = excluded.data, updated_at = now()`,
    [owner.id, col, id, data],
  );
  return new Response(null, { status: 204 });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/data/[col]/[id]">) {
  const owner = await getOwner();
  if (!owner) return unauthorized();
  const { col, id } = await ctx.params;
  if (!valid(col, id)) return Response.json({ error: "bad_request" }, { status: 400 });
  await sql("delete from records where user_id = $1 and collection = $2 and id = $3", [owner.id, col, id]);
  return new Response(null, { status: 204 });
}
