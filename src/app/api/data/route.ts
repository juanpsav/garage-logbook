import { loadGarage } from "@/server/garage";
import { getOwner, unauthorized } from "@/server/session";

/** Everything in the owner's garage, in one request. */
export async function GET() {
  const owner = await getOwner();
  if (!owner) return unauthorized();
  return Response.json(await loadGarage(owner.id));
}
