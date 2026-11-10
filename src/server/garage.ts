import "server-only";
import { COLLECTIONS, type CollectionName, type Collections, type Data } from "@/lib/types";
import { getPool, sql } from "./db";
import { fromRow, TABLES, upsertQuery } from "./tables";

export async function loadGarage(userId: string): Promise<Data> {
  const out = {} as Record<CollectionName, unknown[]>;
  await Promise.all(COLLECTIONS.map(async (c) => {
    const rows = await sql(`select * from ${TABLES[c].table} where user_id = $1 order by created`, [userId]);
    out[c] = rows.map((r) => fromRow(c, r));
  }));
  return out as Data;
}

export async function getRecord<K extends CollectionName>(userId: string, col: K, id: string): Promise<Collections[K] | null> {
  const [r] = await sql(`select * from ${TABLES[col].table} where user_id = $1 and id = $2`, [userId, id]);
  return r ? fromRow(col, r) : null;
}

export async function listRecords<K extends CollectionName>(userId: string, col: K, where = "", params: unknown[] = []): Promise<Collections[K][]> {
  const rows = await sql(`select * from ${TABLES[col].table} where user_id = $1 ${where ? `and ${where}` : ""} order by created`, [userId, ...params]);
  return rows.map((r) => fromRow(col, r));
}

/** Inserts or replaces a record. The caller has validated it. */
export async function putRecord<K extends CollectionName>(userId: string, col: K, obj: Collections[K]) {
  const q = upsertQuery(userId, col, obj);
  await sql(q.text, q.values);
}

export async function deleteRecord(userId: string, col: CollectionName, id: string) {
  await sql(`delete from ${TABLES[col].table} where user_id = $1 and id = $2`, [userId, id]);
}

/* ---------- conversations ---------- */

export type Thread = { visitId: string } | { carId: string };
const threadWhere = (t: Thread): [string, string] => ("visitId" in t ? ["visit_id = $2", t.visitId] : ["car_id = $2", t.carId]);

export type StoredMessage = { id: number; role: "user" | "assistant"; content: unknown; created: string };

export async function loadMessages(userId: string, t: Thread): Promise<StoredMessage[]> {
  const [w, v] = threadWhere(t);
  const rows = await sql<{ id: string; role: "user" | "assistant"; content: unknown; created: Date }>(
    `select id, role, content, created from messages where user_id = $1 and ${w} order by id`,
    [userId, v],
  );
  return rows.map((r) => ({ id: Number(r.id), role: r.role, content: r.content, created: r.created.toISOString() }));
}

/** Appends a turn's messages together, so a thread never ends halfway through a tool call. */
export async function appendMessages(userId: string, t: Thread, msgs: { role: "user" | "assistant"; content: unknown }[]) {
  if (!msgs.length) return;
  const client = await getPool().connect();
  try {
    await client.query("begin");
    for (const m of msgs) {
      await client.query(
        "insert into messages (user_id, car_id, visit_id, role, content) values ($1, $2, $3, $4, $5)",
        [userId, "carId" in t ? t.carId : null, "visitId" in t ? t.visitId : null, m.role, JSON.stringify(m.content)],
      );
    }
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
