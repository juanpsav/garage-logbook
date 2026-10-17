import { LIMITS, take } from "@/server/limits";
import { LookupError, lookupSchedule } from "@/server/schedule-lookup";
import { saveLookup } from "@/server/schedules";
import { getOwner, unauthorized } from "@/server/session";

export const maxDuration = 300;

/** Owner only: researches the official schedule for a vehicle and adds it to the shared list. */
export async function POST(req: Request) {
  const owner = await getOwner();
  if (!owner) return unauthorized();
  const body = await req.json().catch(() => null);
  const vehicle = typeof body?.vehicle === "string" ? body.vehicle.trim().slice(0, 160) : "";
  if (vehicle.length < 6) return Response.json({ error: "bad_request" }, { status: 400 });
  if (await take([{ key: `schedule:owner:${owner.id}`, limit: LIMITS.ownerSchedules }])) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }
  try {
    const r = await lookupSchedule(vehicle);
    if (!r.found || !r.items.length) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json({ schedule: await saveLookup(r, owner.id) });
  } catch (e) {
    console.error("schedule lookup failed:", e instanceof LookupError ? e.message : e);
    return Response.json({ error: "upstream" }, { status: 502 });
  }
}
