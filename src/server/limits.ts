import "server-only";
import { sql, hasDb } from "./db";

const envInt = (name: string, fallback: number) => {
  const n = parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/** Daily limits for document reads and schedule lookups. All overridable from Vercel's environment settings. */
export const LIMITS = {
  guestPerDevice: envInt("READ_LIMIT_GUEST_DEVICE", 5),
  guestPerIp: envInt("READ_LIMIT_GUEST_IP", 10),
  guestTotal: envInt("READ_LIMIT_GUEST_TOTAL", 100),
  admin: envInt("READ_LIMIT_ADMIN", 60),
  adminSchedules: envInt("SCHEDULE_LIMIT_ADMIN", 10),
  // Anyone can sign up, so signed-in users get modest caps each, plus a cap across all of them.
  member: envInt("READ_LIMIT_MEMBER", 10),
  memberTotal: envInt("READ_LIMIT_MEMBER_TOTAL", 100),
  memberSchedules: envInt("SCHEDULE_LIMIT_MEMBER", 2),
  memberSchedulesTotal: envInt("SCHEDULE_LIMIT_MEMBER_TOTAL", 10),
  memberUploads: envInt("UPLOAD_LIMIT_MEMBER", 100),
  // Schedule lookups cost far more than reads (web research with Claude), so guests get few.
  guestSchedulesPerDevice: envInt("SCHEDULE_LIMIT_GUEST_DEVICE", 2),
  guestSchedulesPerIp: envInt("SCHEDULE_LIMIT_GUEST_IP", 3),
  guestSchedulesTotal: envInt("SCHEDULE_LIMIT_GUEST_TOTAL", 15),
};

/** Daily caps for a signed-in user: their own, plus one shared by all non-admin users. */
export function userBuckets(kind: string, user: { id: string; admin: boolean }, mine: number, all: number) {
  return user.admin
    ? [{ key: `${kind}:admin:${user.id}`, limit: mine }]
    : [{ key: `${kind}:members`, limit: all }, { key: `${kind}:user:${user.id}`, limit: mine }];
}

const day = () => new Date().toISOString().slice(0, 10);
const memory = new Map<string, number>();

/**
 * Counts one use against each bucket for today (UTC) and reports the first bucket that is
 * over its limit. Counting happens even when refused, so retries don't get a free pass.
 */
export async function take(buckets: { key: string; limit: number }[]): Promise<string | null> {
  const d = day();
  // In-memory counts reset on every cold start, so they protect nothing in production.
  if (!hasDb() && process.env.VERCEL_ENV === "production") return buckets[0]?.key ?? "no-db";
  for (const b of buckets) {
    const key = `${d}:${b.key}`;
    let count: number;
    if (hasDb()) {
      const rows = await sql<{ count: number }>(
        `insert into usage_counts (key, day, count) values ($1, $2, 1)
         on conflict (key, day) do update set count = usage_counts.count + 1
         returning count`,
        [b.key, d],
      );
      count = rows[0].count;
    } else {
      count = (memory.get(key) ?? 0) + 1;
      memory.set(key, count);
    }
    if (count > b.limit) return b.key;
  }
  return null;
}
