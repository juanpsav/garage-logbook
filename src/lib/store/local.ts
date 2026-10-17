import { uid } from "../dates";
import { COLLECTIONS, type CollectionName, type Collections, type Data } from "../types";
import { emptyData, StoreError, type Store } from "./index";

const KEY = "garage-logbook-v1";
const DB_NAME = "garage-logbook-files";

/** Records in localStorage, files in IndexedDB (localStorage is too small for photos). */
export class LocalStore implements Store {
  readonly kind = "local";
  private data: Data = emptyData();
  private urls = new Map<string, string>();
  private dbp: Promise<IDBDatabase> | null = null;

  async load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
      for (const k of COLLECTIONS) (this.data[k] as unknown[]) = Array.isArray(raw[k]) ? raw[k] : [];
    } catch {
      this.data = emptyData();
    }
    return structuredClone(this.data);
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      throw new StoreError("This browser's storage is full.", "quota");
    }
  }

  async put<K extends CollectionName>(col: K, obj: Collections[K]) {
    const list = this.data[col] as Collections[K][];
    const i = list.findIndex((x) => x.id === obj.id);
    if (i >= 0) list[i] = obj;
    else list.push(obj);
    this.save();
  }

  async del(col: CollectionName, id: string) {
    (this.data[col] as { id: string }[]) = (this.data[col] as { id: string }[]).filter((x) => x.id !== id);
    this.save();
  }

  private db() {
    this.dbp ??= new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore("files");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return this.dbp;
  }

  private async tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) {
    const db = await this.db();
    return new Promise<T>((res, rej) => {
      const r = fn(db.transaction("files", mode).objectStore("files"));
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error?.name === "QuotaExceededError" ? new StoreError("This browser's storage is full.", "quota") : r.error);
    });
  }

  async putFile(blob: Blob, type: string) {
    const id = uid();
    await this.tx("readwrite", (s) => s.put(new Blob([blob], { type }), id));
    return id;
  }

  async getFile(id: string) {
    const b = await this.tx<Blob | undefined>("readonly", (s) => s.get(id));
    if (!b) throw new StoreError("File not found.", "not_found");
    return b;
  }

  async fileSrc(id: string) {
    let u = this.urls.get(id);
    if (!u) {
      u = URL.createObjectURL(await this.getFile(id));
      this.urls.set(id, u);
    }
    return u;
  }

  async delFile(id: string) {
    const u = this.urls.get(id);
    if (u) URL.revokeObjectURL(u);
    this.urls.delete(id);
    await this.tx("readwrite", (s) => s.delete(id));
  }
}
