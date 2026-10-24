"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Star, Trash2, X } from "lucide-react";
import { useStore } from "@/lib/store";
import type { Child, Customer } from "@/lib/types";
import { ageOf, cx, money, uid } from "@/lib/utils";
import { Button, Field, Input, Select, Toggle, toast } from "./ui";

export function CustomerPicker({ value, onChange }: { value?: string; onChange: (id: string | undefined) => void }) {
  const customers = useStore((s) => s.customers);
  const children = useStore((s) => s.children);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const selected = customers.find((c) => c.id === value);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return customers
      .filter((c) => c.name.toLowerCase().includes(s) || c.phone.includes(s) || children.some((k) => k.guardianId === c.id && k.name.toLowerCase().includes(s)))
      .slice(0, 6);
  }, [q, customers, children]);

  if (selected) {
    const kids = children.filter((k) => k.guardianId === selected.id);
    return (
      <div className="flex items-start justify-between gap-3 rounded-xl border border-sky bg-sky-soft/60 p-3">
        <div>
          <div className="flex items-center gap-2 font-bold">
            {selected.name}
            {selected.member && (
              <span className="inline-flex items-center gap-1 rounded-full bg-sun-soft px-2 py-0.5 text-[11px] text-[#8a6510]">
                <Star size={11} fill="currentColor" /> Member
              </span>
            )}
          </div>
          <div className="text-xs text-muted">
            {selected.phone} · {selected.points} pts · wallet {money(selected.wallet)}
          </div>
          <div className="mt-1 text-xs text-ink/70">{kids.map((k) => `${k.name.split(" ")[0]} (${ageOf(k.dob)})`).join(", ") || "No children on file"}</div>
        </div>
        <button onClick={() => onChange(undefined)} className="rounded-lg p-1 text-muted hover:bg-white">
          <X size={16} />
        </button>
      </div>
    );
  }

  if (adding) return <NewCustomer onDone={(id) => { setAdding(false); onChange(id); }} onCancel={() => setAdding(false)} initialName={q} />;

  return (
    <div>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <Input className="pl-9" placeholder="Search guardian name, phone or child's name" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        </div>
        <Button variant="secondary" icon={<Plus size={16} />} onClick={() => setAdding(true)}>
          New family
        </Button>
      </div>
      {results.length > 0 && (
        <div className="mt-2 divide-y divide-[#f2eee6] rounded-xl border border-line bg-white">
          {results.map((c) => (
            <button key={c.id} onClick={() => onChange(c.id)} className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-[#faf7f1]">
              <div>
                <div className="text-sm font-bold">{c.name}</div>
                <div className="text-xs text-muted">{children.filter((k) => k.guardianId === c.id).map((k) => k.name.split(" ")[0]).join(", ")}</div>
              </div>
              <span className="text-xs text-muted tabular">{c.phone}</span>
            </button>
          ))}
        </div>
      )}
      {q && results.length === 0 && <p className="mt-2 text-sm text-muted">No match. Add them as a new family.</p>}
    </div>
  );
}

export function NewCustomer({ onDone, onCancel, initialName = "" }: { onDone: (id: string) => void; onCancel: () => void; initialName?: string }) {
  const save = useStore((s) => s.save);
  const [c, setC] = useState({ name: initialName, phone: "", email: "", member: false });
  const [kids, setKids] = useState<{ name: string; dob: string; gender: Child["gender"] }[]>([{ name: "", dob: "", gender: "girl" }]);
  const submit = () => {
    if (!c.name.trim() || !/^0\d{9}$/.test(c.phone.replace(/\s/g, ""))) return toast("Enter a name and a 10-digit phone number", "err");
    const id = uid("c");
    const cust: Customer = { id, name: c.name.trim(), phone: c.phone.replace(/\s/g, ""), email: c.email, address: "", member: c.member, points: 0, wallet: 0, notes: "", createdAt: new Date().toISOString() };
    save("customers", cust, "Customers", `New guardian ${cust.name}`);
    kids
      .filter((k) => k.name.trim() && k.dob)
      .forEach((k) => save("children", { id: uid("k"), guardianId: id, name: k.name.trim(), dob: k.dob, gender: k.gender, allergies: "" }, "Customers", `Child ${k.name} linked to ${cust.name}`));
    toast("Family added");
    onDone(id);
  };
  return (
    <div className="space-y-3 rounded-xl border border-line bg-[#fdfbf7] p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Guardian name">
          <Input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} autoFocus />
        </Field>
        <Field label="Mobile">
          <Input value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} placeholder="07X XXX XXXX" />
        </Field>
        <Field label="Email (optional)">
          <Input value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} />
        </Field>
        <div className="flex items-end pb-2">
          <Toggle checked={c.member} onChange={(v) => setC({ ...c, member: v })} label="Playroom member" />
        </div>
      </div>
      <div>
        <div className="mb-1 text-[13px] font-bold text-ink/80">Children</div>
        {kids.map((k, i) => (
          <div key={i} className="mb-2 grid grid-cols-[1fr_150px_100px_32px] gap-2">
            <Input placeholder="Child's name" value={k.name} onChange={(e) => setKids(kids.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <Input type="date" value={k.dob} onChange={(e) => setKids(kids.map((x, j) => (j === i ? { ...x, dob: e.target.value } : x)))} />
            <Select value={k.gender} onChange={(e) => setKids(kids.map((x, j) => (j === i ? { ...x, gender: e.target.value as Child["gender"] } : x)))}>
              <option value="girl">Girl</option>
              <option value="boy">Boy</option>
              <option value="other">Other</option>
            </Select>
            <button onClick={() => setKids(kids.filter((_, j) => j !== i))} className="grid place-items-center rounded-lg text-muted hover:bg-rose-soft hover:text-[#c24f69]">
              <Trash2 size={15} />
            </button>
          </div>
        ))}
        <button onClick={() => setKids([...kids, { name: "", dob: "", gender: "boy" }])} className="text-sm font-bold text-navy hover:underline">
          + Add another child
        </button>
      </div>
      <div className={cx("flex justify-end gap-2")}>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button onClick={submit}>Save family</Button>
      </div>
    </div>
  );
}
