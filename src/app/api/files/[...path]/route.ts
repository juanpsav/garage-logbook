import { del, get } from "@vercel/blob";
import { getOwner, unauthorized } from "@/server/session";

/** Private files are served through here so only the owner can open them. */
async function resolve(ctx: RouteContext<"/api/files/[...path]">) {
  const owner = await getOwner();
  if (!owner) return null;
  const pathname = (await ctx.params).path.join("/");
  return pathname.startsWith(`u/${owner.id}/`) && !pathname.includes("..") ? pathname : null;
}

export async function GET(_req: Request, ctx: RouteContext<"/api/files/[...path]">) {
  const pathname = await resolve(ctx);
  if (!pathname) return unauthorized();
  const r = await get(pathname, { access: "private" });
  if (!r || r.statusCode !== 200) return new Response("Not found", { status: 404 });
  return new Response(r.stream, {
    headers: {
      "Content-Type": r.headers.get("content-type") ?? "application/octet-stream",
      "Cache-Control": "private, max-age=86400, immutable",
    },
  });
}

export async function DELETE(_req: Request, ctx: RouteContext<"/api/files/[...path]">) {
  const pathname = await resolve(ctx);
  if (!pathname) return unauthorized();
  await del(pathname);
  return new Response(null, { status: 204 });
}
