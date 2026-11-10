export type Car = {
  id: string;
  name: string;
  km: number;
  kmDate?: string | null;
  scheduleId?: string | null;
  created: string;
};

export type Task = {
  id: string;
  carId: string;
  title: string;
  notes?: string;
  created: string;
  everyMonths?: number | null;
  everyKm?: number | null;
  /** "MM-DD": due every year on this day (seasonal checks). */
  anchor?: string | null;
  dueDate?: string | null;
  dueKm?: number | null;
  sugKey?: string;
  /** The visit whose paperwork recommended it. */
  visitId?: string | null;
};

export type ScheduleItem = {
  key: string;
  title: string;
  months?: number;
  km?: number;
  firstMonths?: number;
  firstKm?: number;
  anchor?: string;
  why: string;
};

export type Schedule = {
  id: string;
  name: string;
  modelYear?: number;
  source: string;
  sourceUrl?: string;
  note?: string;
  /** Keys of general suggestions to show alongside this schedule. */
  alsoGeneric?: string[];
  items: ScheduleItem[];
};

/** One trip to a shop (or a piece of work logged by hand): its paperwork, what was done, found and quoted. */
export type Visit = {
  id: string;
  carId: string | null;
  title: string;
  date: string | null;
  km: number | null;
  shop: string | null;
  total: number | null;
  summary: string | null;
  /** draft: pages being added; open: being gone through with the assistant; confirmed: in history. */
  status: "draft" | "open" | "confirmed";
  created: string;
};

export type ItemKind = "done" | "found" | "quoted";

/** A line of work. Shop lines belong to a visit; your own observations have no visit. */
export type Item = {
  id: string;
  carId: string | null;
  visitId: string | null;
  source: "shop" | "you";
  kind: ItemKind;
  /** Plain-English description. */
  text: string;
  /** The line as printed or written on the paperwork. */
  original: string | null;
  cost: number | null;
  page: number | null;
  /** The assistant couldn't read it with confidence. */
  unsure: boolean;
  keywords: string[];
  note: string | null;
  /** For quoted and found work: what you decided. */
  decision: "pending" | "accepted" | "declined" | "deferred" | null;
  created: string;
};

/** A page of a visit or a photo of an observation. `orig` is the file as uploaded; `view` is the JPEG the app shows and reads. */
export type FileRec = {
  id: string;
  visitId: string | null;
  itemId: string | null;
  position: number;
  type: string;
  name: string | null;
  orig: string;
  view: string | null;
  created: string;
};

export type Collections = {
  cars: Car;
  tasks: Task;
  visits: Visit;
  items: Item;
  files: FileRec;
};
export type CollectionName = keyof Collections;
export const COLLECTIONS: CollectionName[] = ["cars", "tasks", "visits", "items", "files"];

export type Data = { [K in CollectionName]: Collections[K][] };
