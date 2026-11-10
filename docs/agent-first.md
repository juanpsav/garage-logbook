# Agent-first redesign

Status: proposal, November 2026.

## Why

Shop paperwork is hard to read, for people and models alike. One visit can produce an invoice for the work done, inspection notes handwritten under the invoice lines, and a quote on page 2, all on the same document, in shop jargon, partly illegible. The current flow assumes each document has one type and that a model can read it on its own. Neither holds.

The person who was at the counter knows things the paper doesn't: what the technician said, what they agreed to, what they declined. So reading a document should be a conversation, and the app should also help judge what the shop recommends: what's needed now, what can wait, what looks like an upsell, and how to check it yourself.

## The idea

**A shop visit, gone through with an agent.**

1. You upload the pages of a visit (any mix of invoice, inspection, quote).
2. The agent reads them and posts a first pass: each line sorted as **done**, **found** (inspection finding) or **quoted**, with a plain-English explanation and a flag on anything it couldn't read. It asks only about what it's unsure of.
3. You answer in your own words (typing or the phone keyboard's microphone): "front brakes are fine, they want the rears done before winter, the sway bar thing can wait".
4. The agent updates the visit through tools while a live card beside the chat shows the result. You confirm it.
5. The conversation is kept with the visit: your account of what the shop said, next to their paperwork.

The Maintenance, Suggested and Cars views stay; they become views of better data rather than the main way in.

## Advisor

For each quoted or found item the advisor gives:

- **Verdict:** needed now / can wait until (km or date) / likely an upsell / ask the shop first, with the evidence it used: measurements on the document, the car's km and history, the manufacturer schedule, known issues and typical prices.
- **Check it yourself:** what to look at, which tool, which threshold, and safety notes. When a DIY check isn't realistic (e.g. ball joints need a lift), it says so and suggests a second opinion.
- **What to ask the shop:** e.g. "show me the measurement", "can I see the old part".

Your own checks (a photo, "front pads 6 mm") are saved as evidence on the visit and used in later verdicts. The advisor cites sources where it can and says plainly it isn't a mechanic; brakes, steering and tires get a lower bar for "get a second opinion".

## Architecture

```
                 ┌──────────── Backend (ours) ───────────────────────────┐
 Web app chat ──▶│ Agent loop (Claude API) ─▶ Tools ─▶ Postgres + Blob   │
 Claude app  ───▶│ MCP server (same tools, OAuth via our sign-in)        │
                 │ Export: zip download, Google Drive sync               │
                 └───────────────────────────────────────────────────────┘
```

- **Tools are the core.** All logic lives in a tools layer (`add_item`, `update_item`, `create_task`, `set_odometer`, `search_records`, `get_schedule`, …) that reads and writes our own tables. The web chat and the MCP server are two clients of the same tools.
- **Models are replaceable.** Claude Sonnet 5.5 runs the conversation and reads documents. Claude Opus 5.5 with web search handles an explicit "second opinion" on a quote (recalls, bulletins, typical prices). Swapping models touches one module.
- **Cohere** is removed from document reading. Search doesn't need it (see below). It can come back for a specific job later if it earns one.
- **Data stays ours.** Neon Postgres and private Vercel Blob; export and Drive sync mean nothing depends on the app staying up.
- **Costs** stay capped with the existing daily per-user and shared buckets (`src/server/limits.ts`), counted per agent turn. Guests can't run the agent; they get a read-only sample visit to look at.

## Data model

Structured only where the app computes something; everything else is text.

| Table | Holds |
|---|---|
| `cars` | name, km, km date, schedule id |
| `visits` | car, date, km, shop, total, summary, status (draft / in conversation / confirmed) |
| `files` | visit, page order, original file in Blob, derived copies (read size, thumbnail) |
| `items` | visit, kind (`done` / `found` / `quoted`), original text, plain text, cost, page, confidence, keywords (`text[]`), your note, decision for quotes (pending / accepted / declined / deferred), advisor verdict (`jsonb`) |
| `messages` | visit (or null for general chat), role, content, created |
| `tasks` | as today: car, title, due date/km, repeat rule, source item |

- History is the `done` items of confirmed visits. Manual history entries become a visit with one item.
- There is **no component taxonomy**. The agent writes the plain-English line and a few free keywords (synonyms, English and French) per item; that's what search runs on.
- Guest mode stays in browser storage with the same shapes.

## Search

No LLM or embedding service is needed at this size (a few cars, hundreds of items over years).

- Postgres full-text search over plain text, original text, keywords and notes (`simple` config with `unaccent`, so English and French both work), plus `pg_trgm` for typos and shop abbreviations.
- The agent turns vague questions into a few targeted searches and reads the results; for one car it can often read the whole history in context.
- Embeddings (pgvector) can be added later if the data or the questions outgrow this, without changing the rest.

This also covers issue #1 (Suggested tab using history).

## Your documents stay yours

- **Keep originals.** Today photos are stored shrunk to 2000 px JPEG; only PDFs are kept as uploaded. Store the original file untouched and make derived copies for reading and thumbnails. (Already-uploaded photos can't be restored to full size.)
- **Export everything:** one zip, `Car/Year/Date Shop – summary/` with the original pages and a readable `visit.pdf` (items, your notes, advisor verdicts), plus `history.csv` and `garage.json`.
- **Google Drive sync:** "Connect Google Drive" asks for the `drive.file` scope only (the app sees only files it creates). The app keeps a "Garage Logbook" folder with the same layout and copies each confirmed visit there.

## Steps

Each step ships on its own; the app keeps working in between.

1. Keep original uploads.
2. New tables and a migration of existing records.
3. Tools layer and agent chat for visit intake (replaces the review form). First test case: a combined invoice + inspection + quote.
4. Advisor: verdicts, check-it-yourself, second opinion with web search.
5. Export: zip download and Google Drive sync.
6. Search over history, and the "ask about my car" chat.
7. MCP server so the Claude app can use the same tools.
