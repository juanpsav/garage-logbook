"use client";

import { useState } from "react";

/** How to connect an agent: the garage changes only through one. */
export function ConnectCard({ mcpUrl, signedIn }: { mcpUrl: string; signedIn: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(mcpUrl); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* the address is on screen to copy by hand */ }
  };
  return (
    <section className="card connect">
      <div className="stack">
        <h2>{signedIn ? "Need to update something? Ask your agent." : "Your agent keeps the logbook"}</h2>
        <p className="small flush">
          {signedIn
            ? "This page is read only. Your AI agent adds cars, reads shop paperwork, tracks what's due and records the work, through this garage's MCP server."
            : "No forms to fill in. Connect your own AI agent (Claude, or any app that supports MCP) and talk to it: it reads your shop paperwork, sorts out what was done, found and quoted, tells you what's really needed, and keeps track of what's due. Your documents and history stay here."}
        </p>
        <div className="mcp-url">
          <code>{mcpUrl}</code>
          <button className="btn sm" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
        </div>
        <details>
          <summary className="small">How to connect</summary>
          <ul className="small steps">
            <li><strong>Claude (web, desktop, phone):</strong> Settings → Connectors → Add custom connector, paste the address above, keep the detected settings, then sign in with Google and allow.</li>
            <li><strong>Claude Code:</strong> <code>claude mcp add --transport http garage {mcpUrl}</code>, then <code>/mcp</code> to sign in.</li>
            <li><strong>Other agents:</strong> add a remote MCP server with this address; it signs in with OAuth.</li>
          </ul>
          <p className="small flush">Then try: “What&apos;s due on my car?”, or “I have the paperwork from my tire change, help me go through it.”</p>
        </details>
      </div>
    </section>
  );
}
