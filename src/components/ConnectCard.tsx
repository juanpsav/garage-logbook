"use client";

import { useState } from "react";

/** The MCP address with a copy button. */
export function McpUrl({ mcpUrl }: { mcpUrl: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(mcpUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* the address is on screen to copy by hand */ }
  };
  return (
    <div className="mcp-url">
      <code>{mcpUrl}</code>
      <button className="btn sm" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
    </div>
  );
}

/** How to add the server in each agent. */
export function ConnectSteps({ mcpUrl }: { mcpUrl: string }) {
  return (
    <details className="how">
      <summary>How to connect</summary>
      <ul className="steps">
        <li><strong>Claude</strong> (web, desktop, phone): Settings → Connectors → Add custom connector, paste the address, keep the detected settings, sign in with Google and allow.</li>
        <li><strong>Claude Code:</strong> <code>claude mcp add --transport http garage {mcpUrl}</code>, then <code>/mcp</code> to sign in.</li>
        <li><strong>Meta Muse:</strong> add the address as a remote MCP server in Muse&apos;s connections, then sign in with Google and allow.</li>
        <li><strong>Any other MCP client:</strong> add it as a remote (Streamable HTTP) server; it signs in with OAuth.</li>
      </ul>
    </details>
  );
}

/** Signed in: changes go through your agent; small fixes can be made here. */
export function ConnectCard({ mcpUrl }: { mcpUrl: string }) {
  return (
    <section className="card connect">
      <h2>Your agent keeps this up to date</h2>
      <p className="small flush">Ask it to add a car, go through shop paperwork or log work. Small fixes can be made here.</p>
      <McpUrl mcpUrl={mcpUrl} />
      <ConnectSteps mcpUrl={mcpUrl} />
    </section>
  );
}
