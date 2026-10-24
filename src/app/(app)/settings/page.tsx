"use client";

import { useRef, useState } from "react";
import { CloudUpload, Database, Download, MonitorSmartphone, RotateCcw, ShieldCheck, Upload } from "lucide-react";
import { useStore, useCan } from "@/lib/store";
import type { DB } from "@/lib/seed";
import { fmtDT } from "@/lib/utils";
import { Badge, Button, Card, Field, Input, Modal, NoAccess, PageHeader, Table, Textarea, Toggle, toast } from "@/components/ui";
import { PrinterAgentSettings } from "@/components/PrinterAgentSettings";

export default function SettingsPage() {
  const can = useCan();
  if (!can("settings.edit")) return <NoAccess what="system settings" />;
  return <Inner />;
}

function Inner() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const reset = useStore((s) => s.resetDemo);
  const restoreBackup = useStore((s) => s.restoreBackup);
  const backup = useStore((s) => s.backupNow);
  const demo = useStore((s) => s.demo);
  const [f, setF] = useState(settings);
  const [confirmReset, setConfirmReset] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  // the snapshot is stored on the server and also handed to the browser as a file
  const backupNow = async () => {
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
      <PageHeader title="Settings" subtitle="Business details, receipts, receipt printer, loyalty, security rules and backups." />
      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Business & receipts">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name"><Input value={f.businessName} onChange={(e) => setF({ ...f, businessName: e.target.value })} /></Field>
            <Field label="Phone"><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
            <Field label="Address" className="sm:col-span-2"><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
            <Field label="Email"><Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label="Opening cash & bank balance" hint="Starting point for the cash flow report"><Input type="number" value={f.openingCash} onChange={(e) => setF({ ...f, openingCash: Number(e.target.value) })} /></Field>
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
        <Button onClick={async () => { if (await setSettings(f, "Business settings updated")) toast("Settings saved"); }}>Save settings</Button>
      </div>

      <div className="mt-6">
        <PrinterAgentSettings appName={settings.businessName || "PlayRoom"} />
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <Card title="Backups" pad={false} action={<div className="flex gap-2"><Button size="sm" variant="secondary" icon={<Upload size={14} />} onClick={() => file.current?.click()}>Restore</Button><Button size="sm" icon={<Download size={14} />} onClick={backupNow}>Back up now</Button></div>}>
          <input ref={file} type="file" accept="application/json" className="hidden" onChange={restore} />
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
            <Item icon={<Database size={16} />} t="Automated daily backups" d="The server stores a full database snapshot every day and keeps 14. Any snapshot can be downloaded and restored." />
            <Item icon={<ShieldCheck size={16} />} t="Full audit trail" d="Every create, edit, delete, refund and price change is written to the activity log with before → after values." />
            <Item icon={<MonitorSmartphone size={16} />} t="Multi-device" d="Front desk PC, tablet kiosk for staff QR clock-in and phones for managers." />
          </div>
          {demo && (
            <div className="mt-5 rounded-xl border border-dashed border-[#e0b13a] bg-sun-soft p-4">
              <div className="text-sm font-bold text-[#8a6510]">Demo data</div>
              <p className="mt-1 text-xs text-[#8a6510]">The server is running in demo mode. Resetting replaces everything in the database with about three months of sample history.</p>
              <Button size="sm" variant="danger" className="mt-3" icon={<RotateCcw size={14} />} onClick={() => setConfirmReset(true)}>Reset demo data</Button>
            </div>
          )}
        </Card>
      </div>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="Reset demo data?" footer={<><Button variant="secondary" onClick={() => setConfirmReset(false)}>Cancel</Button><Button variant="danger" onClick={async () => { setConfirmReset(false); if (await reset()) toast("Demo data rebuilt"); }}>Reset</Button></>}>
        <p className="text-sm">Everything in the database will be replaced with fresh sample data, for every user and device.</p>
      </Modal>
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
