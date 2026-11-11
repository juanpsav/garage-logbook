import "server-only";
import { del } from "@vercel/blob";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { now, today, uid } from "@/lib/dates";
import { every, intervalLabel, matchSchedule, scheduleFor, taskFromSuggestion } from "@/lib/logic";
import { GENERAL, SUGGESTIONS } from "@/lib/suggestions";
import type { Car, Schedule } from "@/lib/types";
import { isAdmin } from "../auth";
import { sql } from "../db";
import { deleteRecord, getRecord, listRecords, putRecord } from "../garage";
import { LIMITS, take, userBuckets } from "../limits";
import { LookupError, lookupSchedule } from "../schedule-lookup";
import { listSchedules, saveLookup } from "../schedules";

const text = (v: unknown, isError = false) => ({ content: [{ type: "text" as const, text: typeof v === "string" ? v : JSON.stringify(v) }], ...(isError && { isError: true }) });
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD");

/** The checks that make sense for a car: its manufacturer schedule (when found) plus seasonal and quick checks. */
function suggestionsFor(car: Car, schedules: Schedule[]) {
  const sc = scheduleFor(car, schedules);
  const general = SUGGESTIONS.filter((s) => (sc ? GENERAL.includes(s.key) || (sc.alsoGeneric ?? []).includes(s.key) : true));
  return { sc, list: [...(sc?.items ?? []), ...general.filter((g) => !sc?.items.some((i) => i.key === g.key))] };
}

/** Car tools: what the web app's forms used to do, now done by the owner's agent. */
export function registerCarTools(server: McpServer, userId: string) {
  server.registerTool("add_car", {
    description: "Add a car to the garage. Name it with model year, make and model (e.g. '2019 Subaru Forester'), and the current odometer. If an official maintenance schedule is already known for it, it's attached; otherwise call find_schedule.",
    inputSchema: z.object({ name: z.string().min(3).max(120), km: z.number().int().min(0).max(3_000_000), kmDate: date.nullish() }),
  }, async ({ name, km, kmDate }) => {
    const sc = matchSchedule(name, await listSchedules());
    const c: Car = { id: uid(), name, km, kmDate: kmDate ?? today(), scheduleId: sc?.id ?? null, created: now() };
    await putRecord(userId, "cars", c);
    return text({ carId: c.id, schedule: sc?.name ?? null, next: sc ? "list_suggestions to pick what to track" : "find_schedule, then list_suggestions" });
  });

  server.registerTool("update_car", {
    description: "Rename a car (fix the year, make or model). The maintenance schedule is matched again from the new name.",
    inputSchema: z.object({ carId: z.string(), name: z.string().min(3).max(120) }),
  }, async ({ carId, name }) => {
    const c = await getRecord(userId, "cars", carId);
    if (!c) return text(`No car with id ${carId}.`, true);
    const sc = name === c.name ? null : matchSchedule(name, await listSchedules());
    await putRecord(userId, "cars", { ...c, name, scheduleId: name === c.name ? c.scheduleId : sc?.id ?? null });
    return text({ ok: true, schedule: sc?.name ?? null });
  });

  server.registerTool("delete_car", {
    description: "Delete a car and its tasks. Its visits, documents and history stay, without a car. Only when the owner clearly asks; confirm with them first.",
    inputSchema: z.object({ carId: z.string() }),
    annotations: { destructiveHint: true },
  }, async ({ carId }) => {
    if (!(await getRecord(userId, "cars", carId))) return text(`No car with id ${carId}.`, true);
    await deleteRecord(userId, "cars", carId);
    return text({ ok: true });
  });

  server.registerTool("find_schedule", {
    description: "Research the car's official manufacturer maintenance schedule on the web and attach it. Takes up to two minutes; limited to a few per day. Not needed when add_car already found one.",
    inputSchema: z.object({ carId: z.string(), fresh: z.boolean().nullish().describe("Look again even if a saved schedule matches") }),
  }, async ({ carId, fresh }) => {
    const c = await getRecord(userId, "cars", carId);
    if (!c) return text(`No car with id ${carId}.`, true);
    if (!fresh) {
      const saved = matchSchedule(c.name, await listSchedules());
      if (saved) {
        await putRecord(userId, "cars", { ...c, scheduleId: saved.id });
        return text({ schedule: saved.name, source: saved.source, items: saved.items.length });
      }
    }
    const [u] = await sql<{ email: string }>(`select email from "user" where id = $1`, [userId]);
    const admin = isAdmin(u?.email);
    const over = await take(userBuckets("schedule", { id: userId, admin }, admin ? LIMITS.adminSchedules : LIMITS.memberSchedules, LIMITS.memberSchedulesTotal));
    if (over) return text("Today's schedule lookups are used up. Try again tomorrow.", true);
    try {
      const r = await lookupSchedule(c.name);
      if (!r.found || !r.items.length) return text("Couldn't find an official schedule for this car. Check the model year and model in its name (update_car).", true);
      const sc = await saveLookup(r, userId, admin);
      await putRecord(userId, "cars", { ...c, scheduleId: sc.id });
      return text({ schedule: sc.name, source: sc.source, sourceUrl: sc.sourceUrl, note: sc.note, items: sc.items.length });
    } catch (e) {
      console.error("schedule lookup failed:", e instanceof LookupError ? e.message : e);
      return text("The lookup didn't finish. Try again in a minute.", true);
    }
  });

  server.registerTool("list_suggestions", {
    description: "The checks worth tracking for a car: its manufacturer schedule items (with intervals and why) and seasonal or quick checks, marking which are already tracked.",
    inputSchema: z.object({ carId: z.string() }),
    annotations: { readOnlyHint: true },
  }, async ({ carId }) => {
    const c = await getRecord(userId, "cars", carId);
    if (!c) return text(`No car with id ${carId}.`, true);
    const { sc, list } = suggestionsFor(c, await listSchedules());
    const tracked = new Set((await listRecords(userId, "tasks", "car_id = $2", [carId])).map((t) => t.sugKey).filter(Boolean));
    return text({
      schedule: sc ? { name: sc.name, source: sc.source, sourceUrl: sc.sourceUrl, note: sc.note, modelYear: sc.modelYear } : null,
      suggestions: list.map((s) => ({ key: s.key, title: s.title, interval: intervalLabel(s), why: s.why, tracked: tracked.has(s.key), needsLastDone: !s.anchor })),
    });
  });

  server.registerTool("track_suggestions", {
    description: "Start tracking suggested checks as tasks. For each, give when it was last done (date and/or km) so the next one is due at the right time; if the owner doesn't know, leave both out and it's due now. 'never' means never done since new (counts from 0 km and the model year).",
    inputSchema: z.object({
      carId: z.string(),
      items: z.array(z.object({ key: z.string(), lastDate: date.nullish(), lastKm: z.number().int().min(0).nullish(), never: z.boolean().nullish() })).min(1).max(40),
    }),
  }, async ({ carId, items }) => {
    const c = await getRecord(userId, "cars", carId);
    if (!c) return text(`No car with id ${carId}.`, true);
    const schedules = await listSchedules();
    const { sc, list } = suggestionsFor(c, schedules);
    const tracked = new Set((await listRecords(userId, "tasks", "car_id = $2", [carId])).map((t) => t.sugKey));
    const added: { title: string; due: string }[] = [], skipped: string[] = [];
    for (const i of items) {
      const s = list.find((x) => x.key === i.key);
      if (!s || tracked.has(s.key)) { skipped.push(i.key); continue; }
      const t = taskFromSuggestion(s, c, sc, { date: i.lastDate ?? null, km: i.lastKm ?? null, never: !!i.never });
      await putRecord(userId, "tasks", t);
      added.push({ title: t.title, due: [t.dueDate, t.dueKm != null && `${t.dueKm} km`].filter(Boolean).join(" or ") + (t.everyMonths || t.everyKm || t.anchor ? `, then ${every(t).toLowerCase()}` : "") });
    }
    return text({ added, ...(skipped.length && { skipped }) });
  });

  server.registerTool("delete_visit", {
    description: "Delete a visit with its pages (the stored originals) and lines. Tasks it created stay. Only when the owner clearly asks; confirm with them first.",
    inputSchema: z.object({ visitId: z.string() }),
    annotations: { destructiveHint: true },
  }, async ({ visitId }) => {
    if (!(await getRecord(userId, "visits", visitId))) return text(`No visit with id ${visitId}.`, true);
    const files = await listRecords(userId, "files", "visit_id = $2", [visitId]);
    const paths = [...new Set(files.flatMap((f) => [f.orig, f.view]).filter((p): p is string => !!p && p.startsWith(`u/${userId}/`)))];
    if (paths.length) await del(paths);
    await deleteRecord(userId, "visits", visitId);
    return text({ ok: true, pagesDeleted: files.length });
  });
}
