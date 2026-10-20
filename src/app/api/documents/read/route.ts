import { readPrompt, type ReadContext } from "@/lib/extraction";
import { readWithCohere, UpstreamError } from "@/server/cohere";
import { LIMITS, take, userBuckets } from "@/server/limits";
import { getOwner } from "@/server/session";

export const maxDuration = 60;

const MAX_PAGES = 8;
const MAX_PAGE_BYTES = 1_500_000;

const fail = (error: string, status: number) => Response.json({ error }, { status });

const clip = (v: unknown, n: number) => String(v ?? "").slice(0, n);

/** The page context is client-supplied: keep only the expected fields, bounded. */
function cleanContext(raw: unknown): ReadContext | null {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  if (!o || !Array.isArray(o.cars) || !Array.isArray(o.tasks)) return null;
  return {
    today: /^\d{4}-\d{2}-\d{2}$/.test(String(o.today)) ? String(o.today) : new Date().toISOString().slice(0, 10),
    cars: o.cars.slice(0, 10).map((c: Record<string, unknown>) => ({
      id: clip(c?.id, 40), name: clip(c?.name, 60), odometerKm: Number(c?.odometerKm) || 0, model: c?.model ? clip(c.model, 80) : null,
    })),
    tasks: o.tasks.slice(0, 150).map((t: Record<string, unknown>) => ({ id: clip(t?.id, 40), carId: clip(t?.carId, 40), title: clip(t?.title, 100) })),
  };
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return fail("bad_request", 400);

  const pages = form.getAll("page").filter((p): p is File => p instanceof File);
  if (!pages.length || pages.length > MAX_PAGES) return fail("bad_request", 400);
  if (pages.some((p) => p.type !== "image/jpeg" || p.size > MAX_PAGE_BYTES)) return fail("too_large", 413);

  let ctx: ReadContext | null = null;
  try { ctx = cleanContext(JSON.parse(String(form.get("context") ?? ""))); } catch { /* invalid */ }
  if (!ctx) return fail("bad_request", 400);

  // Reading needs an account, so every read counts against a person's daily limit.
  const owner = await getOwner();
  if (!owner) return fail("unauthorized", 401);
  const over = await take(userBuckets("read", owner, owner.admin ? LIMITS.admin : LIMITS.member, LIMITS.memberTotal));
  if (over) return fail(over === "read:members" ? "busy" : "rate_limited", 429);

  try {
    const buffers = await Promise.all(pages.map(async (p) => Buffer.from(await p.arrayBuffer())));
    const extraction = await readWithCohere(readPrompt(ctx), buffers, AbortSignal.timeout(55_000));
    return Response.json({ extraction });
  } catch (e) {
    console.error("document read failed:", e instanceof UpstreamError ? e.message : e);
    return fail("upstream", 502);
  }
}
