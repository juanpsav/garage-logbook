import { requireMcpAuth } from "@better-auth/mcp";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { getAuth, mcpResource } from "@/server/auth";
import { buildServer } from "@/server/mcp/server";

// find_schedule researches the web and can take a couple of minutes.
export const maxDuration = 300;

/**
 * The garage as an MCP server, for the owner's own agent (claude.ai connector, Claude Code, any MCP client).
 * Agents sign in through OAuth; the verified token's subject is the owner whose garage is served.
 */
async function serve(req: Request) {
  return requireMcpAuth(getAuth(), (request, claims) => {
    if (!claims.sub) return new Response(null, { status: 401 });
    return createMcpHandler(() => buildServer(claims.sub!)).fetch(request);
  }, { resource: mcpResource() })(req);
}

export const POST = serve;
export const GET = serve;
export const DELETE = serve;
