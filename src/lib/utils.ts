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

/** One-time password for a new or reset login, e.g. "Play-7k3m9q2x2" (always passes the strength rule). */
export function tempPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return `Play-${Array.from(bytes, (b) => chars[b % chars.length]).join("")}2`;
}

/** A free username from a person's name: "nimal", then "nimalp", then "nimal2"… */
export function suggestUsername(name: string, taken: string[]) {
  const words = name.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  const used = new Set(taken.map((t) => t.toLowerCase()));
  const first = words[0];
  const candidates = [first, ...(words[1] ? [first + words[words.length - 1][0]] : [])];
  for (let i = 2; candidates.length < 50; i++) candidates.push(`${first}${i}`);
  return candidates.find((c) => !used.has(c)) ?? first;
}

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
