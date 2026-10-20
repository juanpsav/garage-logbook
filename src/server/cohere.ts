import "server-only";

const MODEL = process.env.COHERE_MODEL || "command-a-plus-05-2026";

export class UpstreamError extends Error {}

const str = { type: ["string", "null"] };
const numb = { type: ["number", "null"] };
const date = { type: ["string", "null"], format: "date" };

/** Holds the reply to the shape cleanExtraction expects. */
const SCHEMA = {
  type: "object",
  required: ["type", "carId", "title", "date", "shop", "km", "total", "summary", "workDone", "recommended", "completes"],
  properties: {
    type: { type: "string", enum: ["receipt", "quote", "inspection", "other"] },
    carId: str, title: str, date, shop: str, km: numb, total: numb, summary: str,
    workDone: {
      type: "array",
      items: { type: "object", required: ["title", "lineCosts"], properties: { title: { type: "string" }, lineCosts: { type: "array", items: { type: "number" } } } },
    },
    recommended: {
      type: "array",
      items: {
        type: "object",
        required: ["title", "urgency", "dueKm", "dueDate", "estCost", "notes"],
        properties: {
          title: { type: "string" }, urgency: { type: "string", enum: ["now", "soon", "later"] },
          dueKm: numb, dueDate: date, estCost: numb, notes: { type: "string" },
        },
      },
    },
    completes: { type: "array", items: { type: "string" } },
  },
};

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
      max_tokens: 8000,
      // Reasoning sometimes runs on and uses up every token before the answer; cap it.
      thinking: { type: "enabled", token_budget: 3000 },
      temperature: 0.1,
      response_format: { type: "json_object", json_schema: SCHEMA },
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          ...pages.map((p) => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${p.toString("base64")}`, detail: "high" } })),
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
