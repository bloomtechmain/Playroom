"use client";

import { useRef, useState } from "react";
import { CloudUpload, Database, Download, FolderOpen, MonitorSmartphone, ShieldCheck, Upload } from "lucide-react";
import { useStore, useCan } from "@/lib/store";
import type { DB } from "@/lib/seed";
import type { Settings } from "@/lib/types";
import { fmtDT } from "@/lib/utils";
import { Badge, Button, Card, Field, Input, NoAccess, PageHeader, Select, Table, Textarea, Toggle, toast } from "@/components/ui";
import { PrinterAgentSettings } from "@/components/PrinterAgentSettings";
import { backupSchedule, backupToFolder, chooseFolder, folderState, folderSupported, forgetFolder, reconnectFolder, useBackupFolder } from "@/lib/localBackup";

/** Only the fields this form edits — other screens change holidays, categories, payroll and WhatsApp settings meanwhile. */
const FORM_KEYS = ["businessName", "phone", "address", "email", "openingCash", "incomeTaxPct", "receiptFooter", "pointsPer100", "pointValue", "workStart", "standardHours", "refundNeedsApproval", "priceEditNeedsPermission", "comboDiscount", "guardianRate"] as const;
const formPatch = (f: Settings): Partial<Settings> => Object.fromEntries(FORM_KEYS.map((k) => [k, f[k]]));

export default function SettingsPage() {
  const can = useCan();
  if (!can("settings.edit")) return <NoAccess what="system settings" />;
  return <Inner />;
}

function Inner() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const restoreBackup = useStore((s) => s.restoreBackup);
  const backup = useStore((s) => s.backupNow);
  const [f, setF] = useState(settings);
  const combo = f.comboDiscount ?? { enabled: false, type: "percent" as const, value: 10 };
  const guardian = f.guardianRate ?? { enabled: false, type: "percent" as const, value: 50 };
  const setCombo = (p: Partial<typeof combo>) => setF({ ...f, comboDiscount: { ...combo, ...p } });
  const setGuardian = (p: Partial<typeof guardian>) => setF({ ...f, guardianRate: { ...guardian, ...p } });
  const file = useRef<HTMLInputElement>(null);

  const folder = useBackupFolder();
  const [sched, setSched] = useState(() => backupSchedule(settings));
  const schedChanged = JSON.stringify(sched) !== JSON.stringify(backupSchedule(settings));
  const saveSched = async () => {
    const times = [...new Set(sched.times.filter(Boolean))].sort();
    if (!times.length) return toast("Set at least one backup time", "err");
    if (await setSettings({ localBackup: { times, keepDays: sched.keepDays } }, `Automatic backups at ${times.join(" & ")}, kept ${sched.keepDays || "forever"} days`)) toast("Backup schedule saved");
  };

  // the snapshot is stored on the server and saved to this PC's backup folder — chosen once, then never
  // asked again — or downloaded as a file where the browser can't save into a folder
  const backupNow = async () => {
    if (folderSupported() && (folder.name || (await chooseFolder()))) {
      const r = await backupToFolder("now", backup);
      if (r === "saved") return toast(`Backup saved to the “${folderState().name}” folder`);
      if (r === "failed") return toast("The backup couldn't be saved to the folder", "err");
      return toast("The browser didn't allow saving to the backup folder", "err");
    }
    const data = await backup();
    if (!data) return;
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `playroom-backup-${new Date().toISOString().slice(0, 16).replace(":", "")}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Backup downloaded");
  };

  const restore = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fl = e.target.files?.[0];
    e.target.value = "";
    if (!fl) return;
    fl.text().then(async (t) => {
      let db: DB;
      try {
        db = JSON.parse(t) as DB;
        if (!db.users || !db.tickets) throw new Error();
      } catch {
        return toast("That file isn't a Playroom backup", "err");
      }
      if (await restoreBackup(db, fl.name)) toast("Backup restored");
    });
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="Business details, receipts, receipt printer, loyalty, visit discounts, security rules and backups." />
      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Business & receipts">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name"><Input value={f.businessName} onChange={(e) => setF({ ...f, businessName: e.target.value })} /></Field>
            <Field label="Phone"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            <Field label="Address" className="sm:col-span-2"><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
            <Field label="Email"><Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="Opening cash & bank balance" hint="Starting point for the cash flow report"><Input type="number" value={f.openingCash} onChange={(e) => setF({ ...f, openingCash: Number(e.target.value) })} /></Field>
            <Field label="Income tax rate on profit (%)" hint={f.incomeTaxPct ? `The P&L estimates income tax at ${f.incomeTaxPct}% of profit before tax` : "0 = the P&L shows only tax payments recorded as expenses"}>
              <Input type="number" min={0} max={100} step="0.5" value={f.incomeTaxPct ?? 0} onChange={(e) => setF({ ...f, incomeTaxPct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} />
            </Field>
            <Field label="Receipt footer" className="sm:col-span-2"><Textarea value={f.receiptFooter} onChange={(e) => setF({ ...f, receiptFooter: e.target.value })} /></Field>
          </div>
        </Card>
        <div className="space-y-5">
          <Card title="Loyalty & staff hours">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Points earned per Rs. 100"><Input type="number" value={f.pointsPer100} onChange={(e) => setF({ ...f, pointsPer100: Number(e.target.value) })} /></Field>
              <Field label="Value of 1 point (Rs.)"><Input type="number" value={f.pointValue} onChange={(e) => setF({ ...f, pointValue: Number(e.target.value) })} /></Field>
              <Field label="Shift start (late after +10 min)"><Input type="time" value={f.workStart} onChange={(e) => setF({ ...f, workStart: e.target.value })} /></Field>
              <Field label="Standard working hours / day"><Input type="number" value={f.standardHours} onChange={(e) => setF({ ...f, standardHours: Number(e.target.value) })} /></Field>
            </div>
          </Card>
          <Card title="Visit discounts">
            <div className="space-y-5">
              <div className="space-y-3">
                <Toggle checked={combo.enabled} onChange={(v) => setCombo({ enabled: v })} label="Play area + co-work discount" />
                <p className="text-xs text-muted">Taken off the whole visit when a family uses the play area and co-work together.</p>
                {combo.enabled && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Discount type">
                      <Select value={combo.type} onChange={(e) => setCombo({ type: e.target.value as "percent" | "fixed" })}>
                        <option value="percent">% off the visit</option>
                        <option value="fixed">Fixed amount off (Rs.)</option>
                      </Select>
                    </Field>
                    <Field label={combo.type === "percent" ? "Discount (%)" : "Discount (Rs.)"}>
                      <Input type="number" min={0} max={combo.type === "percent" ? 100 : undefined} value={combo.value} onChange={(e) => setCombo({ value: Math.max(0, Math.min(combo.type === "percent" ? 100 : Infinity, Number(e.target.value) || 0)) })} />
                    </Field>
                  </div>
                )}
              </div>
              <div className="space-y-3 border-t border-dashed border-line pt-4">
                <Toggle checked={guardian.enabled} onChange={(v) => setGuardian({ enabled: v })} label="Charge guardians in the play area" />
                <p className="text-xs text-muted">{guardian.enabled ? "Each accompanying adult is charged per 30 minutes at this offer price." : "Off: accompanying adults go in free (they are still counted at check-in)."}</p>
                {guardian.enabled && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Guardian price">
                      <Select value={guardian.type} onChange={(e) => setGuardian({ type: e.target.value as "percent" | "fixed" })}>
                        <option value="percent">% of the child rate</option>
                        <option value="fixed">Fixed Rs. per 30 min</option>
                      </Select>
                    </Field>
                    <Field label={guardian.type === "percent" ? "Percent of child rate (%)" : "Price per 30 min (Rs.)"} hint={guardian.type === "percent" ? "e.g. 50 = half the child price" : undefined}>
                      <Input type="number" min={0} max={guardian.type === "percent" ? 100 : undefined} value={guardian.value} onChange={(e) => setGuardian({ value: Math.max(0, Math.min(guardian.type === "percent" ? 100 : Infinity, Number(e.target.value) || 0)) })} />
                    </Field>
                  </div>
                )}
              </div>
            </div>
          </Card>
          <Card title="Security controls">
            <div className="space-y-3">
              <Toggle checked={f.refundNeedsApproval} onChange={(v) => setF({ ...f, refundNeedsApproval: v })} label="Refunds require manager approval" />
              <Toggle checked={f.priceEditNeedsPermission} onChange={(v) => setF({ ...f, priceEditNeedsPermission: v })} label="Counter price overrides need the “Override price” permission" />
              <p className="text-xs text-muted">Fine-grained access per role is managed in Users &amp; Roles.</p>
            </div>
          </Card>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button onClick={async () => { if (await setSettings(formPatch(f), "Business settings updated")) toast("Settings saved"); }}>Save settings</Button>
      </div>

      <div className="mt-6">
        <PrinterAgentSettings appName={settings.businessName || "PlayRoom"} />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <Card title="Backups" pad={false} action={<div className="flex gap-2"><Button size="sm" variant="secondary" icon={<Upload size={14} />} onClick={() => file.current?.click()}>Restore</Button><Button size="sm" icon={<Download size={14} />} onClick={backupNow}>Back up now</Button></div>}>
          <input ref={file} type="file" accept="application/json" className="hidden" onChange={restore} />
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4 text-sm">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sky-soft text-navy"><FolderOpen size={17} /></span>
            <div className="min-w-0 flex-1">
              <div className="font-bold">Backup folder on this PC</div>
              <div className="text-xs text-muted">
                {!folderSupported()
                  ? "Open the app in Chrome or Edge on the office PC to save backups into a folder automatically."
                  : !folder.name
                    ? "Choose a folder once: backups are then saved there automatically at the times below while the app is open on this PC, and when staff sign out or close their shift."
                    : folder.access !== "granted"
                      ? `“${folder.name}” — the browser needs permission again before it can save there.`
                      : folder.error
                        ? `“${folder.name}” — ${folder.error}`
                        : `Saving to “${folder.name}”${folder.saving ? " — saving…" : folder.lastSaved ? ` — last saved ${fmtDT(folder.lastSaved)}` : " — all backups saved"}`}
              </div>
            </div>
            {folderSupported() && (
              <div className="flex gap-2">
                {folder.name && folder.access !== "granted" && <Button size="sm" onClick={reconnectFolder}>Allow</Button>}
                <Button size="sm" variant="secondary" onClick={async () => { if (await chooseFolder()) toast("Backup folder set — saving backups there"); }}>{folder.name ? "Change folder" : "Choose folder"}</Button>
                {folder.name && <Button size="sm" variant="ghost" onClick={forgetFolder}>Stop</Button>}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-3 border-b border-line px-5 py-4 text-sm">
            <Field label="Automatic backup 1"><Input type="time" className="h-9 w-32" value={sched.times[0] ?? ""} onChange={(e) => setSched({ ...sched, times: [e.target.value, sched.times[1] ?? ""] })} /></Field>
            <Field label="Automatic backup 2"><Input type="time" className="h-9 w-32" value={sched.times[1] ?? ""} onChange={(e) => setSched({ ...sched, times: [sched.times[0] ?? "", e.target.value] })} /></Field>
            <Field label="Keep files for (days)" hint="0 = keep forever"><Input type="number" min={0} className="h-9 w-28" value={sched.keepDays} onChange={(e) => setSched({ ...sched, keepDays: Math.max(0, Math.round(Number(e.target.value) || 0)) })} /></Field>
            {schedChanged && <Button size="sm" className="mb-0.5" onClick={saveSched}>Save schedule</Button>}
            <p className="w-full text-xs text-muted">A time missed while the PC was off is saved as soon as the app is opened again that day. Older backup files in the folder are deleted automatically; nothing else in the folder is touched.</p>
          </div>
          <Table head={["Time", "Type", "Size", ""]}>
            {[...settings.backups].reverse().map((b) => (
              <tr key={b.id ?? b.at}>
                <td className="tabular">{fmtDT(b.at)}</td>
                <td>{b.auto ? <Badge tone="sky">Automatic daily</Badge> : <Badge tone="lilac">Manual</Badge>}</td>
                <td className="tabular text-muted">{(b.size / 1024 / 1024).toFixed(2)} MB</td>
                <td className="text-right">
                  {b.id && !b.id.startsWith("seed-") && (
                    <a href={`/api/backups/${b.id}`} title="Download" className="inline-grid rounded-lg p-1.5 text-muted hover:bg-sky-soft hover:text-navy">
                      <Download size={14} />
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Infrastructure">
          <div className="space-y-3 text-sm">
            <Item icon={<CloudUpload size={16} />} t="Cloud hosted" d="Next.js server with a PostgreSQL database; open it from any device on the network or deploy it to a managed cloud." />
            <Item icon={<Database size={16} />} t="Automated daily backups" d="The server takes a full database snapshot every day and keeps the last 14; they are also saved, twice a day, to the backup folder on the office PC. Any snapshot can be downloaded and restored." />
            <Item icon={<ShieldCheck size={16} />} t="Full audit trail" d="Every create, edit, delete, refund and price change is written to the activity log with before → after values." />
            <Item icon={<MonitorSmartphone size={16} />} t="Multi-device" d="Front desk PC with a QR reader for staff clock-in, tablets and phones for managers." />
          </div>
        </Card>
      </div>

    </>
  );
}

function Item({ icon, t, d }: { icon: React.ReactNode; t: string; d: string }) {
  return (
    <div className="flex gap-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-sky-soft text-navy">{icon}</span>
      <div><div className="font-bold">{t}</div><div className="text-xs text-muted">{d}</div></div>
    </div>
  );
}
