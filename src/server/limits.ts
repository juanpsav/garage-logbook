import "server-only";
import { sql, hasDb } from "./db";

const envInt = (name: string, fallback: number) => {
  const n = parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/** Daily document-read limits. All overridable from Vercel's environment settings. */
export const LIMITS = {
  guestPerDevice: envInt("READ_LIMIT_GUEST_DEVICE", 5),
  guestPerIp: envInt("READ_LIMIT_GUEST_IP", 10),
  guestTotal: envInt("READ_LIMIT_GUEST_TOTAL", 100),
  owner: envInt("READ_LIMIT_OWNER", 60),
  ownerSchedules: envInt("SCHEDULE_LIMIT_OWNER", 10),
};

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
