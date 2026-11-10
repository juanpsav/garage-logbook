import { runTurn, toChat, type AgentEvent } from "@/server/agent/run";
import { getRecord, loadMessages, type Thread } from "@/server/garage";
import { LIMITS, take, userBuckets } from "@/server/limits";
import { getOwner, unauthorized, type Owner } from "@/server/session";

// A turn with several pages and tool steps can take a couple of minutes.
export const maxDuration = 300;

const ID = /^[\w-]{1,64}$/;

/** The conversation a request is about, if it belongs to the owner. */
async function threadFor(owner: Owner, visitId: unknown, carId: unknown): Promise<Thread | null> {
  if (typeof visitId === "string" && ID.test(visitId)) return (await getRecord(owner.id, "visits", visitId)) ? { visitId } : null;
  if (typeof carId === "string" && ID.test(carId)) return (await getRecord(owner.id, "cars", carId)) ? { carId } : null;
  return null;
}

/** The conversation so far, as the chat shows it. */
export async function GET(req: Request) {
  const owner = await getOwner();
  if (!owner) return unauthorized();
  const q = new URL(req.url).searchParams;
  const thread = await threadFor(owner, q.get("visitId"), q.get("carId"));
  if (!thread) return Response.json({ error: "not_found" }, { status: 404 });
  return Response.json(toChat(await loadMessages(owner.id, thread)));
}

/** Sends a message and streams the reply as one JSON event per line. */
export async function POST(req: Request) {
  const owner = await getOwner();
  if (!owner) return unauthorized();
  let body: { visitId?: unknown; carId?: unknown; text?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.slice(0, 4000) : "";
  const thread = await threadFor(owner, body.visitId, body.carId);
  if (!thread) return Response.json({ error: "not_found" }, { status: 404 });
  const over = await take(owner.admin ? userBuckets("agent", owner, LIMITS.agentAdmin, 0) : userBuckets("agent", owner, LIMITS.agentMember, LIMITS.agentMemberTotal));
  if (over) return Response.json({ error: over.endsWith(":members") ? "busy" : "rate_limited" }, { status: 429 });

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(ctl) {
      const emit = (e: AgentEvent) => { try { ctl.enqueue(enc.encode(JSON.stringify(e) + "\n")); } catch { /* reader went away */ } };
      try {
        await runTurn({ userId: owner.id, thread, text, emit, signal: req.signal });
      } finally {
        try { ctl.close(); } catch { /* already closed */ }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
