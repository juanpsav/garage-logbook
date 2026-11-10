import { Pool, types } from "pg";

// Dates stay "YYYY-MM-DD" strings (a Date would shift with the server's time zone); money comes back as a number.
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1700, (v) => (v == null ? null : Number(v)));

let pool: Pool | null = null;

export const hasDb = () => !!process.env.DATABASE_URL;

export function getPool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  return pool;
}

export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await getPool().query(text, params);
  return res.rows as T[];
}
