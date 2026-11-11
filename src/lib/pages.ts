import { now, uid } from "./dates";
import { isPdf, MAX_READ_PAGES, pdfToImages, shrink } from "./files";
import type { FileRec } from "./types";

export type PutFile = (blob: Blob, type: string) => Promise<string>;

/**
 * Stores photos and PDFs as pages of a visit. Each page gets a JPEG the app shows and any agent can read;
 * the file as uploaded is kept as `orig` when `keepOriginal` (a PDF always is, and its pages share it).
 */
export async function preparePages(files: File[], put: PutFile, visitId: string, start: number, keepOriginal: boolean): Promise<FileRec[]> {
  const out: FileRec[] = [];
  let pos = start;
  for (const f of files) {
    const base = () => ({ id: uid(), visitId, itemId: null, position: pos++, created: now() });
    if (isPdf(f)) {
      const orig = await put(f, "application/pdf");
      let imgs: Blob[] = [];
      try { imgs = await pdfToImages(f, MAX_READ_PAGES); } catch { /* kept, just without page images */ }
      if (!imgs.length) { out.push({ ...base(), type: "application/pdf", name: f.name || null, orig, view: null }); continue; }
      for (const [i, img] of imgs.entries()) {
        out.push({ ...base(), type: "application/pdf", name: `${f.name || "PDF"} · page ${i + 1}`, orig, view: await put(img, "image/jpeg") });
      }
    } else {
      let b: Blob;
      try { b = await shrink(f, 2000); } catch { throw new Error(`Couldn't open ${f.name || "that image"}`); }
      const view = await put(b, "image/jpeg");
      const orig = keepOriginal ? await put(f, f.type || "image/jpeg") : view;
      out.push({ ...base(), type: f.type || "image/jpeg", name: f.name || null, orig, view });
    }
  }
  return out;
}
