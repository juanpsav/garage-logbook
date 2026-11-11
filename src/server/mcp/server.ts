import "server-only";
import { get } from "@vercel/blob";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { now, uid } from "@/lib/dates";
import type { Visit } from "@/lib/types";
import { garageSnapshot, todayLocal } from "../agent/prompt";
import { runTool, TOOLS, type ToolCtx } from "../agent/tools";
import { whatsDue } from "../due";
import { getRecord, listRecords, putRecord } from "../garage";
import { makeUploadToken, uploadUrl } from "../upload-token";
import { registerCarTools } from "./cars";
import { MCP_INSTRUCTIONS } from "./guidance";

type Content = { type: "text"; text: string } | { type: "image"; data: string; mimeType: string };
const text = (v: unknown, isError = false) => ({ content: [{ type: "text" as const, text: typeof v === "string" ? v : JSON.stringify(v) }], ...(isError && { isError: true }) });

// The shared tools were written for a conversation about one visit or car; over MCP the visit is a parameter.
const NEEDS_VISIT = new Set(["update_visit", "confirm_visit"]);
const TAKES_VISIT = new Set(["add_items", "update_item", "create_task"]);
const DESCRIPTIONS: Record<string, string> = {
  update_visit: "Set details of a shop visit: car, date, odometer km, shop, total paid, short title, summary. Only pass the fields to change.",
  add_items: "Record lines of work. With visitId they belong to that shop visit (what the paperwork says was done, found or quoted). Without visitId they are the owner's own notes about a car (pass carId), e.g. a noise they noticed.",
  update_item: "Change a recorded line: fix its reading, add the owner's account (note), record their decision on quoted work, or attach one of their earlier notes to a visit (attachToThisVisit with visitId).",
  create_task: "Add a maintenance task to track. Give a due date and/or km when there is one; everyMonths/everyKm only for work that repeats. Pass visitId when the task comes from a visit's paperwork.",
  complete_task: "Mark a task done on a date. A repeating task moves to its next due date and km; a one-off is removed. This doesn't add history: a visit's done lines are its history, and log_work records work without paperwork.",
  log_work: "Add work the owner did or had done (without paperwork here) to a car's history, optionally completing tasks it covers.",
  confirm_visit: "Save a visit to history once the owner agrees its lines are right. Needs the car and date set. Raises the car's odometer to the visit's km if higher.",
};

const MAX_PAGES_PER_CALL = 4;

async function blobBase64(pathname: string) {
  const r = await get(pathname, { access: "private" });
  if (!r || r.statusCode !== 200) return null;
  return Buffer.from(await new Response(r.stream).arrayBuffer()).toString("base64");
}

/** The MCP server for one signed-in owner: their garage's tools, built per request. */
export function buildServer(userId: string) {
  const server = new McpServer({ name: "garage-logbook", version: "1.0.0" }, { instructions: MCP_INSTRUCTIONS });
  const ctxFor = (input: { visitId?: string | null; carId?: string | null }): ToolCtx => ({
    userId, today: todayLocal(), changed: false,
    thread: input.visitId ? { visitId: input.visitId } : { carId: input.carId ?? "" },
  });

  server.registerTool("get_garage", {
    description: "The owner's cars, tasks with due status, recent history and open items (quotes waiting on a decision, their own notes). Call this first.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true },
  }, async () => text(await garageSnapshot(userId, null, todayLocal())));

  server.registerTool("whats_due", {
    description: "What needs the owner's attention today: late or upcoming tasks, quotes waiting on a decision, their open notes, a stale odometer, unfinished visits, and Quebec winter-tire dates. 'quiet' is true when there's nothing to say.",
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true },
  }, async () => text(await whatsDue(userId, todayLocal())));

  server.registerTool("start_visit", {
    description: "Start a shop visit for paperwork the owner has (invoice, inspection, quote). Returns the visit id and an upload link for the owner to add every page from their phone; originals are kept in their garage.",
    inputSchema: z.object({ carId: z.string().nullish(), title: z.string().max(120).nullish().describe("Optional working title, e.g. 'Tire change at Canadian Tire'") }),
  }, async ({ carId, title }) => {
    if (carId && !(await getRecord(userId, "cars", carId))) return text(`No car with id ${carId}.`, true);
    const v: Visit = { id: uid(), carId: carId ?? null, title: title ?? "", date: null, km: null, shop: null, total: null, summary: null, status: "open", created: now() };
    await putRecord(userId, "visits", v);
    return text({ visitId: v.id, uploadUrl: uploadUrl(makeUploadToken(userId, v.id)), expiresInMinutes: 60 });
  });

  server.registerTool("upload_link", {
    description: "A fresh upload link for adding pages to an existing visit (links expire after an hour).",
    inputSchema: z.object({ visitId: z.string() }),
  }, async ({ visitId }) => {
    if (!(await getRecord(userId, "visits", visitId))) return text(`No visit with id ${visitId}.`, true);
    return text({ uploadUrl: uploadUrl(makeUploadToken(userId, visitId)), expiresInMinutes: 60 });
  });

  server.registerTool("get_visit", {
    description: "A visit's details, its recorded lines (done, found, quoted) and how many pages it has.",
    inputSchema: z.object({ visitId: z.string() }),
    annotations: { readOnlyHint: true },
  }, async ({ visitId }) => {
    const v = await getRecord(userId, "visits", visitId);
    if (!v) return text(`No visit with id ${visitId}.`, true);
    const [items, files] = await Promise.all([
      listRecords(userId, "items", "visit_id = $2", [visitId]),
      listRecords(userId, "files", "visit_id = $2", [visitId]),
    ]);
    return text({ ...v, pages: files.length, items: items.map(({ id, kind, text, original, cost, page, unsure, note, decision, source }) => ({ id, kind, text, original, cost, page, unsure, note, decision, source })) });
  });

  server.registerTool("get_pages", {
    description: `The pages of a visit as images, to read them. Up to ${MAX_PAGES_PER_CALL} pages per call; pass page numbers (1-based) for the rest.`,
    inputSchema: z.object({ visitId: z.string(), pages: z.array(z.number().int().min(1)).max(MAX_PAGES_PER_CALL).nullish() }),
    annotations: { readOnlyHint: true },
  }, async ({ visitId, pages }) => {
    if (!(await getRecord(userId, "visits", visitId))) return text(`No visit with id ${visitId}.`, true);
    const files = (await listRecords(userId, "files", "visit_id = $2", [visitId])).sort((a, b) => a.position - b.position);
    if (!files.length) return text("No pages yet. Give the owner the upload link (upload_link) and ask them to add the pages.");
    const want = (pages?.length ? pages : files.map((_, i) => i + 1)).filter((n) => n <= files.length).slice(0, MAX_PAGES_PER_CALL);
    const content: Content[] = [];
    for (const n of want) {
      const f = files[n - 1];
      const data = f.view ? await blobBase64(f.view) : null;
      content.push({ type: "text", text: `Page ${n} of ${files.length}${f.name ? ` (${f.name})` : ""}:` });
      content.push(data ? { type: "image", data, mimeType: "image/jpeg" } : { type: "text", text: "[This page has no image to show; it's an older PDF. Ask the owner to upload it again as photos or a PDF through upload_link.]" });
    }
    const rest = files.length - Math.max(...want);
    if (rest > 0 && !pages?.length) content.push({ type: "text", text: `${rest} more page(s): call again with pages ${want.at(-1)! + 1}…${files.length}.` });
    return { content };
  });

  registerCarTools(server, userId);

  for (const t of TOOLS) {
    const input = NEEDS_VISIT.has(t.name)
      ? (t.input as z.ZodObject).extend({ visitId: z.string() })
      : TAKES_VISIT.has(t.name)
        ? (t.input as z.ZodObject).extend({ visitId: z.string().nullish() })
        : t.input;
    server.registerTool(t.name, {
      description: DESCRIPTIONS[t.name] ?? t.description,
      inputSchema: input as z.ZodObject,
      annotations: { readOnlyHint: t.name === "search_history", destructiveHint: t.name.startsWith("delete_") },
    }, async (args: Record<string, unknown>) => {
      const { visitId, ...rest } = args as { visitId?: string | null; carId?: string | null };
      if (visitId && !(await getRecord(userId, "visits", visitId))) return text(`No visit with id ${visitId}.`, true);
      const r = await runTool(ctxFor({ visitId, carId: (rest as { carId?: string | null }).carId }), t.name, rest);
      return text(r.content, r.isError);
    });
  }
  return server;
}
