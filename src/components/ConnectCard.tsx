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
      <summary>Connect</summary>
      <ul className="steps">
        <li><strong>Claude</strong>: Settings → Connectors → Add custom connector.</li>
        <li><strong>Claude Code</strong>: <code>claude mcp add --transport http garage {mcpUrl}</code></li>
        <li><strong>Meta Muse</strong> and other MCP clients: add it as a remote MCP server.</li>
      </ul>
    </details>
  );
}

/** Signed in: the agent is the interface; this page is the backend. */
export function ConnectCard({ mcpUrl }: { mcpUrl: string }) {
  return (
    <section className="connect" aria-label="MCP server">
      <span className="eyebrow">MCP server</span>
      <h2>Your agent is the interface.</h2>
      <McpUrl mcpUrl={mcpUrl} />
      <ConnectSteps mcpUrl={mcpUrl} />
    </section>
  );
}
