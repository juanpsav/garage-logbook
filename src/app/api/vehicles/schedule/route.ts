import { guestGate } from "@/server/guest";
import { LIMITS, take } from "@/server/limits";
import { LookupError, lookupSchedule } from "@/server/schedule-lookup";
import { matchSchedule } from "@/lib/logic";
import { listSchedules, saveLookup } from "@/server/schedules";
import { getOwner } from "@/server/session";

export const maxDuration = 300;

const fail = (error: string, status: number) => Response.json({ error }, { status });

/** Researches the official schedule for a vehicle and adds it to the shared list. Guests get a few a day. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const vehicle = typeof body?.vehicle === "string" ? body.vehicle.trim().slice(0, 160) : "";
  if (vehicle.length < 6) return fail("bad_request", 400);
  // A saved schedule for this vehicle costs nothing; "fresh" asks for a new lookup anyway.
  if (body?.fresh !== true) {
    const saved = matchSchedule(vehicle, await listSchedules());
    if (saved) return Response.json({ schedule: saved });
  }
  const owner = await getOwner();
  if (owner) {
    if (await take([{ key: `schedule:owner:${owner.id}`, limit: LIMITS.ownerSchedules }])) return fail("rate_limited", 429);
  } else {
    const err = await guestGate("schedule", typeof body?.turnstile === "string" ? body.turnstile : null, {
      total: LIMITS.guestSchedulesTotal, perIp: LIMITS.guestSchedulesPerIp, perDevice: LIMITS.guestSchedulesPerDevice,
    });
    if (err) return fail(err, err === "bot_check" ? 403 : 429);
  }
  try {
    const r = await lookupSchedule(vehicle);
    if (!r.found || !r.items.length) return fail("not_found", 404);
    return Response.json({ schedule: await saveLookup(r, owner?.id ?? null) });
  } catch (e) {
    console.error("schedule lookup failed:", e instanceof LookupError ? e.message : e);
    return fail("upstream", 502);
  }
}
