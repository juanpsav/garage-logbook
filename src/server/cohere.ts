import "server-only";

const MODEL = process.env.COHERE_MODEL || "command-a-plus-05-2026";

export class UpstreamError extends Error {}

/** Asks Command A+ to read JPEG pages with a fixed prompt and returns the parsed JSON reply. */
export async function readWithCohere(prompt: string, pages: Buffer[], signal?: AbortSignal): Promise<unknown> {
  const key = process.env.COHERE_API_KEY;
  if (!key) throw new UpstreamError("COHERE_API_KEY is not set");
  const res = await fetch("https://api.cohere.com/v2/chat", {
    method: "POST",
    signal,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 6000,
      response_format: { type: "json_object" },
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          ...pages.map((p) => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${p.toString("base64")}` } })),
        ],
      }],
    }),
  });
  if (!res.ok) throw new UpstreamError(`Cohere ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  // The reply holds a "thinking" block before the answer; take the text block.
  const text = (json?.message?.content ?? []).find((c: { type?: string }) => c.type === "text")?.text;
  if (typeof text !== "string") throw new UpstreamError("Cohere reply had no text");
  try {
    return JSON.parse(text);
  } catch {
    throw new UpstreamError("Cohere reply was not JSON");
  }
}
