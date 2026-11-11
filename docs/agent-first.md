# Agent-first redesign

Status: revised November 10, 2026. Supersedes the first version of this doc (in git history), whose visit chat and car chat shipped in 149e8b8.

## Why

Shop paperwork is hard to read, for people and models alike: one visit mixes an invoice, inspection notes handwritten under its lines, and a quote on another page, in shop jargon, partly illegible. The owner knows things the paper doesn't (what the tech said, what they agreed to), and wants help judging what really needs doing.

The first build put a chat inside the app. It works, but it is a regular app with a chat added: the owner still picks tabs, fills forms, and comes back to check. Chat, voice, photos, memory, web search, scheduled check-ins and drafting emails are what general agents (a Claude session; possibly others) already do, and do better every month. Rebuilding them here is the wrong job.

## The idea

**The owner's own agent is the front end and does the reasoning. This app is the storage and the harness.**

```
 Your agent (claude.ai / Claude apps / Claude Code; any MCP client)
   chat, voice, photos, memory, web search, scheduled check-ins, email drafts
        │  MCP over HTTPS, OAuth sign-in to your garage
        ▼
 Garage backend (ours)
   tools     get_garage, whats_due, add_visit, add_items, update_item, create/update/complete_task,
             set_odometer, log_work, search_history, upload_link, get_pages, confirm_visit
   rules     due-date logic, manufacturer schedules, validation, history integrity
   guidance  how to read shop paperwork and advise (MCP server instructions + a Skill)
   storage   Postgres + private Blob, originals kept, export / Google Drive
        ▲
 Web app: a window on the data (what's due, history, visits and pages, uploads, export) and a demo
```

- **Storage** is what exists: tables for cars, visits, items, tasks, files and messages, original files in Blob.
- **Harness** is the tools, with the rules enforced server-side so any agent writes correct data, plus guidance on doing it well: sort lines into done / found / quoted, take the owner's word over the paper, explain jargon, flag upsells, give check-it-yourself steps, never invent numbers.
- **Front end** is whichever agent the owner uses. Claude first: a custom connector in claude.ai and the Claude apps (phone included), and `claude mcp add` in Claude Code. Other agents work if they speak MCP.

## Files

Agents generally can't pass a photo from the chat into a tool call, but the originals must land in our storage. So:

- `upload_link` returns a short-lived link; the owner taps it and their phone uploads the pages straight into a visit.
- `get_pages` returns a visit's stored pages to the agent as images (MCP tool results can carry images), so the agent reads the originals.
- Later: a forwarding email address for invoices shops send by email.

## Proactive

The owner's agent does check-ins when it can schedule them ("every Monday, check my garage"): it calls `whats_due` and messages the owner. `whats_due` returns what needs attention: tasks due or late, quotes about to expire, stale odometer, seasonal deadlines (winter tires by December 1 in Quebec), open observations. Where the agent can't schedule, the backend sends a short daily email only when something needs attention.

## Auth and security

- OAuth 2.1 with dynamic client registration through `@better-auth/oauth-provider`, on top of the existing Google sign-in. The owner approves each agent once; tokens are revocable from the web app.
- Every tool acts only on the signed-in owner's rows (already true in the tools layer). Daily caps stay for anything that costs us money (schedule lookups).
- Model costs move to the owner's own agent subscription; the backend makes no model calls for MCP traffic.

## Web app

Done (November 10, 2026): the web app is read only. Signed in: Overview (what's due, quotes waiting on a decision, your notes), Documents (every visit with its original pages and lines) and History, under a card with the MCP address and how to connect. Signed out: the same views over a sample garage. The forms, the in-app chat, browser-only guest mode and the write APIs are gone; cars, schedules and suggested checks moved to MCP tools (add_car, update_car, delete_car, find_schedule, list_suggestions, track_suggestions, delete_visit).

The original plan: shrinks to a dashboard: what's due, history, visits with their pages and lines, uploads, export and settings (connected agents, Drive). Forms stay only for quick corrections. The built-in chat stays as a capped demo so recruiters can see the harness without bringing their own agent; it is no longer where new work goes.

## Steps

1. MCP server at `/api/mcp` with OAuth; tools wrapped from `src/server/agent/tools.ts` plus `get_garage`, `whats_due`, `upload_link`, `get_pages`.
2. Harness guidance: server instructions and a Skill, from the current system prompt.
3. Test with a Claude session on a real combined invoice / inspection / quote.
4. Dashboard: trim the web app; connected-agents settings; demo garage.
5. Export (zip) and Google Drive sync.
6. Daily email fallback for agents that can't schedule.
7. Search: Postgres full-text + pg_trgm behind `search_history`; Suggested-tab history (#1).
