"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useGarage } from "./state";

type Entry = { role: "user" | "assistant"; text: string; pages?: number; actions?: string[]; error?: boolean };
export type ChatThread = { visitId: string } | { carId: string };

const ERRORS: Record<string, string> = {
  rate_limited: "You've reached today's limit for the assistant. Try again tomorrow.",
  busy: "The assistant has reached its daily limit for everyone. Try again tomorrow.",
  unauthorized: "Your session ended. Sign in again.",
};

async function fetchChat(key: string): Promise<Entry[]> {
  try {
    const r = await fetch(`/api/agent?${key}`, { cache: "no-store" });
    return r.ok ? await r.json() : [];
  } catch {
    return [];
  }
}

/** Bold, paragraphs and simple lists: all the formatting the assistant uses. */
function Rich({ text }: { text: string }) {
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>));
  // Paragraphs split on blank lines; within one, runs of "- " or "1. " lines become a list.
  const isLi = (l: string) => /^\s*([-•*]|\d+\.)\s/.test(l);
  const out: React.ReactNode[] = [];
  text.split(/\n{2,}/).forEach((para, i) => {
    const lines = para.split("\n").filter((l) => l.trim());
    let run: string[] = [], li = false;
    const flush = (k: string) => {
      if (!run.length) return;
      out.push(li
        ? <ul key={k}>{run.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-•*]|\d+\.)\s+/, ""))}</li>)}</ul>
        : <p key={k}>{run.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l.replace(/^#+\s*/, ""))}</Fragment>)}</p>);
      run = [];
    };
    lines.forEach((l, j) => {
      if (run.length && isLi(l) !== li) flush(`${i}-${j}`);
      li = isLi(l);
      run.push(l);
    });
    flush(`${i}-end`);
  });
  return <>{out}</>;
}

/**
 * A conversation with the assistant about one visit or one car. `start` sends the first message
 * on its own (going through newly added pages) when the conversation is empty.
 */
export function Chat({ thread, placeholder, start, onTurn }: { thread: ChatThread; placeholder: string; start?: boolean; onTurn?: () => void }) {
  const g = useGarage();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [live, setLive] = useState<Entry | null>(null);
  const [text, setText] = useState("");
  const key = "visitId" in thread ? `visitId=${thread.visitId}` : `carId=${thread.carId}`;
  const started = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  const reload = g.reload;

  const load = useCallback(async () => setEntries(await fetchChat(key)), [key]);
  useEffect(() => {
    let on = true;
    fetchChat(key).then((e) => on && setEntries(e));
    return () => { on = false; };
  }, [key]);

  const send = useCallback(async (words: string) => {
    setLive({ role: "assistant", text: "", actions: [] });
    if (words) setEntries((e) => [...(e ?? []), { role: "user", text: words }]);
    let reply: Entry = { role: "assistant", text: "", actions: [] };
    try {
      const res = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...thread, text: words }) });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        throw new Error(ERRORS[j?.error] ?? "The assistant isn't available right now. Try again.");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const l of lines) {
          if (!l) continue;
          const e = JSON.parse(l);
          if (e.t === "text") reply = { ...reply, text: reply.text + e.d };
          else if (e.t === "step" && reply.text && !reply.text.endsWith("\n\n")) reply = { ...reply, text: reply.text + "\n\n" };
          else if (e.t === "tool") reply = { ...reply, actions: [...(reply.actions ?? []), e.label] };
          else if (e.t === "changed") reload();
          else if (e.t === "error") reply = { ...reply, text: (reply.text ? reply.text + "\n\n" : "") + e.msg, error: true };
          setLive(reply);
        }
      }
    } catch (e) {
      reply = { role: "assistant", text: (e as Error).message || "Couldn't reach the assistant. Check your connection.", error: true };
    }
    setLive(null);
    await reload();
    // The stored conversation is the record; reload it unless the turn never reached the server.
    if (reply.error && !reply.actions?.length) setEntries((e) => [...(e ?? []), reply]);
    else await load();
    onTurn?.();
  }, [thread, reload, load, onTurn]);

  useEffect(() => {
    if (start && entries && !entries.length && !live && !started.current) {
      started.current = true;
      send("");
    }
  }, [start, entries, live, send]);

  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [entries, live]);

  const busy = !!live;
  const submit = () => {
    const w = text.trim();
    if (!w || busy) return;
    setText("");
    send(w);
  };
  const shown = [...(entries ?? []), ...(live ? [live] : [])];
  return (
    <div className="chat">
      {entries === null ? <p className="muted small">Loading the conversation…</p> : (
        <div className="msgs">
          {shown.map((m, i) => (
            <div key={i} className={`msg ${m.role}${m.error ? " error" : ""}`}>
              {m.pages ? <span className="muted small">{m.pages === 1 ? "Added a page" : `Added ${m.pages} pages`}</span> : null}
              {m.text ? <Rich text={m.text} /> : m.role === "assistant" && m === live ? <span className="reading"><span className="spin" />{live.actions?.length ? "Working…" : "Reading…"}</span> : null}
              {!!m.actions?.length && <div className="acts-done">{[...new Set(m.actions)].map((a) => <span key={a} className="chip">{a}</span>)}</div>}
            </div>
          ))}
          <div ref={end} />
        </div>
      )}
      <form className="composer" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <textarea
          rows={2}
          value={text}
          placeholder={placeholder}
          aria-label="Message to the assistant"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia("(pointer:fine)").matches) { e.preventDefault(); submit(); } }}
        />
        <button className="btn primary" disabled={busy || !text.trim()}>Send</button>
      </form>
    </div>
  );
}
