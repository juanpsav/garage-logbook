import "server-only";

/**
 * Verifies a Turnstile token with Cloudflare: it must be valid, issued for this action, and issued on
 * one of TURNSTILE_HOSTNAMES. Fails closed on any error. With no secret configured (local dev), everything passes.
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
    return r?.success === true && r.action === action && hostnames.has(r.hostname);
  } catch {
    return false;
  }
}
