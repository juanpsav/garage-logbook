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
  docId?: string;
};

export type LogEntry = {
  id: string;
  carId: string;
  title: string;
  date: string;
  km: number | null;
  cost: number | null;
  note: string;
  docId?: string;
  created: string;
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

export type DocType = "receipt" | "quote" | "inspection" | "other";

export type Extraction = {
  type: DocType;
  carId: string | null;
  title: string | null;
  date: string | null;
  shop: string | null;
  km: number | null;
  total: number | null;
  summary: string | null;
  workDone: { title: string; cost: number | null }[];
  recommended: {
    title: string;
    urgency: "now" | "soon" | "later";
    dueKm: number | null;
    dueDate: string | null;
    estCost: number | null;
    notes: string;
  }[];
  completes: string[];
};

export type StoredFile = { id: string; type: string };

export type Doc = {
  id: string;
  created: string;
  files: StoredFile[];
  thumb: string | null;
  carId: string | null;
  status: "reading" | "review" | "saved";
  ex: Partial<Extraction>;
  readError?: string | null;
  // Filled in when saved:
  type?: DocType;
  title?: string;
  date?: string;
  shop?: string | null;
  km?: number | null;
  total?: number | null;
  summary?: string | null;
  logId?: string | null;
  taskIds?: string[];
};

export type Collections = {
  cars: Car;
  tasks: Task;
  log: LogEntry;
  docs: Doc;
};
export type CollectionName = keyof Collections;
export const COLLECTIONS: CollectionName[] = ["cars", "tasks", "log", "docs"];

export type Data = { [K in CollectionName]: Collections[K][] };
