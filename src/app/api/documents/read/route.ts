import { cookies, headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { readPrompt, type ReadContext } from "@/lib/extraction";
import { readWithCohere, UpstreamError } from "@/server/cohere";
import { LIMITS, take } from "@/server/limits";
import { getOwner } from "@/server/session";
import { verifyTurnstile } from "@/server/turnstile";

export const maxDuration = 60;

const MAX_PAGES = 4;
const MAX_PAGE_BYTES = 1_500_000;
const DEVICE_COOKIE = "gl_device";

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

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null;
  const owner = await getOwner();
  const jar = await cookies();

  let over: string | null;
  if (owner) {
    over = await take([{ key: `read:owner:${owner.id}`, limit: LIMITS.owner }]);
  } else {
    if (!(await verifyTurnstile(String(form.get("turnstile") ?? "") || null, ip))) return fail("bot_check", 403);
    let device = jar.get(DEVICE_COOKIE)?.value;
    if (!device || !/^[\w-]{36}$/.test(device)) {
      device = randomUUID();
      jar.set(DEVICE_COOKIE, device, { httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 * 60 * 24 * 400, path: "/" });
    }
    over = await take([
      { key: "read:guests", limit: LIMITS.guestTotal },
      { key: `read:ip:${ip ?? "unknown"}`, limit: LIMITS.guestPerIp },
      { key: `read:device:${device}`, limit: LIMITS.guestPerDevice },
    ]);
  }
  if (over) return fail(over === "read:guests" ? "busy" : "rate_limited", 429);

  try {
    const buffers = await Promise.all(pages.map(async (p) => Buffer.from(await p.arrayBuffer())));
    const extraction = await readWithCohere(readPrompt(ctx), buffers, AbortSignal.timeout(55_000));
    return Response.json({ extraction });
  } catch (e) {
    console.error("document read failed:", e instanceof UpstreamError ? e.message : e);
    return fail("upstream", 502);
  }
}
