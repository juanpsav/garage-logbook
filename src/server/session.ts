import "server-only";
import { headers } from "next/headers";
import { authConfigured, getAuth, isAdmin } from "./auth";

export type Owner = { id: string; email: string; admin: boolean };

/** The signed-in user, or null for guests. */
export async function getOwner(): Promise<Owner | null> {
  if (!authConfigured()) return null;
  // Outside the try: reading headers is what marks the request dynamic, and that signal must not be swallowed.
  const h = await headers();
  try {
    const s = await getAuth().api.getSession({ headers: h });
    if (!s) return null;
    return { id: s.user.id, email: s.user.email, admin: isAdmin(s.user.email) };
  } catch (e) {
    console.error("session lookup failed:", e);
    return null;
  }
}

export const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });
