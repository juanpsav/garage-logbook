import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { get } from "@vercel/blob";
import type { FileRec } from "@/lib/types";
import { appendMessages, listRecords, loadMessages, type StoredMessage, type Thread } from "../garage";
import { garageContext, SYSTEM, todayLocal } from "./prompt";
import { runTool, TOOL_LABELS, toolDefs, type ToolCtx } from "./tools";

const MODEL = process.env.AGENT_MODEL || "claude-sonnet-5-5";
const MAX_STEPS = 12;

export type AgentEvent =
  | { t: "text"; d: string }
  | { t: "step" }
  | { t: "tool"; label: string }
  | { t: "changed" }
  | { t: "done" }
  | { t: "error"; msg: string };

type Block = Anthropic.Beta.BetaContentBlockParam;
type Msg = Anthropic.Beta.BetaMessageParam;

/** How a page is kept in the stored conversation: a pointer, turned back into the image or PDF on each request. */
type PageRef = { type: "page"; fileId: string; n: number };
const isPageRef = (b: unknown): b is PageRef => (b as PageRef)?.type === "page";

async function blobBase64(pathname: string) {
  const r = await get(pathname, { access: "private" });
  if (!r || r.statusCode !== 200) throw new Error(`file missing: ${pathname}`);
  return Buffer.from(await new Response(r.stream).arrayBuffer()).toString("base64");
}

/** Expands stored page pointers into image or document blocks. The same file always gives the same bytes, so history replays unchanged. */
async function expand(stored: StoredMessage[], files: Map<string, FileRec>): Promise<Msg[]> {
  const cache = new Map<string, Promise<string>>();
  const load = (p: string) => { let x = cache.get(p); if (!x) { x = blobBase64(p); cache.set(p, x); } return x; };
  return Promise.all(stored.map(async (m) => {
    if (!Array.isArray(m.content)) return { role: m.role, content: m.content as Msg["content"] };
    const out: Block[] = [];
    for (const b of m.content as unknown[]) {
      if (!isPageRef(b)) { out.push(b as Block); continue; }
      const f = files.get(b.fileId);
      if (!f) { out.push({ type: "text", text: `[Page ${b.n} was deleted.]` }); continue; }
      out.push({ type: "text", text: `Page ${b.n}:` });
      if (f.type === "application/pdf") {
        out.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: await load(f.orig) } });
      } else {
        out.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: await load(f.view ?? f.orig) } });
      }
    }
    return { role: m.role, content: out };
  }));
}

/**
 * One turn: the owner's message in, the assistant's reply (with any tool calls) out.
 * The turn is saved to the conversation only as complete messages, so it can always be replayed.
 */
export async function runTurn(o: { userId: string; thread: Thread; text: string; emit: (e: AgentEvent) => void; signal?: AbortSignal }) {
  const today = todayLocal();
  const ctx: ToolCtx = { userId: o.userId, thread: o.thread, today, changed: false };
  const stored = await loadMessages(o.userId, o.thread);

  // Pages of the visit that haven't been shown to the assistant yet go with this message.
  const files = new Map<string, FileRec>();
  let newPages: PageRef[] = [];
  if ("visitId" in o.thread) {
    const vf = (await listRecords(o.userId, "files", "visit_id = $2", [o.thread.visitId])).sort((a, b) => a.position - b.position);
    vf.forEach((f) => files.set(f.id, f));
    const sent = new Set(stored.flatMap((m) => (Array.isArray(m.content) ? (m.content as unknown[]).filter(isPageRef).map((b) => b.fileId) : [])));
    newPages = vf.map((f, i) => ({ type: "page" as const, fileId: f.id, n: i + 1 })).filter((p) => !sent.has(p.fileId));
  }
  const words = o.text.trim() || (newPages.length ? (newPages.length === 1 ? "I added a page." : `I added ${newPages.length} pages.`) : "");
  if (!words) return;
  const userMsg = { role: "user" as const, content: [{ type: "text", text: await garageContext(o.userId, o.thread, today) }, ...newPages, { type: "text", text: words }] };

  const history = await expand([...stored, { id: 0, created: "", ...userMsg }], files);
  const turn: { role: "user" | "assistant"; content: unknown }[] = [];
  const client = new Anthropic({ timeout: 280_000, maxRetries: 1 });
  const tools = toolDefs(o.thread);

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      if (step > 0) o.emit({ t: "step" });
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        cache_control: { type: "ephemeral" },
        system: SYSTEM,
        tools,
        messages: [...history, ...(turn as Msg[])],
      }, { signal: o.signal });
      stream.on("text", (d) => o.emit({ t: "text", d }));
      const msg = await stream.finalMessage();

      if (msg.stop_reason === "refusal") {
        o.emit({ t: "text", d: "\n\nI can't help with that one." });
        break;
      }
      const calls = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (msg.stop_reason === "pause_turn") { turn.push({ role: "assistant", content: msg.content }); continue; }
      if (msg.stop_reason !== "tool_use" || !calls.length) { turn.push({ role: "assistant", content: msg.content }); break; }

      // Results go back together in one message, after the assistant message that asked for them.
      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const c of calls) {
        o.emit({ t: "tool", label: TOOL_LABELS[c.name] ?? c.name });
        const r = await runTool(ctx, c.name, c.input);
        results.push({ type: "tool_result", tool_use_id: c.id, content: r.content, ...(r.isError && { is_error: true }) });
      }
      turn.push({ role: "assistant", content: msg.content }, { role: "user", content: results });
      if (ctx.changed) { o.emit({ t: "changed" }); ctx.changed = false; }
    }
  } catch (e) {
    if (!o.signal?.aborted) {
      console.error("agent turn failed:", e);
      o.emit({ t: "error", msg: e instanceof Anthropic.RateLimitError ? "The assistant is busy. Try again in a minute." : "The assistant couldn't finish. Try again." });
    }
  } finally {
    await appendMessages(o.userId, o.thread, [userMsg, ...turn]);
    o.emit({ t: "done" });
  }
}

/** What the chat shows: the owner's words, the assistant's text, and what it did. */
export type ChatEntry = { role: "user" | "assistant"; text: string; pages?: number; actions?: string[] };

export function toChat(stored: StoredMessage[]): ChatEntry[] {
  const out: ChatEntry[] = [];
  for (const m of stored) {
    const blocks = Array.isArray(m.content) ? (m.content as { type: string; text?: string; name?: string }[]) : [{ type: "text", text: String(m.content) }];
    if (m.role === "user") {
      if (blocks.every((b) => b.type === "tool_result")) continue;
      const text = blocks.filter((b) => b.type === "text" && !b.text?.startsWith("<garage>")).map((b) => b.text).join("\n");
      const pages = blocks.filter((b) => b.type === "page").length;
      out.push({ role: "user", text, ...(pages && { pages }) });
    } else {
      const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("");
      const actions = blocks.filter((b) => b.type === "tool_use").map((b) => TOOL_LABELS[b.name ?? ""] ?? b.name ?? "");
      const last = out.at(-1);
      // Steps of one reply (text, tool calls, more text) show as one message.
      if (last?.role === "assistant") {
        if (text) last.text = last.text ? `${last.text}\n\n${text}` : text;
        if (actions.length) last.actions = [...(last.actions ?? []), ...actions];
      } else {
        out.push({ role: "assistant", text, ...(actions.length && { actions }) });
      }
    }
  }
  return out;
}
