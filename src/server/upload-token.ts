import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A link that lets a phone add pages to one visit without signing in again. An agent hands it out;
 * it names the user and visit, expires, and is signed with the app secret.
 */
const sign = (body: string) => createHmac("sha256", process.env.BETTER_AUTH_SECRET ?? "").update(`upload:${body}`).digest("base64url");

export function makeUploadToken(userId: string, visitId: string, minutes = 60) {
  const body = Buffer.from(JSON.stringify({ u: userId, v: visitId, e: Math.floor(Date.now() / 1000) + minutes * 60 })).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function readUploadToken(token: string): { userId: string; visitId: string } | null {
  const [body, sig] = token.split(".");
  if (!body || !sig || !process.env.BETTER_AUTH_SECRET) return null;
  const want = Buffer.from(sign(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const { u, v, e } = JSON.parse(Buffer.from(body, "base64url").toString());
    if (typeof u !== "string" || typeof v !== "string" || typeof e !== "number" || e < Date.now() / 1000) return null;
    return { userId: u, visitId: v };
  } catch {
    return null;
  }
}

export const uploadUrl = (token: string) => `${(process.env.BETTER_AUTH_URL ?? "").replace(/\/$/, "")}/up/${token}`;
