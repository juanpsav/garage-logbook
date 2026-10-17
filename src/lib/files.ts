"use client";

// Browser-side image prep. Everything sent for reading is a JPEG on a white background:
// a transparent PNG flattened onto nothing comes out black, and the reader sees an empty page.

export const MAX_FILES = 8;
export const MAX_PDF_PAGES = 4;
export const READ_EDGE = 1600;

export const isPdf = (f: File | Blob) => f.type === "application/pdf" || ("name" in f && /\.pdf$/i.test(f.name));
export const acceptable = (f: File) => /^image\//.test(f.type) || isPdf(f);

const toJpeg = (c: HTMLCanvasElement, q = 0.85) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/jpeg", q));

export async function shrink(blob: Blob, max: number) {
  const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  const g = c.getContext("2d")!;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return toJpeg(c);
}

export async function pdfToImages(blob: Blob, maxPages = MAX_PDF_PAGES) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  const out: Blob[] = [];
  for (let i = 1; i <= Math.min(pdf.numPages, maxPages); i++) {
    const page = await pdf.getPage(i);
    const v0 = page.getViewport({ scale: 1 });
    const v = page.getViewport({ scale: Math.min(2.5, READ_EDGE / v0.width) });
    const c = document.createElement("canvas");
    c.width = Math.round(v.width);
    c.height = Math.round(v.height);
    const g = c.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    await page.render({ canvas: c, canvasContext: g, viewport: v }).promise;
    out.push(await toJpeg(c));
  }
  return out;
}
