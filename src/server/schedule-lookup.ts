import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

const MODEL = process.env.SCHEDULE_MODEL || "claude-opus-5-5";

const Item = z.object({
  title: z.string().describe("Short task name, e.g. 'Engine air filter'"),
  months: z.number().int().nullable().describe("Repeat interval in months, or null if the manual gives only a distance"),
  km: z.number().int().nullable().describe("Repeat interval in kilometres, or null if the manual gives only a time"),
  firstMonths: z.number().int().nullable().describe("Only when the first service differs from the repeat interval"),
  firstKm: z.number().int().nullable().describe("Only when the first service differs from the repeat interval"),
  why: z.string().describe("One or two plain sentences: what it covers and any severe-driving interval"),
});

const Result = z.object({
  found: z.boolean().describe("false if no official schedule for this exact vehicle could be found"),
  name: z.string().describe("Vehicle as the schedule names it, e.g. '2019 Subaru Forester 2.5i'"),
  modelYear: z.number().int().nullable(),
  source: z.string().describe("Document title and pages, e.g. 'Subaru 2019 Warranty and Maintenance Booklet (p. 28-29)'"),
  sourceUrl: z.string().nullable().describe("Direct link to the manufacturer document"),
  note: z.string().describe("One or two sentences on which intervals are shown (normal vs severe) and anything the owner should know"),
  items: z.array(Item),
});

export type LookupResult = z.infer<typeof Result>;
export class LookupError extends Error {}

const SYSTEM = `You find the official manufacturer maintenance schedule for one vehicle, for an owner in Quebec, Canada.

Search for the manufacturer's own document (owner's manual maintenance chapter, warranty and maintenance booklet, or the manufacturer's service-schedule page) for this exact model year, model and engine. Fetch it and read the schedule itself; don't rely on dealer blogs or forum posts when the official document is available.

Report every scheduled replacement or inspection as one item with its interval. Use kilometres; convert miles to km and round to the nearest 100. Use the normal-driving intervals as the main values and put the severe-driving interval in "why" (Quebec winters usually count as severe, so mention it when the manual says so). Use firstMonths/firstKm only when the first service is at a different interval than the repeats (long-life coolant is typical). Leave out one-time checks, recalls and generic advice like "check tire pressure monthly".

If you can't find an official schedule for this exact vehicle, set found to false and leave items empty rather than guessing.`;

/** Researches a vehicle's schedule with web search and fetch. Takes 30-120 seconds. */
export async function lookupSchedule(vehicle: string): Promise<LookupResult> {
  const client = new Anthropic({ timeout: 280_000, maxRetries: 1 });
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: `Vehicle: ${vehicle}` }];
  // Server tools can pause a long turn; resume by sending the paused turn back.
  for (let i = 0; i < 4; i++) {
    const res = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(Result) },
      system: SYSTEM,
      tools: [
        { type: "web_search_20260209", name: "web_search", max_uses: 6 },
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: 6 },
      ],
      messages,
    });
    if (res.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: res.content });
      continue;
    }
    if (res.stop_reason === "refusal") throw new LookupError("declined");
    if (!res.parsed_output) throw new LookupError(`no result (${res.stop_reason})`);
    return res.parsed_output;
  }
  throw new LookupError("took too many steps");
}
