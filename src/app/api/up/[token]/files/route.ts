import { z } from "zod";
import { schemas } from "@/lib/schema";
import { getRecord, putRecord } from "@/server/garage";
import { readUploadToken } from "@/server/upload-token";

/** Adds uploaded pages to the link's visit. */
export async function POST(req: Request, ctx: RouteContext<"/api/up/[token]/files">) {
  const t = readUploadToken((await ctx.params).token);
  if (!t) return Response.json({ error: "expired" }, { status: 401 });
  const parsed = z.array(schemas.files).min(1).max(20).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const v = await getRecord(t.userId, "visits", t.visitId);
  if (!v) return Response.json({ error: "not_found" }, { status: 404 });
  const mine = (p: string | null) => p == null || (p.startsWith(`u/${t.userId}/`) && !p.includes(".."));
  if (!parsed.data.every((f) => f.visitId === t.visitId && !f.itemId && mine(f.orig) && mine(f.view))) return Response.json({ error: "bad_request" }, { status: 400 });
  for (const f of parsed.data) await putRecord(t.userId, "files", f);
  return new Response(null, { status: 204 });
}
