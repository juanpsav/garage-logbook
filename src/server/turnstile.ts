import "server-only";
import { createHash } from "node:crypto";
import { take } from "./limits";

/**
 * Verifies a Turnstile token with Cloudflare: it must be valid, issued for this action, and issued on
 * one of TURNSTILE_HOSTNAMES, and not used before. Fails closed on any error. With no secret configured (local dev), everything passes.
 */
export async function verifyTurnstile(token: string | null, ip: string | null, action: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) return true;
  const hostnames = new Set((process.env.TURNSTILE_HOSTNAMES ?? "").split(",").map((h) => h.trim()).filter(Boolean));
  if (typeof token !== "string" || !token || token.length > 2048 || !hostnames.size) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return false;
    const r = await res.json();
    if (r?.success !== true || r.action !== action || !hostnames.has(r.hostname)) return false;
    // Siteverify was seen accepting the same token twice, so enforce single use here too.
    const seen = createHash("sha256").update(token).digest("hex");
    return !(await take([{ key: `turnstile:${seen}`, limit: 1 }]));
  } catch {
    return false;
  }
}
