import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { uid } from "@/lib/dates";
import { nextAfterDone } from "@/lib/logic";
import type { Car, Item, Task, Visit } from "@/lib/types";
import { sql } from "../db";
import { deleteRecord, getRecord, listRecords, putRecord, type Thread } from "../garage";

export type ToolCtx = { userId: string; thread: Thread; today: string; changed: boolean };

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD");
const km = z.number().int().min(0).max(3_000_000);
const money = z.number().min(-100_000).max(100_000);
const kind = z.enum(["done", "found", "quoted"]);
const decision = z.enum(["pending", "accepted", "declined", "deferred"]);

const ItemIn = z.object({
  kind: kind.describe("done = work performed on this visit; found = an inspection finding, measurement or something noticed; quoted = work offered or recommended but not done"),
  text: z.string().min(1).max(300).describe("Plain-English description a non-mechanic understands, e.g. 'Replaced the front brake pads'"),
  original: z.string().max(600).nullish().describe("The line exactly as printed or handwritten, abbreviations and all"),
  cost: money.nullish().describe("Amount for this job (parts and labour together), as printed. Null when there is none."),
  page: z.number().int().min(1).max(50).nullish(),
  unsure: z.boolean().nullish().describe("True when you couldn't read or interpret the line with confidence"),
  keywords: z.array(z.string().max(60)).max(12).nullish().describe("A few search words: the part, synonyms, English and French names"),
  note: z.string().max(1500).nullish().describe("Measurements, the owner's own account, what the shop said"),
  decision: decision.nullish().describe("For quoted work, or a finding that needs action: what the owner decided"),
});

type Def<S extends z.ZodType> = { name: string; description: string; input: S; run: (ctx: ToolCtx, input: z.infer<S>) => Promise<unknown> };
const def = <S extends z.ZodType>(d: Def<S>) => d;

/* ---------- helpers ---------- */

class ToolError extends Error {}

async function needCar(ctx: ToolCtx, id: string) {
  const c = await getRecord(ctx.userId, "cars", id);
  if (!c) throw new ToolError(`No car with id ${id}.`);
  return c;
}
async function thisVisit(ctx: ToolCtx) {
  if (!("visitId" in ctx.thread)) throw new ToolError("This conversation isn't about a visit. Use log_work to record work done.");
  const v = await getRecord(ctx.userId, "visits", ctx.thread.visitId);
  if (!v) throw new ToolError("This visit no longer exists.");
  return v;
}
async function needItem(ctx: ToolCtx, id: string) {
  const it = await getRecord(ctx.userId, "items", id);
  if (!it) throw new ToolError(`No item with id ${id}.`);
  return it;
}
async function needTask(ctx: ToolCtx, id: string) {
  const t = await getRecord(ctx.userId, "tasks", id);
  if (!t) throw new ToolError(`No task with id ${id}.`);
  return t;
}
const put: typeof putRecord = async (...a) => { await putRecord(...a); };
async function raiseOdometer(ctx: ToolCtx, c: Car, k: number | null | undefined, d: string | null | undefined) {
  if (k == null || k <= (c.km ?? 0)) return;
  await put(ctx.userId, "cars", { ...c, km: k, kmDate: d && d > (c.kmDate || "") ? d : (c.kmDate ?? d ?? ctx.today) });
}
const now = () => new Date().toISOString();

/* ---------- tools ---------- */

const TOOLS = [
  def({
    name: "update_visit",
    description: "Set details of the visit this conversation is about. Only pass the fields to change.",
    input: z.object({
      carId: z.string().nullish(), title: z.string().max(120).nullish().describe("Short, e.g. 'Tire changeover and inspection at Speedy'"),
      date: date.nullish(), km: km.nullish(), shop: z.string().max(120).nullish(), total: money.nullish().describe("Total paid including tax"),
      summary: z.string().max(1500).nullish().describe("Two or three plain sentences: what was done, found and quoted"),
    }),
    async run(ctx, i) {
      const v = await thisVisit(ctx);
      if (i.carId) await needCar(ctx, i.carId);
      const n: Visit = { ...v };
      for (const k of ["carId", "title", "date", "km", "shop", "total", "summary"] as const) if (i[k] !== undefined && i[k] !== null) (n as Record<string, unknown>)[k] = i[k];
      if (n.status === "draft") n.status = "open";
      await put(ctx.userId, "visits", n);
      // Lines follow the visit's car.
      if (i.carId && i.carId !== v.carId) await sql("update items set car_id = $3 where user_id = $1 and visit_id = $2", [ctx.userId, v.id, i.carId]);
      return { ok: true };
    },
  }),
  def({
    name: "add_items",
    description: "Record lines of work. In a visit conversation they belong to the visit; in a car conversation they are the owner's own observations or notes about the car.",
    input: z.object({ carId: z.string().nullish().describe("Needed in a car conversation; ignored for a visit (the visit's car is used)"), items: z.array(ItemIn).min(1).max(40) }),
    async run(ctx, i) {
      let carId: string | null = null, visitId: string | null = null, source: Item["source"] = "you";
      if ("visitId" in ctx.thread) {
        const v = await thisVisit(ctx);
        carId = v.carId; visitId = v.id; source = "shop";
      } else {
        carId = (await needCar(ctx, i.carId || ctx.thread.carId)).id;
      }
      const ids: string[] = [];
      for (const x of i.items) {
        const it: Item = {
          id: uid(), carId, visitId, source, kind: x.kind, text: x.text, original: x.original ?? null, cost: x.cost ?? null, page: x.page ?? null,
          unsure: !!x.unsure, keywords: x.keywords ?? [], note: x.note ?? null,
          // Quotes wait on a decision; a finding only has one when the owner gives it.
          decision: x.decision ?? (x.kind === "quoted" ? "pending" : null), created: now(),
        };
        await put(ctx.userId, "items", it);
        ids.push(it.id);
      }
      return { ids };
    },
  }),
  def({
    name: "update_item",
    description: "Change a recorded line: fix its reading, add the owner's account, record their decision, or attach one of their earlier observations to this visit (attachToThisVisit).",
    input: ItemIn.partial().extend({ id: z.string(), attachToThisVisit: z.boolean().nullish() }),
    async run(ctx, i) {
      const it = await needItem(ctx, i.id);
      const n: Item = { ...it };
      for (const k of ["kind", "text", "original", "cost", "page", "unsure", "keywords", "note", "decision"] as const) if (i[k] !== undefined && i[k] !== null) (n as Record<string, unknown>)[k] = i[k];
      if (i.attachToThisVisit) { const v = await thisVisit(ctx); n.visitId = v.id; n.carId = v.carId ?? n.carId; }
      await put(ctx.userId, "items", n);
      return { ok: true };
    },
  }),
  def({
    name: "delete_item",
    description: "Remove a recorded line (a duplicate, or one that turned out not to be work).",
    input: z.object({ id: z.string() }),
    async run(ctx, i) {
      await needItem(ctx, i.id);
      await deleteRecord(ctx.userId, "items", i.id);
      return { ok: true };
    },
  }),
  def({
    name: "create_task",
    description: "Add a maintenance task to track. Give a due date and/or km when there is one; give everyMonths/everyKm only for work that repeats.",
    input: z.object({
      carId: z.string(), title: z.string().min(1).max(120), notes: z.string().max(1500).nullish().describe("Why, the quoted price and shop, and how to check it"),
      dueDate: date.nullish(), dueKm: km.nullish(), everyMonths: z.number().int().min(1).max(240).nullish(), everyKm: km.nullish(),
    }),
    async run(ctx, i) {
      await needCar(ctx, i.carId);
      const t: Task = {
        id: uid(), carId: i.carId, title: i.title, notes: i.notes ?? "", created: now(), anchor: null,
        dueDate: i.dueDate ?? null, dueKm: i.dueKm ?? null, everyMonths: i.everyMonths ?? null, everyKm: i.everyKm ?? null,
        visitId: "visitId" in ctx.thread ? ctx.thread.visitId : null,
      };
      await put(ctx.userId, "tasks", t);
      return { id: t.id };
    },
  }),
  def({
    name: "update_task",
    description: "Change a task's title, notes, due date/km or repeat interval. Only pass the fields to change.",
    input: z.object({
      id: z.string(), title: z.string().min(1).max(120).nullish(), notes: z.string().max(1500).nullish(),
      dueDate: date.nullish(), dueKm: km.nullish(), everyMonths: z.number().int().min(1).max(240).nullish(), everyKm: km.nullish(),
    }),
    async run(ctx, i) {
      const t = await needTask(ctx, i.id);
      const n: Task = { ...t };
      for (const k of ["title", "notes", "dueDate", "dueKm", "everyMonths", "everyKm"] as const) if (i[k] !== undefined && i[k] !== null) (n as Record<string, unknown>)[k] = i[k];
      await put(ctx.userId, "tasks", n);
      return { ok: true };
    },
  }),
  def({
    name: "delete_task",
    description: "Remove a task the owner no longer wants to track.",
    input: z.object({ id: z.string() }),
    async run(ctx, i) {
      await needTask(ctx, i.id);
      await deleteRecord(ctx.userId, "tasks", i.id);
      return { ok: true };
    },
  }),
  def({
    name: "complete_task",
    description: "Mark a task done on a date. A repeating task moves to its next due date and km; a one-off task is removed. This does not add history: in a visit conversation the visit's done lines are the history; in a car conversation use log_work instead.",
    input: z.object({ id: z.string(), date, km: km.nullish() }),
    async run(ctx, i) {
      const t = await needTask(ctx, i.id);
      const n = nextAfterDone(t, i.date, i.km ?? null, (await getRecord(ctx.userId, "cars", t.carId)) ?? undefined);
      if (n) await put(ctx.userId, "tasks", n);
      else await deleteRecord(ctx.userId, "tasks", t.id);
      return n ? { next: { dueDate: n.dueDate, dueKm: n.dueKm } } : { removed: true };
    },
  }),
  def({
    name: "log_work",
    description: "Car conversation only: add work the owner did or had done (without paperwork here) to the car's history, optionally completing tasks it covers.",
    input: z.object({
      carId: z.string(), title: z.string().min(1).max(120), date, km: km.nullish(), cost: money.nullish(), shop: z.string().max(120).nullish(),
      note: z.string().max(1500).nullish(), completesTaskIds: z.array(z.string()).max(10).nullish(),
    }),
    async run(ctx, i) {
      const c = await needCar(ctx, i.carId);
      const v: Visit = { id: uid(), carId: c.id, title: i.title, date: i.date, km: i.km ?? null, shop: i.shop ?? null, total: i.cost ?? null, summary: null, status: "confirmed", created: now() };
      await put(ctx.userId, "visits", v);
      await put(ctx.userId, "items", {
        id: uid(), carId: c.id, visitId: v.id, source: "you", kind: "done", text: i.title, original: null, cost: i.cost ?? null, page: null,
        unsure: false, keywords: [], note: i.note ?? null, decision: null, created: now(),
      });
      for (const id of i.completesTaskIds ?? []) {
        const t = await needTask(ctx, id);
        const n = nextAfterDone(t, i.date, i.km ?? null, c);
        if (n) await put(ctx.userId, "tasks", n);
        else await deleteRecord(ctx.userId, "tasks", t.id);
      }
      await raiseOdometer(ctx, c, i.km, i.date);
      return { visitId: v.id };
    },
  }),
  def({
    name: "set_odometer",
    description: "Record the car's current odometer reading.",
    input: z.object({ carId: z.string(), km, date: date.nullish() }),
    async run(ctx, i) {
      const c = await needCar(ctx, i.carId);
      await put(ctx.userId, "cars", { ...c, km: i.km, kmDate: i.date ?? ctx.today });
      return { ok: true };
    },
  }),
  def({
    name: "search_history",
    description: "Search the owner's past visits, work, findings, quotes and observations by words (any language). Returns the closest matches, newest first.",
    input: z.object({ query: z.string().min(1).max(100), carId: z.string().nullish() }),
    async run(ctx, i) {
      const words = i.query.toLowerCase().split(/\s+/).filter((w) => w.length > 1).slice(0, 6);
      if (!words.length) return { matches: [] };
      const like = words.map((_, n) => `(i.text || ' ' || coalesce(i.original, '') || ' ' || coalesce(i.note, '') || ' ' || array_to_string(i.keywords, ' ') || ' ' || coalesce(v.title, '') || ' ' || coalesce(v.shop, '')) ilike $${n + 3}`);
      const rows = await sql(
        `select i.id, i.kind, i.text, i.original, i.cost, i.note, i.decision, i.source, i.car_id, v.id as visit_id, v.title as visit, v.date, v.km, v.shop, v.status
         from items i left join visits v on v.user_id = i.user_id and v.id = i.visit_id
         where i.user_id = $1 and ($2::text is null or i.car_id = $2) and (${like.join(" or ")})
         order by coalesce(v.date, i.created::date) desc limit 25`,
        [ctx.userId, i.carId ?? null, ...words.map((w) => `%${w}%`)],
      );
      return { matches: rows };
    },
  }),
  def({
    name: "confirm_visit",
    description: "Save the visit to history once the owner agrees the lines are right. Needs the car and date set. Raises the car's odometer to the visit's km if higher.",
    input: z.object({}),
    async run(ctx) {
      const v = await thisVisit(ctx);
      if (!v.carId || !v.date) throw new ToolError("Set the car and date first (update_visit).");
      await put(ctx.userId, "visits", { ...v, status: "confirmed" });
      const c = await getRecord(ctx.userId, "cars", v.carId);
      if (c) await raiseOdometer(ctx, c, v.km, v.date);
      return { ok: true };
    },
  }),
];

/** Tool definitions for the API. In a car conversation the visit-only tools are left out. */
export function toolDefs(thread: Thread): Anthropic.Beta.BetaTool[] {
  const visitOnly = new Set(["update_visit", "confirm_visit"]);
  const carOnly = new Set(["log_work"]);
  return TOOLS
    .filter((t) => ("visitId" in thread ? !carOnly.has(t.name) : !visitOnly.has(t.name)))
    .map((t) => ({ name: t.name, description: t.description, input_schema: z.toJSONSchema(t.input, { io: "input" }) as Anthropic.Beta.BetaTool.InputSchema }));
}

/** Short labels the chat shows while a tool runs. */
export const TOOL_LABELS: Record<string, string> = {
  update_visit: "Updated the visit", add_items: "Recorded lines", update_item: "Updated a line", delete_item: "Removed a line",
  create_task: "Added a task", update_task: "Updated a task", delete_task: "Removed a task", complete_task: "Marked a task done",
  log_work: "Added to history", set_odometer: "Updated the odometer", search_history: "Searched your history", confirm_visit: "Saved the visit",
};

/** Runs one tool call. Bad input or a refused change comes back as an error result the model can read. */
export async function runTool(ctx: ToolCtx, name: string, input: unknown): Promise<{ content: string; isError: boolean }> {
  const t = TOOLS.find((x) => x.name === name);
  if (!t) return { content: `Unknown tool ${name}.`, isError: true };
  const parsed = t.input.safeParse(input);
  if (!parsed.success) return { content: `Invalid input: ${z.prettifyError(parsed.error)}`, isError: true };
  try {
    const out = await (t.run as (c: ToolCtx, i: unknown) => Promise<unknown>)(ctx, parsed.data);
    if (name !== "search_history") ctx.changed = true;
    return { content: JSON.stringify(out), isError: false };
  } catch (e) {
    if (e instanceof ToolError) return { content: e.message, isError: true };
    if ((e as { code?: string }).code === "23503") return { content: "That refers to a car, visit or task that doesn't exist.", isError: true };
    throw e;
  }
}

export async function snapshotData(userId: string) {
  const [cars, tasks, visits, items] = await Promise.all([
    listRecords(userId, "cars"), listRecords(userId, "tasks"), listRecords(userId, "visits"), listRecords(userId, "items"),
  ]);
  return { cars, tasks, visits, items };
}
