import { getAuth } from "@/server/auth";

// Protected resource metadata for /api/mcp (RFC 9728). The MCP auth plugin answers these paths.
export const GET = (req: Request) => getAuth().handler(req);
