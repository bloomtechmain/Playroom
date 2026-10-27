"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { AlertTriangle, Cake, CheckCircle2, Link2, Megaphone, MessageCircle, Plus, RefreshCw, Send, Smartphone, Trash2, Unlink, XCircle } from "lucide-react";
import { useCan, useStore } from "@/lib/store";
import { normalizePhone, PLACEHOLDERS, whatsappSettings, type Audience, type UpcomingBirthday, type WaMessage, type WaStatus, type WhatsAppSettings } from "@/lib/whatsapp";
import { cx, fmtDate, fmtDT } from "@/lib/utils";
import { Badge, Button, Card, Empty, Field, Input, Modal, NoAccess, PageHeader, Select, Stat, Table, Tabs, Textarea, Toggle, toast, type Tone } from "@/components/ui";

type Tab = "connection" | "campaigns" | "birthdays" | "messages" | "settings";

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method ?? (init?.body === undefined ? "GET" : "POST"),
    headers: init?.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `Request failed (${res.status})`);
  return json as T;
}
const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

export default function WhatsAppPage() {
  const can = useCan();
  if (!can("whatsapp.send") && !can("whatsapp.connect")) return <NoAccess what="WhatsApp messaging" />;
  return <Inner />;
}

function Inner() {
  const can = useCan();
  const [tab, setTab] = useState<Tab>("connection");
  const [status, setStatus] = useState<WaStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await call<WaStatus>("/api/whatsapp/status"));
    } catch {
      /* the next poll will try again */
    }
  }, []);
  useEffect(() => {
    const first = setTimeout(() => void refresh(), 0);
    // poll quickly while a QR is waiting to be scanned
    const t = setInterval(refresh, status?.status === "qr" || status?.status === "connecting" ? 2000 : 8000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [refresh, status?.status]);

  const items = [
    { value: "connection" as const, label: "Connection" },
    ...(can("whatsapp.send")
      ? [
          { value: "campaigns" as const, label: "Promotions" },
          { value: "birthdays" as const, label: "Birthdays" },
          { value: "messages" as const, label: "Messages" },
        ]
      : []),
    ...(can("whatsapp.connect") ? [{ value: "settings" as const, label: "Settings" }] : []),
  ];

  return (
    <>
      <PageHeader title="WhatsApp" subtitle="Check-in tickets, receipts, birthday wishes and promotions — sent from your own WhatsApp number." actions={<StatusBadge s={status} />} />
      <div className="mb-5">
        <Tabs value={tab} onChange={setTab} items={items} />
      </div>
      {tab === "connection" && <Connection status={status} refresh={refresh} />}
      {tab === "campaigns" && <Campaigns connected={status?.status === "connected"} />}
      {tab === "birthdays" && <Birthdays />}
      {tab === "messages" && <Messages />}
      {tab === "settings" && <Settings />}
    </>
  );
}

function StatusBadge({ s }: { s: WaStatus | null }) {
  if (!s) return null;
  const map: Record<WaStatus["status"], [Tone, string]> = {
    connected: ["mint", `Connected${s.me ? ` · +${s.me.id}` : ""}`],
    qr: ["sun", "Waiting for QR scan"],
    connecting: ["sky", "Connecting…"],
    disconnected: ["rose", "Not connected"],
  };
  const [tone, text] = map[s.status];
  return <Badge tone={tone}>{text}</Badge>;
}

// ---------------------------------------------------------------- connection

function Connection({ status, refresh }: { status: WaStatus | null; refresh: () => Promise<void> }) {
  const can = useCan();
  const settings = useStore((s) => s.settings);
  const w = whatsappSettings(settings);
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [test, setTest] = useState({ phone: "", body: `Hello from ${settings.businessName}! 👋` });

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast(ok);
      await refresh();
    } catch (e) {
      toast(errText(e), "err");
    } finally {
      setBusy(false);
    }
  };

  const s = status?.status ?? "connecting";
  return (
    <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
      <Card title={<span className="flex items-center gap-2"><Smartphone size={17} /> Linked WhatsApp account</span>}>
        {s === "connected" && (
          <div className="flex flex-col items-center py-6 text-center">
            <CheckCircle2 size={54} className="text-[#3aa985]" />
            <div className="mt-3 font-display text-2xl font-semibold">Connected</div>
            <div className="text-muted">{status?.me?.name ? `${status.me.name} · ` : ""}+{status?.me?.id}</div>
            <p className="mt-3 max-w-md text-sm text-muted">Messages are sent from this number. Keep the phone charged and online; it can stay in your pocket.</p>
            {can("whatsapp.connect") && (
              <Button variant="danger" className="mt-5" icon={<Unlink size={15} />} disabled={busy} onClick={() => setConfirmOff(true)}>
                Disconnect
              </Button>
            )}
          </div>
        )}
        {s === "qr" && status?.qr && (
          <div className="grid items-center gap-6 md:grid-cols-[auto_1fr]">
            <div className="rounded-2xl border border-line bg-white p-3">
              <QRCodeSVG value={status.qr} size={240} />
            </div>
            <ol className="list-decimal space-y-2 pl-5 text-sm">
              <li>Open <b>WhatsApp</b> on the business phone.</li>
              <li>Go to <b>Settings → Linked devices</b> (Android: ⋮ menu → Linked devices).</li>
              <li>Tap <b>Link a device</b> and point the phone at this QR code.</li>
              <li>Keep this page open — it changes to <b>Connected</b> by itself.</li>
            </ol>
          </div>
        )}
        {(s === "connecting" || (s === "qr" && !status?.qr)) && (
          <div className="flex flex-col items-center py-10 text-muted">
            <RefreshCw className="animate-spin" />
            <p className="mt-3">Connecting to WhatsApp…</p>
          </div>
        )}
        {s === "disconnected" && (
          <div className="flex flex-col items-center py-6 text-center">
            <XCircle size={54} className="text-[#e0607b]" />
            <div className="mt-3 font-display text-2xl font-semibold">Not connected</div>
            {status?.error && <p className="mt-2 max-w-md rounded-xl bg-rose-soft px-3 py-2 text-sm text-[#a63a54]">{status.error}</p>}
            <p className="mt-3 max-w-md text-sm text-muted">Link the business WhatsApp number by scanning a QR code — no WhatsApp API account needed.</p>
            {can("whatsapp.connect") ? (
              <Button className="mt-5" icon={<Link2 size={15} />} disabled={busy} onClick={() => act(() => call("/api/whatsapp/connect", { body: {} }))}>
                Connect WhatsApp
              </Button>
            ) : (
              <p className="mt-4 text-xs text-muted">Ask an administrator to link the account.</p>
            )}
          </div>
        )}
      </Card>

      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <Stat label="Waiting to send" value={status?.queue.queued ?? 0} tone="sky" />
          <Stat label="Sent today" value={status?.queue.sentToday ?? 0} tone="mint" />
          <Stat label="Promotions & wishes today" value={`${status?.queue.marketingToday ?? 0} / ${w.dailyLimit}`} tone="lilac" />
          <Stat label="Failed today" value={status?.queue.failedToday ?? 0} tone="rose" />
        </div>
        <div className="rounded-2xl border border-sun bg-sun-soft p-4 text-sm text-[#8a6510]">
          <div className="flex items-center gap-2 font-bold"><AlertTriangle size={16} /> Use a business number and send gently</div>
          <p className="mt-1">
            This links WhatsApp the same way as WhatsApp Web, not through Meta&apos;s official API. WhatsApp can block numbers that send many promotions, especially to people who
            haven&apos;t saved the number. Messages go out one at a time ({w.minDelay}–{w.maxDelay} s apart, at most {w.dailyLimit} promotions a day), and anyone who replies STOP is
            opted out automatically.
          </p>
        </div>
        {s === "connected" && (
          <Card title="Send a test message">
            <div className="space-y-3">
              <Field label="Mobile number"><Input placeholder="07X XXX XXXX" value={test.phone} onChange={(e) => setTest({ ...test, phone: e.target.value })} /></Field>
              <Field label="Message"><Textarea value={test.body} onChange={(e) => setTest({ ...test, body: e.target.value })} /></Field>
              <Button icon={<Send size={15} />} disabled={busy} onClick={() => act(() => call("/api/whatsapp/messages", { body: { action: "send", phone: test.phone, body: test.body } }), "Message queued — it goes out in a few seconds")}>
                Send
              </Button>
            </div>
          </Card>
        )}
      </div>

      <Modal
        open={confirmOff}
        onClose={() => setConfirmOff(false)}
        title="Disconnect WhatsApp?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOff(false)}>Cancel</Button>
            <Button variant="danger" onClick={() => { setConfirmOff(false); void act(() => call("/api/whatsapp/connect", { method: "DELETE" }), "WhatsApp disconnected"); }}>Disconnect</Button>
          </>
        }
      >
        <p className="text-sm">The linked device is logged out. Messages waiting in the queue stay there until a number is linked again (check-in messages and receipts expire after 2 hours).</p>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------- campaigns

const SEGMENTS: { value: Audience["segment"]; label: string }[] = [
  { value: "all", label: "All customers" },
  { value: "members", label: "Members only" },
  { value: "recent", label: "Visited recently" },
  { value: "kids_age", label: "Families with kids aged…" },
  { value: "birthday_month", label: "A child's birthday is this month" },
];

function Campaigns({ connected }: { connected: boolean }) {
  const promos = useStore((s) => s.promotions);
  const settings = useStore((s) => s.settings);
  const w = whatsappSettings(settings);
  const [aud, setAud] = useState<Audience>({ segment: "all", days: 60, minAge: 2, maxAge: 8 });
  const [promoId, setPromoId] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("Hi {name}! 🎈 This week at {business}: use code *{code}* for {promo}. See you soon!");
  const [preview, setPreview] = useState<{ count: number; sample: string[] } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const promo = promos.find((p) => p.id === promoId);

  useEffect(() => {
    let live = true;
    call<{ result: { count: number; sample: string[] } }>("/api/whatsapp/campaigns", { body: { audience: aud, preview: true } })
      .then((r) => live && setPreview(r.result))
      .catch(() => live && setPreview(null));
    return () => {
      live = false;
    };
  }, [aud]);

  const sample = message
    .replace(/\{name\}/g, preview?.sample[0]?.split(" ")[0] ?? "Nadeeka")
    .replace(/\{business\}/g, settings.businessName)
    .replace(/\{code\}/g, promo?.code ?? "{code}")
    .replace(/\{promo\}/g, promo?.name ?? "{promo}");
  const minutes = preview ? Math.ceil((preview.count * (w.minDelay + w.maxDelay)) / 2 / 60) : 0;

  const send = async () => {
    setConfirm(false);
    setBusy(true);
    try {
      const r = await call<{ result: { count: number } }>("/api/whatsapp/campaigns", { body: { audience: aud, name, message, promotionId: promoId || undefined } });
      toast(`${r.result.count} message(s) queued`);
    } catch (e) {
      toast(errText(e), "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
      <Card title={<span className="flex items-center gap-2"><Megaphone size={17} /> New promotion message</span>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Campaign name"><Input placeholder="e.g. School holiday offer" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Promotion (optional)" hint="Fills {code} and {promo}">
            <Select value={promoId} onChange={(e) => setPromoId(e.target.value)}>
              <option value="">— none —</option>
              {promos.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
            </Select>
          </Field>
          <Field label="Message" className="sm:col-span-2" hint={`You can use ${PLACEHOLDERS.promotion.join(" ")} · *bold* · _italic_`}>
            <Textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} />
          </Field>
          <Field label="Send to">
            <Select value={aud.segment} onChange={(e) => setAud({ ...aud, segment: e.target.value as Audience["segment"] })}>
              {SEGMENTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
          </Field>
          {aud.segment === "recent" && (
            <Field label="Visited in the last (days)"><Input type="number" min={1} value={aud.days} onChange={(e) => setAud({ ...aud, days: Number(e.target.value) || 1 })} /></Field>
          )}
          {aud.segment === "kids_age" && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Age from"><Input type="number" min={0} max={18} value={aud.minAge} onChange={(e) => setAud({ ...aud, minAge: Number(e.target.value) })} /></Field>
              <Field label="to"><Input type="number" min={0} max={18} value={aud.maxAge} onChange={(e) => setAud({ ...aud, maxAge: Number(e.target.value) })} /></Field>
            </div>
          )}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div className="text-sm">
            <b className="tabular">{preview?.count ?? "…"}</b> customer(s) with a WhatsApp number{preview && preview.count > 0 && <span className="text-muted"> · about {minutes} min to send</span>}
            <div className="text-xs text-muted">Customers who opted out are left out automatically.</div>
          </div>
          <Button icon={<Send size={15} />} disabled={busy || !preview?.count || !message.trim()} onClick={() => setConfirm(true)}>
            Send promotion
          </Button>
        </div>
        {!connected && <p className="mt-3 rounded-xl bg-sun-soft px-3 py-2 text-xs text-[#8a6510]">WhatsApp isn&apos;t connected — messages will wait in the queue until it is.</p>}
      </Card>

      <Card title="Preview">
        <div className="rounded-2xl bg-[#e7ddd3] p-4">
          <div className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-[#d9fdd3] px-3 py-2 text-sm shadow-sm">
            {sample}
            {w.promoFooter && <div className="mt-2 text-xs italic text-ink/70">{w.promoFooter}</div>}
          </div>
        </div>
        {preview && preview.sample.length > 0 && <p className="mt-3 text-xs text-muted">Goes to {preview.sample.slice(0, 5).join(", ")}{preview.count > 5 ? ` and ${preview.count - 5} more` : ""}.</p>}
      </Card>

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Send this promotion?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button onClick={send}>Queue {preview?.count} message(s)</Button>
          </>
        }
      >
        <p className="text-sm">
          {preview?.count} customer(s) will get this message, one every {w.minDelay}–{w.maxDelay} seconds (at most {w.dailyLimit} promotions a day — the rest continue tomorrow). You can cancel what
          hasn&apos;t been sent yet from the Messages tab.
        </p>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------- birthdays

function Birthdays() {
  const settings = useStore((s) => s.settings);
  const w = whatsappSettings(settings);
  const [days, setDays] = useState("30");
  const [list, setList] = useState<UpcomingBirthday[] | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setList(await call<UpcomingBirthday[]>(`/api/whatsapp/birthdays?days=${days}`));
    } catch (e) {
      toast(errText(e), "err");
    }
  }, [days]);
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    return () => clearTimeout(first);
  }, [load]);

  const sendable = (b: UpcomingBirthday) => !b.optOut && !b.wished;
  const send = async (ids: string[]) => {
    if (!ids.length) return;
    setBusy(true);
    try {
      const r = await call<{ result: { queued: number; skipped: string[] } }>("/api/whatsapp/birthdays", { body: { childIds: ids } });
      toast(`${r.result.queued} birthday wish(es) queued${r.result.skipped.length ? ` · ${r.result.skipped.length} skipped` : ""}`);
      setSel([]);
      await load();
    } catch (e) {
      toast(errText(e), "err");
    } finally {
      setBusy(false);
    }
  };
  const todays = (list ?? []).filter((b) => b.inDays === 0 && sendable(b));

  return (
    <Card
      pad={false}
      title={<span className="flex items-center gap-2"><Cake size={17} /> Upcoming birthdays</span>}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Select className="h-9 w-40" value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="0">Today</option>
            <option value="7">Next 7 days</option>
            <option value="30">Next 30 days</option>
            <option value="90">Next 3 months</option>
          </Select>
          <Button size="sm" variant="secondary" disabled={busy || !todays.length} onClick={() => send(todays.map((b) => b.childId))}>Wish all today ({todays.length})</Button>
          <Button size="sm" icon={<Send size={14} />} disabled={busy || !sel.length} onClick={() => send(sel)}>Send to selected ({sel.length})</Button>
        </div>
      }
    >
      <p className="border-b border-line px-5 py-2.5 text-xs text-muted">
        {w.birthdayAuto ? `Automatic wishes are on — today's birthdays are sent at ${w.birthdayTime}.` : "Automatic wishes are off (WhatsApp → Settings). Send them from here."} Each child is wished once a year.
      </p>
      {list === null ? (
        <p className="p-6 text-sm text-muted">Loading…</p>
      ) : list.length === 0 ? (
        <Empty title="No birthdays in this period" hint="Children's dates of birth come from the customer profiles." />
      ) : (
        <Table head={["", "Child", "Turns", "Birthday", "Guardian", "Phone", "Status"]}>
          {list.map((b) => (
            <tr key={b.childId} className={cx(!sendable(b) && "opacity-70")}>
              <td>
                <input type="checkbox" disabled={!sendable(b)} checked={sel.includes(b.childId)} onChange={(e) => setSel(e.target.checked ? [...sel, b.childId] : sel.filter((x) => x !== b.childId))} />
              </td>
              <td className="font-bold">{b.child}</td>
              <td className="tabular">{b.age}</td>
              <td className="tabular">{fmtDate(b.date, "EEE d MMM")} {b.inDays === 0 ? <Badge tone="rose">Today</Badge> : <span className="text-xs text-muted">in {b.inDays} day{b.inDays === 1 ? "" : "s"}</span>}</td>
              <td>{b.guardian}</td>
              <td className="tabular text-muted">{b.phone}</td>
              <td>{b.optOut ? <Badge tone="gray">Opted out</Badge> : b.wished === "sent" ? <Badge tone="mint">Wished</Badge> : b.wished ? <Badge tone="sky">Queued</Badge> : <span className="text-xs text-muted">—</span>}</td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- message log

const KIND: Record<WaMessage["kind"], [Tone, string]> = {
  checkin: ["sky", "Check-in"],
  receipt: ["teal", "Receipt"],
  birthday: ["rose", "Birthday"],
  promotion: ["lilac", "Promotion"],
  manual: ["gray", "Message"],
  staff: ["sun", "Staff alert"],
};
const STATUS: Record<WaMessage["status"], Tone> = { queued: "sky", sending: "sun", sent: "mint", failed: "rose", cancelled: "gray" };

function Messages() {
  const [status, setStatus] = useState<"" | WaMessage["status"]>("");
  const [list, setList] = useState<WaMessage[] | null>(null);
  const [open, setOpen] = useState<WaMessage | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await call<WaMessage[]>(`/api/whatsapp/messages?limit=300${status ? `&status=${status}` : ""}`));
    } catch (e) {
      toast(errText(e), "err");
    }
  }, [status]);
  useEffect(() => {
    const first = setTimeout(() => void load(), 0);
    const t = setInterval(load, 5000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [load]);

  const bulk = async (action: "retry" | "cancel") => {
    try {
      const r = await call<{ result: { count: number } }>("/api/whatsapp/messages", { body: { action } });
      toast(`${r.result.count} message(s) ${action === "retry" ? "queued again" : "cancelled"}`);
      await load();
    } catch (e) {
      toast(errText(e), "err");
    }
  };
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    (list ?? []).forEach((m) => (c[m.status] = (c[m.status] ?? 0) + 1));
    return c;
  }, [list]);

  return (
    <Card
      pad={false}
      title={<span className="flex items-center gap-2"><MessageCircle size={17} /> Messages</span>}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            value={status}
            onChange={setStatus}
            items={[
              { value: "", label: "All" },
              { value: "queued", label: "Queued" },
              { value: "sent", label: "Sent" },
              { value: "failed", label: "Failed" },
              { value: "cancelled", label: "Cancelled" },
            ]}
          />
          {status === "failed" && <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} disabled={!counts.failed} onClick={() => bulk("retry")}>Retry all failed</Button>}
          {status === "queued" && <Button size="sm" variant="danger" disabled={!counts.queued} onClick={() => bulk("cancel")}>Cancel all queued</Button>}
        </div>
      }
    >
      {list === null ? (
        <p className="p-6 text-sm text-muted">Loading…</p>
      ) : list.length === 0 ? (
        <Empty title="No messages yet" hint="Check-in tickets, receipts, birthday wishes and promotions appear here." />
      ) : (
        <Table head={["Time", "Type", "To", "Message", "Status"]}>
          {list.map((m) => (
            <tr key={m.id} className="cursor-pointer" onClick={() => setOpen(m)}>
              <td className="whitespace-nowrap tabular text-muted">{fmtDT(m.sentAt ?? m.createdAt)}</td>
              <td><Badge tone={KIND[m.kind][0]}>{KIND[m.kind][1]}</Badge></td>
              <td>
                <div className="font-semibold">{m.customerName ?? "—"}</div>
                <div className="text-xs text-muted">{m.toPhone === "self" ? "This WhatsApp" : `+${m.toPhone}`}</div>
              </td>
              <td className="max-w-[360px] truncate text-muted">{m.campaign && <b className="text-ink">{m.campaign} · </b>}{m.body.split("\n")[0]}</td>
              <td>
                <Badge tone={STATUS[m.status]}><span className="capitalize">{m.status}</span></Badge>
                {m.error && <div className="mt-0.5 max-w-[220px] truncate text-[11px] text-[#c24f69]">{m.error}</div>}
              </td>
            </tr>
          ))}
        </Table>
      )}
      {open && (
        <Modal open onClose={() => setOpen(null)} title={`${KIND[open.kind][1]} · ${open.toPhone === "self" ? "This WhatsApp" : `+${open.toPhone}`}`}>
          <div className="rounded-2xl bg-[#e7ddd3] p-4">
            <div className="ml-auto max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-[#d9fdd3] px-3 py-2 text-sm shadow-sm">{open.body}</div>
          </div>
          <div className="mt-3 text-xs text-muted">
            Created {fmtDT(open.createdAt)}{open.sentAt && ` · sent ${fmtDT(open.sentAt)}`} · {open.attempts} attempt(s){open.error && ` · ${open.error}`}
          </div>
        </Modal>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------- settings

function Settings() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const [f, setF] = useState<WhatsAppSettings>(() => whatsappSettings(settings));
  const set = <K extends keyof WhatsAppSettings>(k: K, v: WhatsAppSettings[K]) => setF({ ...f, [k]: v });

  const save = async () => {
    if (f.minDelay < 2 || f.maxDelay < f.minDelay) return toast("Pause between messages: at least 2 seconds, and max ≥ min", "err");
    const numbers = f.staffAlertNumbers.map((n) => n.trim()).filter(Boolean);
    const bad = numbers.find((n) => !normalizePhone(n, f.countryCode));
    if (bad) return toast(`“${bad}” isn't a valid WhatsApp number`, "err");
    if (await setSettings({ whatsapp: { ...f, staffAlertNumbers: numbers } }, "WhatsApp settings updated")) toast("WhatsApp settings saved");
  };

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card title="Automatic messages">
        <div className="space-y-3">
          <Toggle checked={f.sendCheckIn} onChange={(v) => set("sendCheckIn", v)} label={<span><b>Check-in ticket</b> — welcome message with the entry QR</span>} />
          <Toggle checked={f.sendReceipt} onChange={(v) => set("sendReceipt", v)} label={<span><b>Check-out receipt</b> — the visit receipt</span>} />
          <Toggle checked={f.birthdayAuto} onChange={(v) => set("birthdayAuto", v)} label={<span><b>Birthday wishes</b> — every morning for that day&apos;s birthdays</span>} />
          {f.birthdayAuto && (
            <Field label="Send birthday wishes at" className="pl-14"><Input type="time" className="w-40" value={f.birthdayTime} onChange={(e) => set("birthdayTime", e.target.value)} /></Field>
          )}
        </div>
      </Card>
      <Card title="Staff alerts">
        <div className="space-y-3">
          <Toggle checked={f.staffBooking} onChange={(v) => set("staffBooking", v)} label={<span><b>New online booking request</b></span>} />
          <Toggle checked={f.staffRefundRequest} onChange={(v) => set("staffRefundRequest", v)} label={<span><b>Refund waiting for approval</b></span>} />
          <Toggle checked={f.staffRefundDecision} onChange={(v) => set("staffRefundDecision", v)} label={<span><b>Refund approved / rejected</b></span>} />
        </div>
        <div className="mt-4 border-t border-dashed border-line pt-4">
          <div className="mb-2 text-sm font-bold">Send alerts to these WhatsApp numbers</div>
          <div className="space-y-2">
            {f.staffAlertNumbers.map((n, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  placeholder="e.g. 077 123 4567"
                  inputMode="tel"
                  value={n}
                  onChange={(e) => set("staffAlertNumbers", f.staffAlertNumbers.map((x, j) => (j === i ? e.target.value : x)))}
                  className={cx(n.trim() && !normalizePhone(n, f.countryCode) && "border-[#e0607b]")}
                />
                <Button variant="ghost" size="sm" title="Remove" onClick={() => set("staffAlertNumbers", f.staffAlertNumbers.filter((_, j) => j !== i))}>
                  <Trash2 size={15} />
                </Button>
              </div>
            ))}
          </div>
          <Button variant="secondary" size="sm" className="mt-2" icon={<Plus size={14} />} onClick={() => set("staffAlertNumbers", [...f.staffAlertNumbers, ""])}>
            Add number
          </Button>
          <p className="mt-2 text-xs text-muted">
            {f.staffAlertNumbers.some((n) => n.trim())
              ? "Each alert goes to every number above. Save settings to apply."
              : "No numbers yet — alerts go to this business’s own WhatsApp (the linked number), in its “Message yourself” chat."}
          </p>
        </div>
      </Card>
      <Card title="Sending pace">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Pause between promotions — min (s)"><Input type="number" min={2} value={f.minDelay} onChange={(e) => set("minDelay", Number(e.target.value))} /></Field>
          <Field label="max (s)"><Input type="number" min={2} value={f.maxDelay} onChange={(e) => set("maxDelay", Number(e.target.value))} /></Field>
          <Field label="Promotions + birthday wishes per day"><Input type="number" min={1} value={f.dailyLimit} onChange={(e) => set("dailyLimit", Number(e.target.value))} /></Field>
          <Field label="Country code for local numbers" hint="07X XXX XXXX → +94 7X XXX XXXX"><Input value={f.countryCode} onChange={(e) => set("countryCode", e.target.value.replace(/\D/g, ""))} /></Field>
        </div>
        <p className="mt-3 text-xs text-muted">Check-in messages and receipts don&apos;t wait and don&apos;t count towards the daily limit.</p>
      </Card>
      <Card title="Message templates" className="xl:col-span-2">
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Check-in message (sent with the QR image)" hint={PLACEHOLDERS.checkIn.join(" ")}><Textarea rows={4} value={f.checkInTemplate} onChange={(e) => set("checkInTemplate", e.target.value)} /></Field>
          <Field label="Birthday wish" hint={PLACEHOLDERS.birthday.join(" ")}><Textarea rows={4} value={f.birthdayTemplate} onChange={(e) => set("birthdayTemplate", e.target.value)} /></Field>
          <Field label="Line added under every promotion" hint="Tell people how to stop — replies of STOP are opted out automatically"><Input value={f.promoFooter} onChange={(e) => set("promoFooter", e.target.value)} /></Field>
        </div>
        <p className="mt-3 text-xs text-muted">The check-out receipt uses the same lines as the printed receipt, plus the receipt footer from Settings.</p>
      </Card>
      <div className="flex justify-end xl:col-span-2">
        <Button onClick={save}>Save WhatsApp settings</Button>
      </div>
    </div>
  );
}
