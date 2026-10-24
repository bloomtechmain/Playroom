import "server-only";
import { today, uid } from "@/lib/utils";
import { toItem } from "../collections";
import type { Mut } from "../mutation";

export type ClockResult = { ok: boolean; message: string; name?: string; direction?: "in" | "out" };

/** Badge scan at the kiosk: first scan of the day clocks in, the next one clocks out. */
export async function clockByToken(m: Mut, token: string): Promise<ClockResult> {
  const raw = token.trim();
  const qr = raw.startsWith("PLAYROOM-STAFF:") ? raw.slice("PLAYROOM-STAFF:".length) : "";
  if (!qr) return { ok: false, message: "Badge not recognised" };
  const [e] = await m.rows("employees", "SELECT * FROM employees WHERE qr_token = $1", [qr]);
  if (!e) return { ok: false, message: "Badge not recognised" };
  if (!e.active) return { ok: false, message: `${e.name}'s badge is inactive` };

  await m.lock(`clock:${e.id}`);
  const d = today();
  const row = await m.tx.one("SELECT * FROM attendance WHERE employee_id = $1 AND date = $2 AND clock_out IS NULL LIMIT 1", [e.id, d]);
  if (row) {
    const open = toItem("attendance", row);
    const mins = (Date.now() - new Date(open.clockIn).getTime()) / 60000;
    if (mins < 1) return { ok: false, message: "Already clocked in a moment ago — duplicate scan ignored", name: e.name };
    await m.update("attendance", open.id, { clockOut: new Date().toISOString() });
    await m.log("HR", "Clock out", `${e.name} (QR)`);
    return { ok: true, message: "Clocked out. Thanks for today!", name: e.name, direction: "out" };
  }
  await m.insert("attendance", { id: uid("at"), employeeId: e.id, date: d, clockIn: new Date().toISOString(), method: "qr" });
  await m.log("HR", "Clock in", `${e.name} (QR)`);
  return { ok: true, message: "Clocked in. Have a great shift!", name: e.name, direction: "in" };
}
