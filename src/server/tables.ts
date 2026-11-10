import type { CollectionName, Collections } from "@/lib/types";

// No "server-only" here: scripts/migrate-records.mts uses this too.

type Field = readonly [key: string, col: string];

/** How each collection maps to its table. Keys are the app's field names, cols the table's. */
export const TABLES: { [K in CollectionName]: { table: string; fields: readonly Field[] } } = {
  cars: { table: "cars", fields: [["name", "name"], ["km", "km"], ["kmDate", "km_date"], ["scheduleId", "schedule_id"], ["created", "created"]] },
  tasks: {
    table: "tasks",
    fields: [
      ["carId", "car_id"], ["title", "title"], ["notes", "notes"], ["everyMonths", "every_months"], ["everyKm", "every_km"],
      ["anchor", "anchor"], ["dueDate", "due_date"], ["dueKm", "due_km"], ["sugKey", "sug_key"], ["visitId", "visit_id"], ["created", "created"],
    ],
  },
  visits: {
    table: "visits",
    fields: [["carId", "car_id"], ["title", "title"], ["date", "date"], ["km", "km"], ["shop", "shop"], ["total", "total"], ["summary", "summary"], ["status", "status"], ["created", "created"]],
  },
  items: {
    table: "items",
    fields: [
      ["carId", "car_id"], ["visitId", "visit_id"], ["source", "source"], ["kind", "kind"], ["text", "text"], ["original", "original"],
      ["cost", "cost"], ["page", "page"], ["unsure", "unsure"], ["keywords", "keywords"], ["note", "note"], ["decision", "decision"], ["created", "created"],
    ],
  },
  files: {
    table: "files",
    fields: [["visitId", "visit_id"], ["itemId", "item_id"], ["position", "position"], ["type", "type"], ["name", "name"], ["orig", "orig"], ["view", "view"], ["created", "created"]],
  },
};

export function fromRow<K extends CollectionName>(col: K, row: Record<string, unknown>): Collections[K] {
  const o: Record<string, unknown> = { id: row.id };
  for (const [k, c] of TABLES[col].fields) {
    const v = row[c];
    o[k] = v instanceof Date ? v.toISOString() : v;
  }
  // Optional task fields are left out rather than null, as the app writes them.
  if (col === "tasks") for (const k of ["notes", "sugKey"]) if (o[k] == null) delete o[k];
  return o as Collections[K];
}

/** An insert-or-replace for one record. */
export function upsertQuery<K extends CollectionName>(userId: string, col: K, obj: Collections[K]) {
  const { table, fields } = TABLES[col];
  const rec = obj as Record<string, unknown>;
  const cols = ["user_id", "id", ...fields.map(([, c]) => c)];
  const values = [userId, rec.id, ...fields.map(([k]) => rec[k] ?? null)];
  // A missing created stamp falls back to now() through the column default.
  const ci = cols.indexOf("created");
  if (values[ci] == null) { cols.splice(ci, 1); values.splice(ci, 1); }
  const sets = cols.filter((c) => c !== "user_id" && c !== "id" && c !== "created").map((c) => `${c} = excluded.${c}`);
  return {
    text: `insert into ${table} (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")})
     on conflict (user_id, id) do update set ${sets.join(", ")}`,
    values,
  };
}
