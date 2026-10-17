"use client";

// Cloudflare Turnstile, run on demand right before a document read. Invisible for most people;
// shows a small check only when Cloudflare isn't sure. No site key configured = no check (local dev).

type TurnstileApi = {
  render(el: HTMLElement, opts: Record<string, unknown>): string;
  execute(id: string): void;
  reset(id: string): void;
};
declare global {
  interface Window { turnstile?: TurnstileApi }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
let ready: Promise<TurnstileApi> | null = null;

function load() {
  ready ??= new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => (window.turnstile ? res(window.turnstile) : rej(new Error("turnstile")));
    s.onerror = () => { ready = null; rej(new Error("turnstile")); };
    document.head.appendChild(s);
  });
  return ready;
}

export async function turnstileToken(): Promise<string | null> {
  if (!SITE_KEY) return null;
  const ts = await load();
  const el = document.getElementById("turnstile-slot");
  if (!el) throw new Error("turnstile slot missing");
  el.replaceChildren();
  return new Promise((res, rej) => {
    const id = ts.render(el, {
      sitekey: SITE_KEY,
      execution: "execute",
      appearance: "interaction-only",
      callback: (token: string) => { res(token); setTimeout(() => el.replaceChildren(), 0); },
      "error-callback": () => { rej(new Error("turnstile")); el.replaceChildren(); },
    });
    ts.execute(id);
  });
}
