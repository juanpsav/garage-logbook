import { matchSchedule } from "@/lib/logic";
import { getRecord, putRecord } from "@/server/garage";
import { LIMITS, take, userBuckets } from "@/server/limits";
import { LookupError, lookupSchedule } from "@/server/schedule-lookup";
import { listSchedules, saveLookup } from "@/server/schedules";
import { getOwner, unauthorized } from "@/server/session";

// Researching a manufacturer schedule on the web can take a couple of minutes.
export const maxDuration = 300;

const fail = (error: string, status: number) => Response.json({ error }, { status });

/** Finds the car's official maintenance schedule (a saved one if it matches, else a web lookup) and attaches it. */
export async function POST(_req: Request, ctx: RouteContext<"/api/cars/[id]/schedule">) {
  const owner = await getOwner();
  if (!owner) return unauthorized();
  const car = await getRecord(owner.id, "cars", (await ctx.params).id);
  if (!car) return fail("not_found", 404);
  const saved = matchSchedule(car.name, await listSchedules());
  if (saved) {
    await putRecord(owner.id, "cars", { ...car, scheduleId: saved.id });
    return Response.json({ schedule: saved });
  }
  const over = await take(userBuckets("schedule", owner, owner.admin ? LIMITS.adminSchedules : LIMITS.memberSchedules, LIMITS.memberSchedulesTotal));
  if (over) return fail(over.endsWith(":members") ? "busy" : "rate_limited", 429);
  try {
    const r = await lookupSchedule(car.name);
    if (!r.found || !r.items.length) return fail("not_found", 404);
    const sc = await saveLookup(r, owner.id, owner.admin);
    await putRecord(owner.id, "cars", { ...car, scheduleId: sc.id });
    return Response.json({ schedule: sc });
  } catch (e) {
    console.error("schedule lookup failed:", e instanceof LookupError ? e.message : e);
    return fail("upstream", 502);
  }
}
