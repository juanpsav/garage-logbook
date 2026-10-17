"use client";

import type { ReadContext } from "./extraction";
import { turnstileToken } from "./turnstile";

export class ReadError extends Error {}

const MESSAGES: Record<string, string> = {
  rate_limited: "You've used today's document reads. Fill in the details yourself, or try again tomorrow.",
  busy: "Document reading is at its daily limit for everyone. Fill in the details yourself, or try again tomorrow.",
  bot_check: "Couldn't confirm you're not a bot. Reload the page and try Read again.",
  too_large: "These pages are too large to read. Try fewer or smaller photos.",
  upstream: "The reader couldn't finish. Try Read again, or fill in the details yourself.",
};

/** Sends prepared JPEG pages to the server, which asks Cohere to read them. Returns the raw extraction. */
export async function readDocument(pages: Blob[], ctx: ReadContext, signal: AbortSignal): Promise<unknown> {
  let token: string | null = null;
  try {
    token = await turnstileToken();
  } catch {
    throw new ReadError(MESSAGES.bot_check);
  }
  const body = new FormData();
  body.set("context", JSON.stringify(ctx));
  if (token) body.set("turnstile", token);
  pages.forEach((p, i) => body.append("page", p, `page-${i + 1}.jpg`));
  const res = await fetch("/api/documents/read", { method: "POST", body, signal });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new ReadError(MESSAGES[json?.error] ?? MESSAGES.upstream);
  return json.extraction;
}
