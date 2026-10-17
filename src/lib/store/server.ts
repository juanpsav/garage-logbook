import { upload } from "@vercel/blob/client";
import { uid } from "../dates";
import type { CollectionName, Collections, Data } from "../types";
import { StoreError, type Store } from "./index";

async function ok(res: Response) {
  if (res.ok) return res;
  throw new StoreError(`Request failed (${res.status})`, res.status === 413 ? "too_large" : res.status === 401 ? "signed_out" : "network");
}

/** The signed-in owner's garage: records in Postgres, files in the private Blob store. */
export class ServerStore implements Store {
  readonly kind = "server";
  constructor(private readonly userId: string) {}

  async load(): Promise<Data> {
    return (await ok(await fetch("/api/data", { cache: "no-store" }))).json();
  }

  async put<K extends CollectionName>(col: K, obj: Collections[K]) {
    await ok(await fetch(`/api/data/${col}/${obj.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(obj),
    }));
  }

  async del(col: CollectionName, id: string) {
    await ok(await fetch(`/api/data/${col}/${id}`, { method: "DELETE" }));
  }

  async putFile(blob: Blob, type: string) {
    const ext = type === "application/pdf" ? "pdf" : "jpg";
    try {
      const r = await upload(`u/${this.userId}/${uid()}.${ext}`, blob, {
        access: "private",
        contentType: type,
        handleUploadUrl: "/api/files/upload",
      });
      return r.pathname;
    } catch {
      throw new StoreError("Upload failed", "network");
    }
  }

  async fileSrc(id: string) {
    return `/api/files/${id}`;
  }

  async getFile(id: string) {
    return (await ok(await fetch(`/api/files/${id}`))).blob();
  }

  async delFile(id: string) {
    await ok(await fetch(`/api/files/${id}`, { method: "DELETE" }));
  }
}
