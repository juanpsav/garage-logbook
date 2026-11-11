import { loadGarage } from "@/server/garage";
import { listSchedules } from "@/server/schedules";
import { getOwner, unauthorized } from "@/server/session";

/** Everything in the owner's garage, with the manufacturer schedules its cars follow, in one request. */
export async function GET() {
  const owner = await getOwner();
  if (!owner) return unauthorized();
  const data = await loadGarage(owner.id);
  const ids = new Set(data.cars.map((c) => c.scheduleId).filter(Boolean));
  const schedules = ids.size ? (await listSchedules()).filter((s) => ids.has(s.id)) : [];
  return Response.json({ ...data, schedules });
}
