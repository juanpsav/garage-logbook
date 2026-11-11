import "server-only";
import { sql, hasDb } from "./db";

const envInt = (name: string, fallback: number) => {
  const n = parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/** Daily limits for schedule lookups (web research with Claude) and uploads. All overridable from Vercel's environment settings. */
export const LIMITS = {
  adminSchedules: envInt("SCHEDULE_LIMIT_ADMIN", 10),
  // Anyone can sign up, so signed-in users get modest caps each, plus a cap across all of them.
  memberSchedules: envInt("SCHEDULE_LIMIT_MEMBER", 1),
  memberSchedulesTotal: envInt("SCHEDULE_LIMIT_MEMBER_TOTAL", 3),
  memberUploads: envInt("UPLOAD_LIMIT_MEMBER", 80),
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
