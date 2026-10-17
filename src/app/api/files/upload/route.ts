import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getOwner, unauthorized } from "@/server/session";

/** Issues a short-lived token so the browser uploads straight to the private Blob store. */
export async function POST(req: Request) {
  const owner = await getOwner();
  if (!owner) return unauthorized();
  const body = (await req.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith(`u/${owner.id}/`)) throw new Error("bad path");
        return {
          allowedContentTypes: ["image/jpeg", "application/pdf"],
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
