import "server-only";
import { headers } from "next/headers";
import { authConfigured, getAuth, isAllowed } from "./auth";

export type Owner = { id: string; email: string };

/** The signed-in owner, or null for guests. The allow list is checked on every request. */
export async function getOwner(): Promise<Owner | null> {
  if (!authConfigured()) return null;
  try {
    const s = await getAuth().api.getSession({ headers: await headers() });
    if (!s || !isAllowed(s.user.email)) return null;
    return { id: s.user.id, email: s.user.email };
  } catch (e) {
    console.error("session lookup failed:", e);
    return null;
  }
}

export const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });
