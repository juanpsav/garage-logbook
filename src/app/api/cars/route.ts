import { z } from "zod";
import { now, today, uid } from "@/lib/dates";
import { matchSchedule } from "@/lib/logic";
import type { Car } from "@/lib/types";
import { putRecord } from "@/server/garage";
import { listSchedules } from "@/server/schedules";
import { getOwner, unauthorized } from "@/server/session";

const Body = z.object({ name: z.string().trim().min(3).max(120), km: z.number().int().min(0).max(3_000_000) });

/** Adds a car from the web app. A saved manufacturer schedule that matches the name is attached. */
export async function POST(req: Request) {
  const owner = await getOwner();
  if (!owner) return unauthorized();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const { name, km } = parsed.data;
  const sc = matchSchedule(name, await listSchedules());
  const car: Car = { id: uid(), name, km, kmDate: today(), scheduleId: sc?.id ?? null, created: now() };
  await putRecord(owner.id, "cars", car);
  return Response.json({ car, schedule: sc ?? null });
}
