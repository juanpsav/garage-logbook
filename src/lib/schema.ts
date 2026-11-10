import { z } from "zod";
import type { CollectionName, Collections } from "./types";

/** Checks records coming from the browser before they reach the database. */
const id = z.string().regex(/^[\w-]{1,64}$/);
const ref = id.nullable();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const text = (max: number) => z.string().max(max);
const int = z.number().int().min(0).max(10_000_000);
const money = z.number().min(-1_000_000).max(1_000_000);
const stamp = z.string().max(40);

export const schemas = {
  cars: z.object({
    id, name: text(120).min(1), km: int, kmDate: date.nullish(), scheduleId: z.string().max(200).nullish(), created: stamp,
  }),
  tasks: z.object({
    id, carId: id, title: text(200).min(1), notes: text(2000).optional(), created: stamp,
    everyMonths: int.nullish(), everyKm: int.nullish(), anchor: z.string().regex(/^\d{2}-\d{2}$/).nullish(),
    dueDate: date.nullish(), dueKm: int.nullish(), sugKey: z.string().max(100).optional(), visitId: ref.optional(),
  }),
  visits: z.object({
    id, carId: ref, title: text(200), date: date.nullable(), km: int.nullable(), shop: text(200).nullable(),
    total: money.nullable(), summary: text(4000).nullable(), status: z.enum(["draft", "open", "confirmed"]), created: stamp,
  }),
  items: z.object({
    id, carId: ref, visitId: ref, source: z.enum(["shop", "you"]), kind: z.enum(["done", "found", "quoted"]),
    text: text(500).min(1), original: text(1000).nullable(), cost: money.nullable(), page: z.number().int().min(1).max(50).nullable(),
    unsure: z.boolean(), keywords: z.array(text(60)).max(20), note: text(2000).nullable(),
    decision: z.enum(["pending", "accepted", "declined", "deferred"]).nullable(), created: stamp,
  }),
  files: z.object({
    id, visitId: ref, itemId: ref, position: z.number().int().min(0).max(100), type: text(100), name: text(255).nullable(),
    orig: text(300), view: text(300).nullable(), created: stamp,
  }),
} satisfies { [K in CollectionName]: z.ZodType<Collections[K]> };
