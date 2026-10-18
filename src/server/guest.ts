import "server-only";
import { cookies, headers } from "next/headers";
import { randomUUID } from "node:crypto";
import { take } from "./limits";
import { verifyTurnstile } from "./turnstile";

const DEVICE_COOKIE = "gl_device";

export type GuestLimits = { total: number; perIp: number; perDevice: number };

/**
 * Guards a paid call made by a guest: bot check, then daily caps for all guests, per IP and per
 * device (a long-lived cookie). Returns an error code, or null when the call may go ahead.
 */
export async function guestGate(kind: string, token: string | null, limits: GuestLimits): Promise<"bot_check" | "busy" | "rate_limited" | null> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null;
  if (!(await verifyTurnstile(token, ip, kind))) return "bot_check";
  const jar = await cookies();
  let device = jar.get(DEVICE_COOKIE)?.value;
  if (!device || !/^[\w-]{36}$/.test(device)) {
    device = randomUUID();
    jar.set(DEVICE_COOKIE, device, { httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 * 60 * 24 * 400, path: "/" });
  }
  const over = await take([
    { key: `${kind}:guests`, limit: limits.total },
    { key: `${kind}:ip:${ip ?? "unknown"}`, limit: limits.perIp },
    { key: `${kind}:device:${device}`, limit: limits.perDevice },
  ]);
  return !over ? null : over === `${kind}:guests` ? "busy" : "rate_limited";
}
