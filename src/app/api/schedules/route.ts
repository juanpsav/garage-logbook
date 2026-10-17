import { listSchedules } from "@/server/schedules";

/** The shared schedule list. Everyone can read it; lookups by the owner add to it. */
export async function GET() {
  return Response.json(await listSchedules());
}
