import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { LIMITS, take } from "@/server/limits";
import { readUploadToken } from "@/server/upload-token";

/** Issues Blob upload tokens for an upload link, into the link owner's own folder. */
export async function POST(req: Request, ctx: RouteContext<"/api/up/[token]/blob">) {
  const t = readUploadToken((await ctx.params).token);
  if (!t) return Response.json({ error: "expired" }, { status: 401 });
  const body = (await req.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(`u/${t.userId}/`) || pathname.includes("..")) throw new Error("bad path");
        if (await take([{ key: `upload:user:${t.userId}`, limit: LIMITS.memberUploads }])) throw new Error("rate_limited");
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf"],
          maximumSizeInBytes: 20 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
    });
    return Response.json(json);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
