import "server-only";
import seed from "@/data/schedules.json";
import type { Schedule } from "@/lib/types";
import { hasDb, sql } from "./db";
import type { LookupResult } from "./schedule-lookup";

export async function listSchedules(): Promise<Schedule[]> {
  const base = seed as Schedule[];
  if (!hasDb()) return base;
  const rows = await sql<{ id: string; data: Omit<Schedule, "id"> }>("select id, data from schedules order by created_at");
  const found = rows.map((r) => ({ ...r.data, id: r.id }));
  return [...base.filter((s) => !found.some((f) => f.id === s.id)), ...found];
}

const slug = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

/** Stores a lookup result in the shared list, replacing an earlier lookup of the same vehicle. */
export async function saveLookup(r: LookupResult, ownerId: string): Promise<Schedule> {
  const id = slug(r.name) || `schedule-${Date.now()}`;
  const used = new Set<string>();
  const schedule: Schedule = {
    id,
    name: r.name,
    modelYear: r.modelYear ?? undefined,
    source: r.source,
    sourceUrl: r.sourceUrl ?? undefined,
    note: r.note,
    items: r.items
      .filter((x) => x.months || x.km)
      .map((x) => {
        let key = `m-${slug(x.title).slice(0, 40)}`;
        while (used.has(key)) key += "-2";
        used.add(key);
        return {
          key, title: x.title, why: x.why,
          ...(x.months ? { months: x.months } : {}),
          ...(x.km ? { km: x.km } : {}),
          ...(x.firstMonths ? { firstMonths: x.firstMonths } : {}),
          ...(x.firstKm ? { firstKm: x.firstKm } : {}),
        };
      }),
  };
  const data: Omit<Schedule, "id"> & { id?: string } = { ...schedule };
  delete data.id;
  await sql(
    `insert into schedules (id, data, created_by) values ($1, $2, $3)
     on conflict (id) do update set data = excluded.data, created_by = excluded.created_by, created_at = now()`,
    [id, data, ownerId],
  );
  return schedule;
}
