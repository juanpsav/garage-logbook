// Copies each user's old JSON records (table `records`) into the cars, visits, items, tasks and files tables.
// Safe to run more than once: rows are upserted, and `records` is left as it was.
//   set -a && . ./.env.local && set +a && npx tsx scripts/migrate-records.mts [--dry]
import pg from "pg";
import { fromLegacy, type LegacyData } from "../src/lib/legacy.ts";
import { upsertQuery } from "../src/server/tables.ts";
import type { CollectionName } from "../src/lib/types.ts";

const dry = process.argv.includes("--dry");
const ORDER: CollectionName[] = ["cars", "visits", "items", "tasks", "files"];
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const rows = (await client.query("select user_id, collection, id, data from records")).rows as { user_id: string; collection: string; id: string; data: Record<string, unknown> }[];
const byUser = new Map<string, LegacyData>();
for (const r of rows) {
  const u = byUser.get(r.user_id) ?? {};
  ((u as Record<string, unknown[]>)[r.collection] ??= []).push({ ...r.data, id: r.id });
  byUser.set(r.user_id, u);
}
for (const [userId, raw] of byUser) {
  const data = fromLegacy(raw);
  console.log(`user …${userId.slice(-4)}:`, ORDER.map((c) => `${c} ${data[c].length}`).join(", "));
  if (dry) continue;
  await client.query("begin");
  try {
    for (const c of ORDER) for (const rec of data[c]) {
      const q = upsertQuery(userId, c, rec as never);
      await client.query(q.text, q.values);
    }
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  }
}
await client.end();
console.log(dry ? "Dry run, nothing written." : "Done.");
