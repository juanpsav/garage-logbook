// Dates are local calendar days stored as "YYYY-MM-DD" strings.

const pad = (n: number) => String(n).padStart(2, "0");
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const today = () => iso(new Date());
export const daysBetween = (a: string, b: string) => Math.round((+parse(b) - +parse(a)) / 86400000);

export function addMonths(s: string, n: number) {
  const d = parse(s), day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return iso(d);
}

export function addDays(s: string, n: number) {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}

/** Next occurrence of "MM-DD" on or after `from`. */
export function nextAnchor(mmdd: string, from: string) {
  const y = parse(from).getFullYear();
  const s = `${y}-${mmdd}`;
  return s < from ? `${y + 1}-${mmdd}` : s;
}

export const fmtNum = (n: number) => Math.round(n).toLocaleString("en-US").replace(/,/g, " ");
export const fmtKm = (n: number) => fmtNum(n) + " km";
export const fmtDate = (s: string) =>
  parse(s).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
export const fmtMoney = (n: number) => `$${n.toFixed(2)}`;

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const now = () => new Date().toISOString();

export const num = (v: unknown) => {
  if (typeof v === "number") return isFinite(v) ? v : null;
  const n = parseFloat(String(v ?? "").replace(/[\s,]/g, ""));
  return isFinite(n) ? n : null;
};
