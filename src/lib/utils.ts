import { format, parseISO, differenceInYears } from "date-fns";

export { clsx as cx } from "clsx";

export const money = (n: number, withPrefix = true) => {
  const v = Math.round(n);
  const s = Math.abs(v).toLocaleString("en-LK");
  return `${v < 0 ? "-" : ""}${withPrefix ? "Rs. " : ""}${s}`;
};

export const shortMoney = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `${(n / 1_000).toFixed(a >= 100_000 ? 0 : 1)}k`;
  return `${Math.round(n)}`;
};

let counter = 0;
export const uid = (p = "") =>
  `${p}${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const today = () => format(new Date(), "yyyy-MM-dd");
export const dkey = (d: Date | string) => format(typeof d === "string" ? parseISO(d) : d, "yyyy-MM-dd");
export const fmtDate = (d: string | Date, f = "dd MMM yyyy") =>
  format(typeof d === "string" ? parseISO(d) : d, f);
export const fmtTime = (d: string | Date) => format(typeof d === "string" ? parseISO(d) : d, "h:mm a");
export const fmtDT = (d: string | Date) => format(typeof d === "string" ? parseISO(d) : d, "dd MMM, h:mm a");

export const ageOf = (dob: string) => differenceInYears(new Date(), parseISO(dob));

export const minsToLabel = (m: number) => {
  if (m <= 0) return "0m";
  const h = Math.floor(m / 60);
  const mm = Math.round(m % 60);
  return h ? `${h}h${mm ? ` ${mm}m` : ""}` : `${mm}m`;
};

export const timeToMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

export const methodLabel: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  transfer: "Bank Transfer",
  digital: "LankaQR / eWallet",
  wallet: "Playroom Wallet",
  online: "Online (Card)",
};

export function downloadCSV(name: string, rows: (string | number)[][]) {
  const csv = rows
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
