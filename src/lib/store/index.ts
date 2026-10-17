import type { CollectionName, Collections, Data } from "../types";

/**
 * Where a garage's records and files live. Guests use the browser (LocalStore);
 * the signed-in owner uses the server (ServerStore). The UI only talks to this.
 */
export interface Store {
  readonly kind: "local" | "server";
  load(): Promise<Data>;
  put<K extends CollectionName>(col: K, obj: Collections[K]): Promise<void>;
  del(col: CollectionName, id: string): Promise<void>;
  /** Saves a file and returns its id. */
  putFile(blob: Blob, type: string): Promise<string>;
  /** A URL an <img> or <a> can use for a stored file. */
  fileSrc(id: string): Promise<string>;
  getFile(id: string): Promise<Blob>;
  delFile(id: string): Promise<void>;
}

export const emptyData = (): Data => ({ cars: [], tasks: [], log: [], docs: [] });

export class StoreError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}
