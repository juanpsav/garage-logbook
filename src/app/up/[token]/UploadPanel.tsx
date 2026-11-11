"use client";

import { upload } from "@vercel/blob/client";
import { useRef, useState } from "react";
import { uid } from "@/lib/dates";
import { acceptable, MAX_FILES } from "@/lib/files";
import { preparePages } from "@/lib/pages";

const EXT: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" };

export function UploadPanel({ token, userId, visitId, title, car, start }: { token: string; userId: string; visitId: string; title: string; car: string | null; start: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [next, setNext] = useState(start);
  const [added, setAdded] = useState(0);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const add = async (list: File[]) => {
    const files = list.filter(acceptable).slice(0, MAX_FILES);
    if (!files.length) return;
    setState("saving");
    try {
      const put = async (b: Blob, type: string) =>
        (await upload(`u/${userId}/${uid()}.${EXT[type] ?? "bin"}`, b, { access: "private", contentType: type, handleUploadUrl: `/api/up/${token}/blob` })).pathname;
      const recs = await preparePages(files, put, visitId, next, true);
      const res = await fetch(`/api/up/${token}/files`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(recs) });
      if (!res.ok) throw new Error(String(res.status));
      setNext(next + recs.length);
      setAdded(added + recs.length);
      setState("idle");
    } catch {
      setState("error");
    }
  };
  return (
    <div className="card stack">
      <h2>Add pages</h2>
      <p className="small flush">To <strong>{title}</strong>{car && <> · {car}</>}. Take a photo of each page, or pick photos and PDFs. Add every page: invoice, inspection sheet, quote.</p>
      <button className="btn primary self-start" disabled={state === "saving"} onClick={() => input.current?.click()}>
        {state === "saving" ? "Saving…" : added ? "Add more pages" : "Add pages"}
      </button>
      <input ref={input} type="file" accept="image/*,application/pdf" multiple hidden
        onChange={(e) => { const fl = [...(e.target.files ?? [])]; e.target.value = ""; add(fl); }} />
      {added > 0 && <p className="small flush"><strong>{added === 1 ? "1 page added." : `${added} pages added.`}</strong> Go back to your assistant and tell it they&apos;re up.</p>}
      {state === "error" && <p className="small flush">Couldn&apos;t save. Check your connection and try again. If it keeps failing, ask your assistant for a new link.</p>}
    </div>
  );
}
