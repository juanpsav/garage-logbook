import "server-only";
import { COLLECTIONS, type CollectionName, type Collections, type Data } from "@/lib/types";
import { sql } from "./db";
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

/** What a tool call is about: one visit, or one car. */

export type Thread = { visitId: string } | { carId: string };
